"""Posting engine and document workflows. Every money movement goes through `post()`,
which refuses unbalanced entries — so the trial balance always agrees."""

import datetime
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.core.numbering import next_number
from apps.crm.models import Client
from apps.operations.models import Vendor

from . import calc
from .models import (
    ZERO,
    AccountGroup,
    CompanyProfile,
    Expense,
    Invoice,
    InvoiceItem,
    JournalEntry,
    JournalLine,
    Ledger,
    Quotation,
    QuotationItem,
    Receipt,
    ReceiptAllocation,
)

V = JournalEntry.VoucherType
CASH_BANK_GROUPS = ("Cash-in-Hand", "Bank Accounts")


# --- Ledgers -----------------------------------------------------------------------


def system_ledger(code: str) -> Ledger:
    return Ledger.objects.get(system_code=code)


def client_ledger(client: Client) -> Ledger:
    ledger = Ledger.objects.filter(client=client).first()
    if ledger:
        if ledger.gstin != client.gstin:
            ledger.gstin = client.gstin
            ledger.save(update_fields=["gstin"])
        return ledger
    return Ledger.objects.create(
        name=f"{client.name} ({client.phone[-10:]})",
        group=AccountGroup.objects.get(name="Sundry Debtors"),
        client=client,
        gstin=client.gstin,
    )


def vendor_ledger(vendor: Vendor) -> Ledger:
    ledger = Ledger.objects.filter(vendor=vendor).first()
    if ledger:
        return ledger
    return Ledger.objects.create(
        name=f"{vendor.name} ({vendor.phone[-10:]})",
        group=AccountGroup.objects.get(name="Sundry Creditors"),
        vendor=vendor,
        gstin=vendor.gstin,
    )


def is_cash_or_bank(ledger: Ledger) -> bool:
    parent = ledger.group.parent
    return ledger.group.name in CASH_BANK_GROUPS or (parent is not None and parent.name in CASH_BANK_GROUPS)


# --- Posting ---------------------------------------------------------------------------


Line = tuple[Ledger, Decimal | int, Decimal | int, str]  # ledger, debit, credit, note


def _clean_lines(lines: list[Line]) -> list[Line]:
    """Drops zero lines and turns negative amounts around (a negative credit is a debit),
    e.g. round-off that went down instead of up."""
    out = []
    for ledger, dr, cr, note in lines:
        net = calc.q(dr or 0) - calc.q(cr or 0)
        if net > 0:
            out.append((ledger, net, ZERO, note))
        elif net < 0:
            out.append((ledger, ZERO, -net, note))
    return out


def post(*, number: str, date: datetime.date, voucher_type: str, narration: str, lines: list[Line], user=None,
         is_manual=False, entry: JournalEntry | None = None) -> JournalEntry:
    """Creates (or rewrites, when `entry` is given) a balanced journal entry."""
    lines = _clean_lines(lines)
    if len(lines) < 2:
        raise ValidationError("A voucher needs at least one debit and one credit.")
    debit = sum((l[1] for l in lines), ZERO)
    credit = sum((l[2] for l in lines), ZERO)
    if debit != credit:
        raise ValidationError(f"Debits ({debit}) and credits ({credit}) don't match.")
    for ledger, *_ in lines:
        if not ledger.is_active:
            raise ValidationError(f"Ledger “{ledger.name}” is inactive.")

    if entry is None:
        entry = JournalEntry.objects.create(
            number=number, date=date, voucher_type=voucher_type, narration=narration,
            is_manual=is_manual, created_by=user, updated_by=user,
        )
    else:
        entry.number, entry.date, entry.narration, entry.updated_by = number, date, narration, user
        entry.save()
        entry.lines.all().delete()
    JournalLine.objects.bulk_create(
        [JournalLine(entry=entry, ledger=l, debit=dr, credit=cr, note=note) for l, dr, cr, note in lines]
    )
    return entry


def cancel_entry(entry: JournalEntry | None):
    if entry and not entry.is_cancelled:
        entry.is_cancelled = True
        entry.cancelled_at = timezone.now()
        entry.save(update_fields=["is_cancelled", "cancelled_at"])


# --- Sales documents ----------------------------------------------------------------------


def _intra_state(place_of_supply: str) -> bool:
    return place_of_supply == CompanyProfile.load().state_code


