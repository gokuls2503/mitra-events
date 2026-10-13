"""Accounting reports. Balances are signed: positive = debit (Dr), negative = credit (Cr).
Cancelled journal entries are ignored everywhere."""

import datetime
from collections import defaultdict
from decimal import Decimal

from django.db.models import Q, Sum
from django.utils import timezone

from .models import ZERO, AccountGroup, Expense, Invoice, InvoiceItem, JournalEntry, JournalLine, Ledger, Receipt

N = AccountGroup.Nature


def live_lines():
    return JournalLine.objects.filter(entry__is_cancelled=False)


def _movement(qs) -> dict[int, Decimal]:
    rows = qs.values("ledger").annotate(dr=Sum("debit"), cr=Sum("credit"))
    return {r["ledger"]: (r["dr"] or ZERO) - (r["cr"] or ZERO) for r in rows}


def closing_balances(as_of: datetime.date | None = None) -> dict[int, Decimal]:
    qs = live_lines()
    if as_of:
        qs = qs.filter(entry__date__lte=as_of)
    moved = _movement(qs)
    return {l.id: l.opening_balance + moved.get(l.id, ZERO) for l in Ledger.objects.all()}


def drcr(amount: Decimal) -> dict:
    return {"amount": abs(amount), "side": "Dr" if amount >= 0 else "Cr"}


# --- Ledger statement ------------------------------------------------------------------


def ledger_statement(ledger: Ledger, date_from: datetime.date, date_to: datetime.date) -> dict:
    before = live_lines().filter(ledger=ledger, entry__date__lt=date_from).aggregate(dr=Sum("debit"), cr=Sum("credit"))
    opening = ledger.opening_balance + (before["dr"] or ZERO) - (before["cr"] or ZERO)
    rows, balance = [], opening
    lines = (
        live_lines()
        .filter(ledger=ledger, entry__date__gte=date_from, entry__date__lte=date_to)
        .select_related("entry")
        .prefetch_related("entry__lines__ledger")
        .order_by("entry__date", "entry__id", "id")
    )
    total_dr = total_cr = ZERO
    for line in lines:
        balance += line.debit - line.credit
        total_dr += line.debit
        total_cr += line.credit
        # "Particulars": the other side(s) of the entry, as in Tally.
        others = [l.ledger.name for l in line.entry.lines.all() if l.ledger_id != ledger.id]
        rows.append(
            {
                "date": line.entry.date,
                "entry_id": line.entry_id,
                "number": line.entry.number,
                "voucher_type": line.entry.get_voucher_type_display(),
                "particulars": ", ".join(dict.fromkeys(others)) or "—",
                "narration": line.entry.narration,
                "debit": line.debit,
                "credit": line.credit,
                "balance": drcr(balance),
            }
        )
    return {
        "ledger": {"id": ledger.id, "name": ledger.name, "group": ledger.group.name},
        "date_from": date_from,
        "date_to": date_to,
        "opening": drcr(opening),
        "rows": rows,
        "total_debit": total_dr,
        "total_credit": total_cr,
        "closing": drcr(balance),
    }


# --- Trial balance -----------------------------------------------------------------------


def trial_balance(as_of: datetime.date) -> dict:
    balances = closing_balances(as_of)
    groups = defaultdict(list)
    total_dr = total_cr = ZERO
    for ledger in Ledger.objects.select_related("group").order_by("group__order", "name"):
        bal = balances[ledger.id]
        if bal == 0:
            continue
        dr, cr = (bal, ZERO) if bal > 0 else (ZERO, -bal)
        total_dr += dr
        total_cr += cr
        groups[ledger.group.name].append({"id": ledger.id, "name": ledger.name, "debit": dr, "credit": cr})
    opening_diff = Ledger.objects.aggregate(s=Sum("opening_balance"))["s"] or ZERO
    return {
        "as_of": as_of,
        "groups": [
            {"group": g, "ledgers": rows, "debit": sum((r["debit"] for r in rows), ZERO), "credit": sum((r["credit"] for r in rows), ZERO)}
            for g, rows in groups.items()
        ],
        "total_debit": total_dr,
        "total_credit": total_cr,
        # Opening balances that don't net to zero show up here, exactly like Tally.
        "opening_difference": drcr(opening_diff) if opening_diff else None,
    }


# --- Profit & loss --------------------------------------------------------------------------


