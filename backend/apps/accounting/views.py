"""Accounts API.

Access (approved role matrix):
  Owner / Accountant   everything
  Manager              quotations (create, edit, send, convert); read-only invoices, receipts,
                       expenses, ledgers and vouchers; no financial reports
  Staff                no access
"""

import datetime
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from django_filters import rest_framework as filters
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role
from apps.core.numbering import financial_year
from apps.core.permissions import RoleAccess
from apps.crm.models import Booking

from . import calc, exports, reports, services
from . import serializers as s
from .models import (
    AccountGroup,
    CompanyProfile,
    Expense,
    Invoice,
    JournalEntry,
    Ledger,
    Quotation,
    Receipt,
    ReceiptAllocation,
    TaxRate,
)
from .states import GST_STATES

ACCOUNTS = (Role.OWNER, Role.ACCOUNTANT)
VIEWERS = (Role.OWNER, Role.ACCOUNTANT, Role.MANAGER)
QUOTERS = (Role.OWNER, Role.ACCOUNTANT, Role.MANAGER)


def run(fn, *args, **kwargs):
    """Calls a service, turning Django ValidationErrors into 400 responses."""
    try:
        return fn(*args, **kwargs)
    except DjangoValidationError as exc:
        raise ValidationError(exc.message_dict if hasattr(exc, "error_dict") else exc.messages)


def date_param(request, name, default):
    value = request.query_params.get(name)
    if not value:
        return default
    parsed = parse_date(value)
    if not parsed:
        raise ValidationError({name: "Use YYYY-MM-DD."})
    return parsed


def fy_start(today=None):
    today = today or timezone.localdate()
    return datetime.date(today.year if today.month >= 4 else today.year - 1, 4, 1)


class AccountsAccess:
    permission_classes = [RoleAccess]
    read_roles = VIEWERS
    write_roles = ACCOUNTS


# --- Settings ------------------------------------------------------------------------------