def _write_items(doc, item_model, fk: str, items: list[dict]):
    if not items:
        raise ValidationError({"items": "Add at least one line."})
    try:
        totals = calc.compute_document(items, intra_state=_intra_state(doc.place_of_supply))
    except ValueError as exc:
        raise ValidationError({"items": str(exc)})
    item_model.objects.filter(**{fk: doc}).delete()
    item_model.objects.bulk_create(
        [
            item_model(
                **{fk: doc},
                description=i["description"],
                sac=i.get("sac", ""),
                quantity=i["quantity"],
                unit=i.get("unit", "Nos"),
                rate=i["rate"],
                discount=i.get("discount") or 0,
                tax_rate=i["tax_rate"],
                taxable_amount=r.taxable_amount,
                cgst=r.cgst,
                sgst=r.sgst,
                igst=r.igst,
                amount=r.amount,
                order=n,
            )
            for n, (i, r) in enumerate(zip(items, totals.lines))
        ]
    )
    for f in ("subtotal", "discount_total", "taxable_total", "cgst_total", "sgst_total", "igst_total", "round_off", "total"):
        setattr(doc, f, getattr(totals, f))
    doc.save()


@transaction.atomic
def save_quotation(*, items: list[dict], user=None, instance: Quotation | None = None, **data) -> Quotation:
    profile = CompanyProfile.load()
    if instance is None:
        date = data.get("date") or timezone.localdate()
        data["date"] = date
        data.setdefault("valid_until", date + datetime.timedelta(days=profile.quotation_valid_days))
        data.setdefault("terms", profile.quotation_terms)
        instance = Quotation(number=next_number(profile.quotation_prefix, date), created_by=user, **data)
    else:
        if instance.status == Quotation.Status.INVOICED:
            raise ValidationError("This quotation has been invoiced and can't be changed.")
        for k, v in data.items():
            setattr(instance, k, v)
    instance.updated_by = user
    instance.save()
    _write_items(instance, QuotationItem, "quotation", items)
    return instance


@transaction.atomic
def save_invoice(*, items: list[dict], user=None, instance: Invoice | None = None, **data) -> Invoice:
    profile = CompanyProfile.load()
    if instance is None:
        date = data.get("invoice_date") or timezone.localdate()
        data["invoice_date"] = date
        data.setdefault("due_date", date + datetime.timedelta(days=profile.invoice_due_days))
        data.setdefault("terms", profile.invoice_terms)
        instance = Invoice(created_by=user, **data)
    else:
        if instance.status != Invoice.Status.DRAFT:
            raise ValidationError("Issued invoices can't be edited. Cancel it and issue a new one.")
        for k, v in data.items():
            setattr(instance, k, v)
    instance.updated_by = user
    instance.save()
    _write_items(instance, InvoiceItem, "invoice", items)
    return instance


def _items_of(doc) -> list[dict]:
    return [
        {f: getattr(i, f) for f in ("description", "sac", "quantity", "unit", "rate", "discount", "tax_rate")}
        for i in doc.items.all()
    ]


@transaction.atomic
def quotation_to_invoice(quotation: Quotation, *, user=None) -> Invoice:
    if quotation.status == Quotation.Status.INVOICED:
        raise ValidationError("This quotation is already invoiced.")
    invoice = save_invoice(
        user=user,
        items=_items_of(quotation),
        client=quotation.client,
        booking=quotation.booking,
        quotation=quotation,
        place_of_supply=quotation.place_of_supply,
        notes=quotation.notes,
    )
    quotation.status = Quotation.Status.INVOICED
    quotation.save(update_fields=["status", "updated_at"])
    return invoice


@transaction.atomic
def issue_invoice(invoice: Invoice, *, user=None) -> Invoice:
    invoice = Invoice.objects.select_for_update().get(pk=invoice.pk)
    if invoice.status != Invoice.Status.DRAFT:
        raise ValidationError("Only draft invoices can be issued.")
    if not invoice.items.exists() or invoice.total <= 0:
        raise ValidationError("Add at least one line with an amount before issuing.")
    profile = CompanyProfile.load()
    if not profile.gstin:
        raise ValidationError("Add the company GSTIN in Accounts → Settings before issuing GST invoices.")

    client = invoice.client
    invoice.number = next_number(profile.invoice_prefix, invoice.invoice_date)
    invoice.billing_name = client.name
    invoice.billing_address = client.address
    invoice.billing_gstin = client.gstin
    invoice.billing_phone = client.phone
    invoice.status = Invoice.Status.ISSUED
    invoice.issued_at = timezone.now()

    invoice.journal = post(
        number=invoice.number,
        date=invoice.invoice_date,
        voucher_type=V.SALES,
        narration=f"Sales invoice {invoice.number} to {client.name}",
        user=user,
        lines=[
            (client_ledger(client), invoice.total, 0, ""),
            (system_ledger("SALES"), 0, invoice.taxable_total, ""),
            (system_ledger("OUTPUT_CGST"), 0, invoice.cgst_total, ""),
            (system_ledger("OUTPUT_SGST"), 0, invoice.sgst_total, ""),
            (system_ledger("OUTPUT_IGST"), 0, invoice.igst_total, ""),
            # Rounded up → we credited more than tax + taxable: Round Off is income (Cr), and vice versa.
            (system_ledger("ROUND_OFF"), 0, invoice.round_off, "Rounding"),
        ],
    )
    invoice.updated_by = user
    invoice.save()
    return invoice