def _period_by_ledger(date_from, date_to, nature) -> list[dict]:
    rows = (
        live_lines()
        .filter(entry__date__gte=date_from, entry__date__lte=date_to, ledger__group__nature=nature)
        .values("ledger", "ledger__name", "ledger__group__name")
        .annotate(dr=Sum("debit"), cr=Sum("credit"))
    )
    out = []
    for r in rows:
        amount = (r["cr"] - r["dr"]) if nature == N.INCOME else (r["dr"] - r["cr"])
        if amount:
            out.append({"id": r["ledger"], "name": r["ledger__name"], "group": r["ledger__group__name"], "amount": amount})
    return sorted(out, key=lambda r: (r["group"], r["name"]))


def _group(rows, name):
    items = [r for r in rows if r["group"] == name]
    return {"group": name, "ledgers": items, "total": sum((r["amount"] for r in items), ZERO)}


def profit_and_loss(date_from: datetime.date, date_to: datetime.date) -> dict:
    income = _period_by_ledger(date_from, date_to, N.INCOME)
    expense = _period_by_ledger(date_from, date_to, N.EXPENSE)
    sales = _group(income, "Sales Accounts")
    other_income = [_group(income, g) for g in sorted({r["group"] for r in income} - {"Sales Accounts"})]
    direct = _group(expense, "Direct Expenses")
    indirect = [_group(expense, g) for g in sorted({r["group"] for r in expense} - {"Direct Expenses"})]
    gross = sales["total"] - direct["total"]
    net = gross + sum((g["total"] for g in other_income), ZERO) - sum((g["total"] for g in indirect), ZERO)
    return {
        "date_from": date_from,
        "date_to": date_to,
        "sales": sales,
        "direct_expenses": direct,
        "gross_profit": gross,
        "other_income": other_income,
        "indirect_expenses": indirect,
        "net_profit": net,
    }


# --- Balance sheet -----------------------------------------------------------------------------


def balance_sheet(as_of: datetime.date) -> dict:
    balances = closing_balances(as_of)
    sides = {N.ASSET: defaultdict(list), N.LIABILITY: defaultdict(list)}
    profit = ZERO
    for ledger in Ledger.objects.select_related("group", "group__parent"):
        bal = balances[ledger.id]
        nature = ledger.group.nature
        if nature in (N.INCOME, N.EXPENSE):
            profit -= bal  # income is Cr (negative) → profit up
            continue
        if bal == 0:
            continue
        top = ledger.group.parent.name if ledger.group.parent else ledger.group.name
        # Assets are shown as Dr balances, liabilities as Cr balances (a bank overdraft shows negative).
        sides[nature][top].append({"name": ledger.name, "amount": bal if nature == N.ASSET else -bal})

    def pack(side):
        return [{"group": g, "ledgers": rows, "total": sum((r["amount"] for r in rows), ZERO)} for g, rows in side.items()]

    liabilities = pack(sides[N.LIABILITY])
    assets = pack(sides[N.ASSET])
    total_liab = sum((g["total"] for g in liabilities), ZERO) + profit
    total_assets = sum((g["total"] for g in assets), ZERO)
    opening_diff = Ledger.objects.aggregate(s=Sum("opening_balance"))["s"] or ZERO
    return {
        "as_of": as_of,
        "liabilities": liabilities,
        "profit_and_loss": profit,
        "assets": assets,
        "total_liabilities": total_liab,
        "total_assets": total_assets,
        "opening_difference": drcr(opening_diff) if opening_diff else None,
    }


# --- GST ------------------------------------------------------------------------------------------


def gst_summary(date_from: datetime.date, date_to: datetime.date) -> dict:
    invoices = (
        Invoice.objects.filter(invoice_date__gte=date_from, invoice_date__lte=date_to)
        .exclude(status__in=[Invoice.Status.DRAFT, Invoice.Status.CANCELLED])
        .order_by("invoice_date", "number")
    )
    outward = [
        {
            "id": i.id,
            "number": i.number,
            "date": i.invoice_date,
            "party": i.billing_name,
            "gstin": i.billing_gstin,
            "place_of_supply": i.get_place_of_supply_display(),
            "type": "B2B" if i.billing_gstin else "B2C",
            "taxable": i.taxable_total,
            "cgst": i.cgst_total,
            "sgst": i.sgst_total,
            "igst": i.igst_total,
            "total": i.total,
        }
        for i in invoices
    ]
    by_rate = (
        InvoiceItem.objects.filter(invoice__in=invoices)
        .values("tax_rate")
        .annotate(taxable=Sum("taxable_amount"), cgst=Sum("cgst"), sgst=Sum("sgst"), igst=Sum("igst"))
        .order_by("tax_rate")
    )
    expenses = (
        Expense.objects.filter(date__gte=date_from, date__lte=date_to, is_cancelled=False)
        .filter(Q(cgst__gt=0) | Q(sgst__gt=0) | Q(igst__gt=0))
        .select_related("vendor")
        .order_by("date")
    )
    inward = [
        {
            "id": e.id,
            "number": e.number,
            "date": e.date,
            "party": e.vendor.name if e.vendor else e.description,
            "gstin": e.vendor.gstin if e.vendor else "",
            "bill_number": e.bill_number,
            "taxable": e.amount,
            "cgst": e.cgst,
            "sgst": e.sgst,
            "igst": e.igst,
            "total": e.total,
        }
        for e in expenses
    ]

    def total(rows, key):
        return sum((r[key] for r in rows), ZERO)

    out_tax = {k: total(outward, k) for k in ("taxable", "cgst", "sgst", "igst")}
    in_tax = {k: total(inward, k) for k in ("taxable", "cgst", "sgst", "igst")}
    return {
        "date_from": date_from,
        "date_to": date_to,
        "outward": outward,
        "outward_by_rate": list(by_rate),
        "outward_totals": out_tax,
        "b2b_count": sum(1 for r in outward if r["type"] == "B2B"),
        "b2c_count": sum(1 for r in outward if r["type"] == "B2C"),
        "inward": inward,
        "inward_totals": in_tax,
        "net_payable": {k: out_tax[k] - in_tax[k] for k in ("cgst", "sgst", "igst")},
    }