class CompanySettingsView(AccountsAccess, APIView):
    def get(self, request):
        data = s.CompanyProfileSerializer(CompanyProfile.load()).data
        return Response({**data, "states": [{"code": c, "name": n} for c, n in GST_STATES]})

    def patch(self, request):
        serializer = s.CompanyProfileSerializer(CompanyProfile.load(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class TaxRateViewSet(AccountsAccess, viewsets.ModelViewSet):
    queryset = TaxRate.objects.all()
    serializer_class = s.TaxRateSerializer
    pagination_class = None
    http_method_names = ["get", "post", "patch", "head", "options"]  # deactivate, don't delete


class AccountGroupViewSet(AccountsAccess, mixins.CreateModelMixin, viewsets.ReadOnlyModelViewSet):
    queryset = AccountGroup.objects.select_related("parent")
    serializer_class = s.AccountGroupSerializer
    pagination_class = None


# --- Ledgers -------------------------------------------------------------------------------------


class LedgerViewSet(AccountsAccess, viewsets.ModelViewSet):
    serializer_class = s.LedgerSerializer
    filterset_fields = ["group", "is_active", "client", "vendor"]
    search_fields = ["name", "gstin"]
    pagination_class = None

    def get_queryset(self):
        qs = Ledger.objects.select_related("group").order_by("group__order", "name")
        kind = self.request.query_params.get("kind")
        if kind == "cash_bank":
            qs = qs.filter(group__name__in=services.CASH_BANK_GROUPS, is_active=True)
        elif kind == "expense":
            qs = qs.filter(Q(group__nature=AccountGroup.Nature.EXPENSE) | Q(group__name="Fixed Assets"), is_active=True).exclude(system_code="ROUND_OFF")
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.action in ("list", "retrieve"):
            ctx["balances"] = reports.closing_balances()
        return ctx

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    def perform_destroy(self, instance):
        if instance.system_code or instance.client_id or instance.vendor_id:
            raise ValidationError("System, client and vendor ledgers can't be deleted. Mark them inactive instead.")
        if instance.lines.exists():
            raise ValidationError("This ledger has entries. Mark it inactive instead.")
        instance.delete()

    @action(detail=True, methods=["get"])
    def statement(self, request, pk=None):
        ledger = self.get_object()
        date_from = date_param(request, "from", fy_start())
        date_to = date_param(request, "to", timezone.localdate())
        data = reports.ledger_statement(ledger, date_from, date_to)
        if request.query_params.get("export") == "xlsx":
            rows = [["", "Opening balance", "", "", "", "", "", f"{data['opening']['amount']} {data['opening']['side']}"]]
            rows += [
                [r["date"].strftime("%d-%m-%Y"), r["particulars"], r["voucher_type"], r["number"], r["narration"], r["debit"] or "", r["credit"] or "", f"{r['balance']['amount']} {r['balance']['side']}"]
                for r in data["rows"]
            ]
            return exports.xlsx_response(
                f"Ledger-{ledger.name}-{date_from}-{date_to}",
                f"Ledger: {ledger.name}",
                f"{date_from:%d %b %Y} to {date_to:%d %b %Y}",
                ["Date", "Particulars", "Voucher", "No.", "Narration", "Debit", "Credit", "Balance"],
                rows,
                ["", "Closing balance", "", "", "", data["total_debit"], data["total_credit"], f"{data['closing']['amount']} {data['closing']['side']}"],
            )
        return Response(data)


# --- Quotations --------------------------------------------------------------------------------------


class SalesDocFilter(filters.FilterSet):
    date_from = filters.DateFilter(method="filter_from")
    date_to = filters.DateFilter(method="filter_to")

    date_field = "date"

    def filter_from(self, qs, name, value):
        return qs.filter(**{f"{self.date_field}__gte": value})

    def filter_to(self, qs, name, value):
        return qs.filter(**{f"{self.date_field}__lte": value})


class QuotationFilter(SalesDocFilter):
    class Meta:
        model = Quotation
        fields = ["status", "client", "booking", "lead"]


class QuotationViewSet(viewsets.ModelViewSet):
    permission_classes = [RoleAccess]
    read_roles = VIEWERS
    write_roles = QUOTERS
    serializer_class = s.QuotationSerializer
    filterset_class = QuotationFilter
    search_fields = ["number", "client__name", "client__phone", "booking__title"]
    ordering_fields = ["date", "total", "number"]

    def get_queryset(self):
        return Quotation.objects.select_related("client", "booking").prefetch_related("items")

    def perform_create(self, serializer):
        data = dict(serializer.validated_data)
        items = data.pop("items")
        serializer.instance = run(services.save_quotation, items=items, user=self.request.user, **data)

    def perform_update(self, serializer):
        data = dict(serializer.validated_data)
        items = data.pop("items", None) or [dict(i) for i in services._items_of(serializer.instance)]
        serializer.instance = run(services.save_quotation, items=items, user=self.request.user, instance=serializer.instance, **data)

    def perform_destroy(self, instance):
        if instance.status != Quotation.Status.DRAFT:
            raise ValidationError("Only draft quotations can be deleted. Mark it rejected instead.")
        instance.delete()

    @action(detail=True, methods=["post"], url_path="set-status")
    def set_status(self, request, pk=None):
        quotation = self.get_object()
        new = request.data.get("status")
        if new not in (Quotation.Status.SENT, Quotation.Status.ACCEPTED, Quotation.Status.REJECTED, Quotation.Status.DRAFT):
            raise ValidationError({"status": "Choose sent, accepted, rejected or draft."})
        if quotation.status == Quotation.Status.INVOICED:
            raise ValidationError("This quotation has already been invoiced.")
        quotation.status = new
        quotation.updated_by = request.user
        quotation.save(update_fields=["status", "updated_by", "updated_at"])
        return Response(self.get_serializer(quotation).data)

    @action(detail=True, methods=["post"])
    def convert(self, request, pk=None):
        invoice = run(services.quotation_to_invoice, self.get_object(), user=request.user)
        return Response(s.InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        q = self.get_object()
        return exports.pdf_response("pdf/document.html", exports.document_context(q, "quotation"), q.number.replace("/", "-"))


# --- Invoices ------------------------------------------------------------------------------------------


class InvoiceFilter(SalesDocFilter):
    date_field = "invoice_date"
    open = filters.BooleanFilter(method="filter_open")
    overdue = filters.BooleanFilter(method="filter_overdue")

    class Meta:
        model = Invoice
        fields = ["status", "client", "booking"]

    def filter_open(self, qs, name, value):
        return qs.filter(status__in=Invoice.OPEN_STATUSES) if value else qs

    def filter_overdue(self, qs, name, value):
        return qs.filter(status__in=Invoice.OPEN_STATUSES, due_date__lt=timezone.localdate()) if value else qs


class InvoiceViewSet(AccountsAccess, viewsets.ModelViewSet):
    serializer_class = s.InvoiceSerializer
    filterset_class = InvoiceFilter
    search_fields = ["number", "client__name", "client__phone", "billing_name", "booking__title"]
    ordering_fields = ["invoice_date", "due_date", "total", "number"]

    def get_queryset(self):
        return Invoice.objects.select_related("client", "booking", "quotation").prefetch_related(
            "items", "allocations__receipt", "allocations__invoice"
        )

    def perform_create(self, serializer):
        data = dict(serializer.validated_data)
        items = data.pop("items")
        serializer.instance = run(services.save_invoice, items=items, user=self.request.user, **data)

    def perform_update(self, serializer):
        data = dict(serializer.validated_data)
        items = data.pop("items", None) or [dict(i) for i in services._items_of(serializer.instance)]
        serializer.instance = run(services.save_invoice, items=items, user=self.request.user, instance=serializer.instance, **data)

    def perform_destroy(self, instance):
        if instance.status != Invoice.Status.DRAFT:
            raise ValidationError("Issued invoices can't be deleted — cancel them instead (the number stays used).")
        instance.delete()

    @action(detail=True, methods=["post"])
    def issue(self, request, pk=None):
        invoice = run(services.issue_invoice, self.get_object(), user=request.user)
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        invoice = run(services.cancel_invoice, self.get_object(), reason=request.data.get("reason", ""), user=request.user)
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        inv = self.get_object()
        name = (inv.number or f"draft-{inv.pk}").replace("/", "-")
        return exports.pdf_response("pdf/document.html", exports.document_context(inv, "invoice"), name)


# --- Receipts -----------------------------------------------------------------------------------------


class ReceiptFilter(SalesDocFilter):
    class Meta:
        model = Receipt
        fields = ["client", "mode", "is_cancelled", "booking", "deposit_to"]


class ReceiptViewSet(AccountsAccess, mixins.CreateModelMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = s.ReceiptSerializer
    filterset_class = ReceiptFilter
    search_fields = ["number", "client__name", "client__phone", "reference"]
    ordering_fields = ["date", "amount", "number"]

    def get_queryset(self):
        return Receipt.objects.select_related("client", "deposit_to", "booking").prefetch_related("allocations__invoice", "allocations__receipt")

    def perform_create(self, serializer):
        data = dict(serializer.validated_data)
        apply_to = [(a["invoice"], a["amount"]) for a in data.pop("apply_to", [])]
        serializer.instance = run(services.create_receipt, allocations=apply_to, user=self.request.user, **data)

    @action(detail=True, methods=["post"])
    def allocate(self, request, pk=None):
        body = s.AllocationInputSerializer(data=request.data.get("apply_to", []), many=True)
        body.is_valid(raise_exception=True)
        receipt = run(services.allocate_receipt, self.get_object(), [(a["invoice"], a["amount"]) for a in body.validated_data])
        return Response(self.get_serializer(self.get_queryset().get(pk=receipt.pk)).data)  # re-read: allocations changed

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        receipt = run(services.cancel_receipt, self.get_object(), user=request.user)
        return Response(self.get_serializer(self.get_queryset().get(pk=receipt.pk)).data)

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        r = self.get_object()
        allocations = list(r.allocations.select_related("invoice"))
        return exports.pdf_response(
            "pdf/receipt.html",
            {"receipt": r, "allocations": allocations, "unapplied": r.amount - r.allocated, "amount_words": calc.amount_in_words(r.amount)},
            r.number.replace("/", "-"),
        )


# --- Expenses -------------------------------------------------------------------------------------------


class ExpenseFilter(SalesDocFilter):
    class Meta:
        model = Expense
        fields = ["expense_ledger", "vendor", "booking", "is_cancelled", "paid_from"]


class ExpenseViewSet(AccountsAccess, mixins.CreateModelMixin, mixins.UpdateModelMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = s.ExpenseSerializer
    filterset_class = ExpenseFilter
    search_fields = ["number", "description", "bill_number", "vendor__name"]
    ordering_fields = ["date", "total", "number"]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        return Expense.objects.select_related("expense_ledger", "paid_from", "vendor", "booking")

    def perform_create(self, serializer):
        serializer.instance = run(services.save_expense, user=self.request.user, **serializer.validated_data)

    def perform_update(self, serializer):
        serializer.instance = run(services.save_expense, user=self.request.user, instance=serializer.instance, **serializer.validated_data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        expense = run(services.cancel_expense, self.get_object(), user=request.user)
        return Response(self.get_serializer(expense).data)


# --- Vouchers / day book -----------------------------------------------------------------------------------


class VoucherFilter(filters.FilterSet):
    date_from = filters.DateFilter(field_name="date", lookup_expr="gte")
    date_to = filters.DateFilter(field_name="date", lookup_expr="lte")
    ledger = filters.NumberFilter(field_name="lines__ledger", distinct=True)

    class Meta:
        model = JournalEntry
        fields = ["voucher_type", "is_manual", "is_cancelled"]


class VoucherViewSet(AccountsAccess, mixins.CreateModelMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = s.JournalEntrySerializer
    filterset_class = VoucherFilter
    search_fields = ["number", "narration"]

    def get_queryset(self):
        return JournalEntry.objects.prefetch_related("lines__ledger").select_related("invoice", "receipt", "expense").order_by("-date", "-id")

    def perform_create(self, serializer):
        data = serializer.validated_data
        lines = [(l["ledger"], l.get("debit") or 0, l.get("credit") or 0, l.get("note", "")) for l in data["lines"]]
        serializer.instance = run(
            services.create_voucher,
            voucher_type=data["voucher_type"], date=data["date"], narration=data.get("narration", ""), lines=lines, user=self.request.user,
        )

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        entry = self.get_object()
        if not entry.is_manual:
            raise ValidationError("This entry was posted by a document — cancel the invoice, receipt or expense instead.")
        services.cancel_entry(entry)
        return Response(self.get_serializer(entry).data)


# --- Reports ------------------------------------------------------------------------------------------------


class ReportView(APIView):
    """GET /accounts/reports/<name>/?from=&to=&as_of=&export=xlsx"""

    permission_classes = [RoleAccess]
    read_roles = ACCOUNTS

    def get(self, request, name):
        today = timezone.localdate()
        date_from = date_param(request, "from", fy_start(today))
        date_to = date_param(request, "to", today)
        as_of = date_param(request, "as_of", today)
        export = request.query_params.get("export") == "xlsx"
        handler = {
            "trial-balance": self.trial_balance,
            "profit-loss": self.profit_loss,
            "balance-sheet": self.balance_sheet,
            "gst": self.gst,
            "receivables": self.receivables,
            "payables": self.payables,
            "day-book": self.day_book,
        }.get(name)
        if handler is None:
            raise ValidationError({"report": "Unknown report."})
        return handler(date_from=date_from, date_to=date_to, as_of=as_of, export=export)

    def trial_balance(self, as_of, export, **_):
        data = reports.trial_balance(as_of)
        if not export:
            return Response(data)
        rows = []
        for g in data["groups"]:
            rows.append([g["group"], "", ""])
            rows += [[f"    {l['name']}", l["debit"] or "", l["credit"] or ""] for l in g["ledgers"]]
        return exports.xlsx_response(f"Trial-balance-{as_of}", "Trial balance", f"As on {as_of:%d %b %Y}", ["Particulars", "Debit", "Credit"], rows, ["Total", data["total_debit"], data["total_credit"]])

    def profit_loss(self, date_from, date_to, export, **_):
        data = reports.profit_and_loss(date_from, date_to)
        if not export:
            return Response(data)
        rows = [["Sales", data["sales"]["total"]]] + [[f"    {l['name']}", l["amount"]] for l in data["sales"]["ledgers"]]
        rows += [["Less: Direct expenses", data["direct_expenses"]["total"]]] + [[f"    {l['name']}", l["amount"]] for l in data["direct_expenses"]["ledgers"]]
        rows += [["Gross profit", data["gross_profit"]]]
        for g in data["other_income"]:
            rows += [[f"Add: {g['group']}", g["total"]]] + [[f"    {l['name']}", l["amount"]] for l in g["ledgers"]]
        for g in data["indirect_expenses"]:
            rows += [[f"Less: {g['group']}", g["total"]]] + [[f"    {l['name']}", l["amount"]] for l in g["ledgers"]]
        return exports.xlsx_response(f"Profit-loss-{date_from}-{date_to}", "Profit & loss", f"{date_from:%d %b %Y} to {date_to:%d %b %Y}", ["Particulars", "Amount"], rows, ["Net profit", data["net_profit"]])

    def balance_sheet(self, as_of, export, **_):
        data = reports.balance_sheet(as_of)
        if not export:
            return Response(data)
        rows = [["LIABILITIES", ""]]
        for g in data["liabilities"]:
            rows += [[g["group"], g["total"]]] + [[f"    {l['name']}", l["amount"]] for l in g["ledgers"]]
        rows += [["Profit & Loss A/c", data["profit_and_loss"]], ["Total liabilities", data["total_liabilities"]], ["", ""], ["ASSETS", ""]]
        for g in data["assets"]:
            rows += [[g["group"], g["total"]]] + [[f"    {l['name']}", l["amount"]] for l in g["ledgers"]]
        return exports.xlsx_response(f"Balance-sheet-{as_of}", "Balance sheet", f"As on {as_of:%d %b %Y}", ["Particulars", "Amount"], rows, ["Total assets", data["total_assets"]])

    def gst(self, date_from, date_to, export, **_):
        data = reports.gst_summary(date_from, date_to)
        if not export:
            return Response(data)
        rows = [[r["type"], r["number"], r["date"].strftime("%d-%m-%Y"), r["party"], r["gstin"], r["place_of_supply"], r["taxable"], r["cgst"], r["sgst"], r["igst"], r["total"]] for r in data["outward"]]
        t = data["outward_totals"]
        return exports.xlsx_response(
            f"GST-sales-{date_from}-{date_to}", "GST — outward supplies", f"{date_from:%d %b %Y} to {date_to:%d %b %Y}",
            ["Type", "Invoice", "Date", "Party", "GSTIN", "Place of supply", "Taxable", "CGST", "SGST", "IGST", "Total"],
            rows, ["Total", "", "", "", "", "", t["taxable"], t["cgst"], t["sgst"], t["igst"], ""],
        )

    def receivables(self, as_of, export, **_):
        data = reports.receivables(as_of)
        if not export:
            return Response(data)
        rows = [[c["client"], c["phone"], c["not_due"], c["0_30"], c["31_60"], c["61_90"], c["90_plus"], c["total"]] for c in data["clients"]]
        t = data["totals"]
        return exports.xlsx_response(f"Receivables-{as_of}", "Outstanding receivables", f"As on {as_of:%d %b %Y}", ["Client", "Phone", "Not yet due", "1–30 days", "31–60 days", "61–90 days", "90+ days", "Total due"], rows, ["Total", "", t["not_due"], t["0_30"], t["31_60"], t["61_90"], t["90_plus"], t["total"]])

    def payables(self, as_of, export, **_):
        data = reports.payables(as_of)
        if not export:
            return Response(data)
        rows = [[v["vendor"], v["phone"], v["amount"]] for v in data["vendors"]]
        return exports.xlsx_response(f"Payables-{as_of}", "Outstanding payables", f"As on {as_of:%d %b %Y}", ["Vendor", "Phone", "We owe"], rows, ["Total", "", data["total"]])

    def day_book(self, date_from, date_to, export, **_):
        entries = reports.day_book(date_from, date_to)
        if not export:
            return Response(s.JournalEntrySerializer(entries, many=True).data)
        rows = []
        for e in entries:
            for l in e.lines.all():
                rows.append([e.date.strftime("%d-%m-%Y"), e.number, e.get_voucher_type_display(), l.ledger.name, l.debit or "", l.credit or "", e.narration])
        return exports.xlsx_response(f"Day-book-{date_from}-{date_to}", "Day book", f"{date_from:%d %b %Y} to {date_to:%d %b %Y}", ["Date", "Voucher", "Type", "Ledger", "Debit", "Credit", "Narration"], rows)


# --- Event money summary ------------------------------------------------------------------------------


class BookingFinanceView(APIView):
    """Quoted / invoiced / received / spent for one event — shown on the event page."""

    permission_classes = [RoleAccess]
    read_roles = VIEWERS

    def get(self, request, pk):
        booking = get_object_or_404(Booking, pk=pk)
        quotations = Quotation.objects.filter(booking=booking).order_by("-date", "-id")
        invoices = Invoice.objects.filter(booking=booking).exclude(status__in=[Invoice.Status.DRAFT, Invoice.Status.CANCELLED])
        expenses = Expense.objects.filter(booking=booking, is_cancelled=False)
        sums = invoices.aggregate(total=Sum("total"), taxable=Sum("taxable_total"), paid=Sum("amount_paid"))
        spent = expenses.aggregate(s=Sum("amount"))["s"] or Decimal("0")
        # Received = payments applied to this event's invoices + unapplied advances tagged to the event.
        # (A receipt split across two events must not be counted twice.)
        applied = ReceiptAllocation.objects.filter(invoice__booking=booking, receipt__is_cancelled=False).aggregate(s=Sum("amount"))["s"] or Decimal("0")
        advances = sum(
            (r.amount - r.allocated for r in Receipt.objects.filter(booking=booking, is_cancelled=False).prefetch_related("allocations")),
            Decimal("0"),
        )
        received = applied + advances
        taxable = sums["taxable"] or Decimal("0")
        return Response(
            {
                "quotations": [{"id": q.id, "number": q.number, "status": q.status, "status_label": q.get_status_display(), "total": q.total, "date": q.date} for q in quotations],
                "invoices": [{"id": i.id, "number": i.number, "status": i.status, "status_label": i.get_status_display(), "total": i.total, "balance_due": i.balance_due, "date": i.invoice_date} for i in invoices],
                "drafts": list(Invoice.objects.filter(booking=booking, status=Invoice.Status.DRAFT).values("id", "total")),
                "invoiced": sums["total"] or Decimal("0"),
                "received": received,
                "balance_due": (sums["total"] or Decimal("0")) - (sums["paid"] or Decimal("0")),
                "expenses": spent,
                # Margin on the pre-GST amounts — GST is collected for the government, not earned.
                "margin": taxable - spent if request.user.role in ACCOUNTS else None,
            }
        )


def finance_snapshot() -> dict:
    """Small set of numbers for the dashboard (Owner / Accountant)."""
    today = timezone.localdate()
    month_start = today.replace(day=1)
    open_invoices = Invoice.objects.filter(status__in=Invoice.OPEN_STATUSES)
    receivable = sum((i.balance_due for i in open_invoices), Decimal("0"))
    overdue = [i for i in open_invoices.filter(due_date__lt=today)]
    gst = reports.gst_summary(month_start, today)
    return {
        "financial_year": financial_year(today),
        "receivable": receivable,
        "overdue_count": len(overdue),
        "overdue_amount": sum((i.balance_due for i in overdue), Decimal("0")),
        "invoiced_this_month": Invoice.objects.filter(invoice_date__gte=month_start).exclude(status__in=[Invoice.Status.DRAFT, Invoice.Status.CANCELLED]).aggregate(s=Sum("total"))["s"] or Decimal("0"),
        "collected_this_month": Receipt.objects.filter(date__gte=month_start, is_cancelled=False).aggregate(s=Sum("amount"))["s"] or Decimal("0"),
        "gst_payable_this_month": sum(gst["net_payable"].values(), Decimal("0")),
        "draft_invoices": Invoice.objects.filter(status=Invoice.Status.DRAFT).count(),
    }