@transaction.atomic
def cancel_invoice(invoice: Invoice, *, reason: str, user=None) -> Invoice:
    if invoice.status == Invoice.Status.CANCELLED:
        return invoice
    if invoice.status == Invoice.Status.DRAFT:
        raise ValidationError("Draft invoices can simply be deleted.")
    if invoice.allocations.filter(receipt__is_cancelled=False).exists():
        raise ValidationError("Payments are applied to this invoice. Cancel or re-apply those receipts first.")
    if not reason.strip():
        raise ValidationError({"reason": "Give a reason for cancelling."})
    cancel_entry(invoice.journal)
    invoice.status = Invoice.Status.CANCELLED
    invoice.cancel_reason = reason.strip()
    invoice.updated_by = user
    invoice.save()
    if invoice.quotation and not invoice.quotation.invoices.exclude(status=Invoice.Status.CANCELLED).exists():
        invoice.quotation.status = Quotation.Status.ACCEPTED
        invoice.quotation.save(update_fields=["status", "updated_at"])
    return invoice


def refresh_invoice(invoice: Invoice) -> Invoice:
    if invoice.status in (Invoice.Status.DRAFT, Invoice.Status.CANCELLED):
        return invoice
    paid = invoice.allocations.filter(receipt__is_cancelled=False).aggregate(s=Sum("amount"))["s"] or ZERO
    invoice.amount_paid = paid
    invoice.status = (
        Invoice.Status.PAID if paid >= invoice.total else Invoice.Status.PARTIALLY_PAID if paid > 0 else Invoice.Status.ISSUED
    )
    invoice.save(update_fields=["amount_paid", "status", "updated_at"])
    return invoice


# --- Receipts ------------------------------------------------------------------------------


def _validate_allocations(client: Client, allocations: list[tuple[Invoice, Decimal]], available: Decimal):
    total = ZERO
    seen = set()
    for invoice, amount in allocations:
        if invoice.pk in seen:
            raise ValidationError({"allocations": "Each invoice can appear only once."})
        seen.add(invoice.pk)
        if invoice.client_id != client.pk:
            raise ValidationError({"allocations": f"{invoice} belongs to another client."})
        if invoice.status not in Invoice.OPEN_STATUSES:
            raise ValidationError({"allocations": f"{invoice} isn't open for payment."})
        if amount > invoice.balance_due:
            raise ValidationError({"allocations": f"{amount} is more than the {invoice.balance_due} due on {invoice}."})
        total += amount
    if total > available:
        raise ValidationError({"allocations": "You've applied more than the amount received."})


@transaction.atomic
def create_receipt(*, client: Client, amount: Decimal, deposit_to: Ledger, allocations=(), user=None, **data) -> Receipt:
    if not is_cash_or_bank(deposit_to):
        raise ValidationError({"deposit_to": "Choose a cash or bank ledger."})
    allocations = [(Invoice.objects.select_for_update().get(pk=inv.pk), calc.q(a)) for inv, a in allocations if a]
    _validate_allocations(client, allocations, amount)

    profile = CompanyProfile.load()
    date = data.get("date") or timezone.localdate()
    receipt = Receipt.objects.create(
        number=next_number(profile.receipt_prefix, date), client=client, amount=amount,
        deposit_to=deposit_to, created_by=user, updated_by=user, **{**data, "date": date},
    )
    receipt.journal = post(
        number=receipt.number, date=date, voucher_type=V.RECEIPT, user=user,
        narration=f"Received from {client.name} by {receipt.get_mode_display()}" + (f" ({receipt.reference})" if receipt.reference else ""),
        lines=[(deposit_to, amount, 0, ""), (client_ledger(client), 0, amount, "")],
    )
    receipt.save(update_fields=["journal"])
    for invoice, a in allocations:
        ReceiptAllocation.objects.create(receipt=receipt, invoice=invoice, amount=a)
        refresh_invoice(invoice)
    return receipt