# --- Outstanding -------------------------------------------------------------------------------

BUCKETS = [("not_due", None), ("0_30", 30), ("31_60", 60), ("61_90", 90), ("90_plus", None)]


def _bucket(days_overdue: int) -> str:
    if days_overdue <= 0:
        return "not_due"
    if days_overdue <= 30:
        return "0_30"
    if days_overdue <= 60:
        return "31_60"
    if days_overdue <= 90:
        return "61_90"
    return "90_plus"


def receivables(as_of: datetime.date | None = None) -> dict:
    as_of = as_of or timezone.localdate()
    invoices = Invoice.objects.filter(status__in=Invoice.OPEN_STATUSES).select_related("client").order_by("due_date")
    clients: dict[int, dict] = {}
    totals = defaultdict(lambda: ZERO)
    for inv in invoices:
        due = inv.balance_due
        if due <= 0:
            continue
        days = (as_of - (inv.due_date or inv.invoice_date)).days
        bucket = _bucket(days)
        c = clients.setdefault(
            inv.client_id,
            {"client_id": inv.client_id, "client": inv.client.name, "phone": inv.client.phone, "invoices": [], "total": ZERO, **{b: ZERO for b, _ in BUCKETS}},
        )
        c["invoices"].append(
            {"id": inv.id, "number": inv.number, "date": inv.invoice_date, "due_date": inv.due_date, "total": inv.total, "due": due, "days_overdue": max(days, 0)}
        )
        c["total"] += due
        c[bucket] += due
        totals[bucket] += due
        totals["total"] += due

    # Money received but not yet applied to any invoice (advances).
    advances = []
    for r in Receipt.objects.filter(is_cancelled=False).select_related("client").prefetch_related("allocations"):
        unapplied = r.amount - r.allocated
        if unapplied > 0:
            advances.append({"receipt_id": r.id, "number": r.number, "date": r.date, "client_id": r.client_id, "client": r.client.name, "amount": unapplied})

    return {
        "as_of": as_of,
        "clients": sorted(clients.values(), key=lambda c: -c["total"]),
        "totals": {b: totals[b] for b, _ in BUCKETS} | {"total": totals["total"]},
        "advances": advances,
        "advances_total": sum((a["amount"] for a in advances), ZERO),
    }


def payables(as_of: datetime.date | None = None) -> dict:
    as_of = as_of or timezone.localdate()
    balances = closing_balances(as_of)
    rows = []
    for ledger in Ledger.objects.filter(group__name="Sundry Creditors").select_related("vendor"):
        owed = -balances[ledger.id]  # credit balance = we owe them
        if owed > 0:
            rows.append({"ledger_id": ledger.id, "vendor": ledger.name, "phone": ledger.vendor.phone if ledger.vendor else "", "amount": owed})
    rows.sort(key=lambda r: -r["amount"])
    return {"as_of": as_of, "vendors": rows, "total": sum((r["amount"] for r in rows), ZERO)}


# --- Day book ----------------------------------------------------------------------------------


def day_book(date_from: datetime.date, date_to: datetime.date, include_cancelled=False):
    qs = JournalEntry.objects.filter(date__gte=date_from, date__lte=date_to)
    if not include_cancelled:
        qs = qs.filter(is_cancelled=False)
    return qs.prefetch_related("lines__ledger").order_by("date", "id")