@transaction.atomic
def allocate_receipt(receipt: Receipt, allocations: list[tuple[Invoice, Decimal]]) -> Receipt:
    """Apply an advance (unallocated part of a receipt) to invoices issued later."""
    if receipt.is_cancelled:
        raise ValidationError("This receipt is cancelled.")
    allocations = [(Invoice.objects.select_for_update().get(pk=inv.pk), calc.q(a)) for inv, a in allocations if a]
    _validate_allocations(receipt.client, allocations, receipt.amount - receipt.allocated)
    for invoice, a in allocations:
        alloc, created = ReceiptAllocation.objects.get_or_create(receipt=receipt, invoice=invoice, defaults={"amount": a})
        if not created:
            alloc.amount += a
            alloc.save(update_fields=["amount"])
        refresh_invoice(invoice)
    return receipt


@transaction.atomic
def cancel_receipt(receipt: Receipt, *, user=None) -> Receipt:
    if receipt.is_cancelled:
        return receipt
    receipt.is_cancelled = True
    receipt.updated_by = user
    receipt.save(update_fields=["is_cancelled", "updated_by", "updated_at"])
    cancel_entry(receipt.journal)
    for alloc in receipt.allocations.select_related("invoice"):
        refresh_invoice(alloc.invoice)
    return receipt


# --- Expenses -------------------------------------------------------------------------------


def _is_expense_ledger(ledger: Ledger) -> bool:
    return ledger.group.nature == AccountGroup.Nature.EXPENSE or ledger.group.name == "Fixed Assets"


@transaction.atomic
def save_expense(*, user=None, instance: Expense | None = None, **data) -> Expense:
    expense = instance or Expense(created_by=user)
    if expense.is_cancelled:
        raise ValidationError("Cancelled expenses can't be edited.")
    for k, v in data.items():
        setattr(expense, k, v)

    if not _is_expense_ledger(expense.expense_ledger):
        raise ValidationError({"expense_ledger": "Choose an expense head (Direct/Indirect Expenses or Fixed Assets)."})
    if expense.paid_from is None and expense.vendor is None:
        raise ValidationError({"paid_from": "Say where it was paid from, or pick the vendor it's owed to."})
    if expense.paid_from is not None and not is_cash_or_bank(expense.paid_from):
        raise ValidationError({"paid_from": "Choose a cash or bank ledger."})

    expense.cgst, expense.sgst, expense.igst = calc.tax_split(calc.q(expense.amount), expense.tax_rate, not expense.is_interstate)
    expense.total = calc.q(expense.amount) + expense.cgst + expense.sgst + expense.igst
    if not expense.number:
        expense.number = next_number(CompanyProfile.load().expense_prefix, expense.date)
    expense.updated_by = user
    expense.save()

    credit_ledger = expense.paid_from or vendor_ledger(expense.vendor)
    who = f" — {expense.vendor.name}" if expense.vendor else ""
    expense.journal = post(
        entry=expense.journal,
        number=expense.number, date=expense.date, voucher_type=V.PURCHASE, user=user,
        narration=f"{expense.description}{who}" + (f" (bill {expense.bill_number})" if expense.bill_number else ""),
        lines=[
            (expense.expense_ledger, expense.amount, 0, ""),
            (system_ledger("INPUT_CGST"), expense.cgst, 0, ""),
            (system_ledger("INPUT_SGST"), expense.sgst, 0, ""),
            (system_ledger("INPUT_IGST"), expense.igst, 0, ""),
            (credit_ledger, 0, expense.total, ""),
        ],
    )
    expense.save(update_fields=["journal"])
    return expense


@transaction.atomic
def cancel_expense(expense: Expense, *, user=None) -> Expense:
    expense.is_cancelled = True
    expense.updated_by = user
    expense.save(update_fields=["is_cancelled", "updated_by", "updated_at"])
    cancel_entry(expense.journal)
    return expense


# --- Manual vouchers ----------------------------------------------------------------------------


@transaction.atomic
def create_voucher(*, voucher_type: str, date, narration: str, lines: list[Line], user=None) -> JournalEntry:
    if voucher_type == V.SALES:
        raise ValidationError({"voucher_type": "Sales are recorded through invoices."})
    if voucher_type == V.CONTRA and not all(is_cash_or_bank(l[0]) for l in lines):
        raise ValidationError({"lines": "Contra vouchers move money between cash and bank ledgers only."})
    return post(
        number=next_number(CompanyProfile.load().voucher_prefix, date),
        date=date, voucher_type=voucher_type, narration=narration, lines=lines, user=user, is_manual=True,
    )
