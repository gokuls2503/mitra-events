"""Business analytics. Read-only aggregates over CRM, bookings and the accounting journal.

Revenue, expenses and profit are computed from the same journal lines as the P&L report
(income ledgers minus expense ledgers, GST excluded), so the dashboard and the accounts
always agree.
"""

import datetime
from collections import defaultdict
from decimal import Decimal

from django.db.models import Count, F, Q, Sum
from django.db.models.functions import Lower, Trim, TruncMonth

from apps.accounting.models import AccountGroup, Invoice, JournalLine, Receipt
from apps.core.choices import EventType
from apps.crm.models import Booking, Lead

ZERO = Decimal("0")
N = AccountGroup.Nature


def month_starts(date_from: datetime.date, date_to: datetime.date) -> list[datetime.date]:
    months, d = [], date_from.replace(day=1)
    while d <= date_to:
        months.append(d)
        d = (d.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
    return months


def previous_period(date_from: datetime.date, date_to: datetime.date) -> tuple[datetime.date, datetime.date]:
    length = (date_to - date_from).days + 1
    prev_to = date_from - datetime.timedelta(days=1)
    return prev_to - datetime.timedelta(days=length - 1), prev_to


def _year_earlier(d: datetime.date) -> datetime.date:
    try:
        return d.replace(year=d.year - 1)
    except ValueError:  # 29 Feb
        return d.replace(year=d.year - 1, day=28)


def same_period_last_year(date_from: datetime.date, date_to: datetime.date) -> tuple[datetime.date, datetime.date]:
    """Events are seasonal (wedding months), so year-on-year is usually the fairer comparison."""
    return _year_earlier(date_from), _year_earlier(date_to)


def _key(d) -> str:
    return (d.date() if isinstance(d, datetime.datetime) else d).strftime("%Y-%m")


def _pct(part, whole) -> float | None:
    return round(float(part) * 100 / float(whole), 1) if whole else None


# --- Money ----------------------------------------------------------------------------


def _journal_by_month(date_from, date_to, nature) -> dict[str, Decimal]:
    rows = (
        JournalLine.objects.filter(entry__is_cancelled=False, entry__date__gte=date_from, entry__date__lte=date_to, ledger__group__nature=nature)
        .annotate(m=TruncMonth("entry__date"))
        .values("m")
        .annotate(dr=Sum("debit"), cr=Sum("credit"))
    )
    sign = -1 if nature == N.INCOME else 1  # income is a credit balance
    return {_key(r["m"]): sign * ((r["dr"] or ZERO) - (r["cr"] or ZERO)) for r in rows}


def money(date_from, date_to) -> dict:
    income = _journal_by_month(date_from, date_to, N.INCOME)
    expense = _journal_by_month(date_from, date_to, N.EXPENSE)
    collected = {
        _key(r["m"]): r["s"]
        for r in Receipt.objects.filter(is_cancelled=False, date__gte=date_from, date__lte=date_to)
        .annotate(m=TruncMonth("date")).values("m").annotate(s=Sum("amount"))
    }
    revenue = sum(income.values(), ZERO)
    expenses = sum(expense.values(), ZERO)
    return {
        "revenue": revenue,
        "expenses": expenses,
        "profit": revenue - expenses,
        "margin_pct": _pct(revenue - expenses, revenue),
        "collected": sum(collected.values(), ZERO),
        "by_month": {"revenue": income, "expenses": expense, "collected": collected},
    }


# --- Bookings ------------------------------------------------------------------------------


def _bookings(date_from, date_to):
    return Booking.objects.filter(created_at__date__gte=date_from, created_at__date__lte=date_to).exclude(status=Booking.Status.CANCELLED)


def bookings(date_from, date_to) -> dict:
    qs = _bookings(date_from, date_to)
    agg = qs.aggregate(n=Count("id"), value=Sum("agreed_amount"))
    by_month = {
        _key(r["m"]): {"count": r["n"], "value": r["v"] or ZERO}
        for r in qs.annotate(m=TruncMonth("created_at")).values("m").annotate(n=Count("id"), v=Sum("agreed_amount"))
    }
    labels = dict(EventType.choices)
    by_type = [
        {"event_type": r["event_type"], "label": labels.get(r["event_type"], r["event_type"]), "count": r["n"], "value": r["v"] or ZERO}
        for r in qs.values("event_type").annotate(n=Count("id"), v=Sum("agreed_amount")).order_by("-v", "-n")
    ]
    events_held = Booking.objects.filter(event_date__gte=date_from, event_date__lte=date_to).exclude(status=Booking.Status.CANCELLED).count()
    count, value = agg["n"] or 0, agg["value"] or ZERO
    return {
        "count": count,
        "value": value,
        "average_value": (value / count).quantize(Decimal("1")) if count else ZERO,
        "events_held": events_held,
        "cancelled": Booking.objects.filter(created_at__date__gte=date_from, created_at__date__lte=date_to, status=Booking.Status.CANCELLED).count(),
        "by_month": by_month,
        "by_event_type": by_type,
    }


def top_clients(date_from, date_to, limit=10) -> list[dict]:
    rows = (
        Invoice.objects.filter(invoice_date__gte=date_from, invoice_date__lte=date_to)
        .exclude(status__in=[Invoice.Status.DRAFT, Invoice.Status.CANCELLED])
        .values("client", "client__name")
        .annotate(revenue=Sum("taxable_total"), invoices=Count("id"), outstanding=Sum(F("total") - F("amount_paid")))
        .order_by("-revenue")[:limit]
    )
    return [{"client_id": r["client"], "name": r["client__name"], "revenue": r["revenue"], "invoices": r["invoices"], "outstanding": r["outstanding"]} for r in rows]


# --- Leads ------------------------------------------------------------------------------------


def leads(date_from, date_to) -> dict:
    qs = Lead.objects.filter(created_at__date__gte=date_from, created_at__date__lte=date_to)
    total = qs.count()
    won = qs.filter(status=Lead.Status.WON).count()
    lost = qs.filter(status=Lead.Status.LOST).count()

    stage_counts = dict(qs.values_list("status").annotate(n=Count("id")))
    stages = [{"status": s, "label": label, "count": stage_counts.get(s, 0)} for s, label in Lead.Status.choices]

    source_labels = dict(Lead.Source.choices)
    by_source = []
    for r in qs.values("source").annotate(n=Count("id"), w=Count("id", filter=Q(status=Lead.Status.WON)), v=Sum("booking__agreed_amount")).order_by("-n"):
        by_source.append({"source": r["source"], "label": source_labels.get(r["source"], r["source"]), "leads": r["n"], "won": r["w"], "conversion_pct": _pct(r["w"], r["n"]), "booked_value": r["v"] or ZERO})

    by_month = {
        _key(r["m"]): {"leads": r["n"], "won": r["w"]}
        for r in qs.annotate(m=TruncMonth("created_at")).values("m").annotate(n=Count("id"), w=Count("id", filter=Q(status=Lead.Status.WON)))
    }

    # Why we lose: leads marked lost during the period, reasons grouped case-insensitively.
    lost_reasons = [
        {"reason": r["r"] or "(no reason given)", "count": r["n"]}
        for r in Lead.objects.filter(status=Lead.Status.LOST, status_changed_at__date__gte=date_from, status_changed_at__date__lte=date_to)
        .annotate(r=Lower(Trim("lost_reason"))).values("r").annotate(n=Count("id")).order_by("-n")[:8]
    ]
    for row in lost_reasons:
        row["reason"] = row["reason"][:1].upper() + row["reason"][1:]

    return {
        "count": total,
        "won": won,
        "lost": lost,
        "open": total - won - lost,
        "conversion_pct": _pct(won, total),
        "win_rate_pct": _pct(won, won + lost),
        "stages": stages,
        "by_source": by_source,
        "by_month": by_month,
        "lost_reasons": lost_reasons,
    }


def team(date_from, date_to) -> list[dict]:
    rows = (
        Lead.objects.filter(created_at__date__gte=date_from, created_at__date__lte=date_to, assigned_to__isnull=False)
        .values("assigned_to", "assigned_to__full_name")
        .annotate(
            n=Count("id"),
            w=Count("id", filter=Q(status=Lead.Status.WON)),
            l=Count("id", filter=Q(status=Lead.Status.LOST)),
            v=Sum("booking__agreed_amount"),
        )
        .order_by("-w", "-n")
    )
    return [
        {"user_id": r["assigned_to"], "name": r["assigned_to__full_name"], "leads": r["n"], "won": r["w"], "lost": r["l"], "conversion_pct": _pct(r["w"], r["n"]), "booked_value": r["v"] or ZERO}
        for r in rows
    ]


# --- Assembly ------------------------------------------------------------------------------------


def monthly_series(date_from, date_to, m: dict | None, b: dict, l: dict | None) -> list[dict]:
    out = []
    for start in month_starts(date_from, date_to):
        k = start.strftime("%Y-%m")
        row = {"month": k, "bookings": b["by_month"].get(k, {}).get("count", 0), "booked_value": b["by_month"].get(k, {}).get("value", ZERO)}
        if m is not None:
            rev = m["by_month"]["revenue"].get(k, ZERO)
            exp = m["by_month"]["expenses"].get(k, ZERO)
            row |= {"revenue": rev, "collected": m["by_month"]["collected"].get(k, ZERO), "expenses": exp, "profit": rev - exp}
        if l is not None:
            row |= {"leads": l["by_month"].get(k, {}).get("leads", 0), "won": l["by_month"].get(k, {}).get("won", 0)}
        out.append(row)
    return out


def overview(date_from: datetime.date, date_to: datetime.date, *, show_profit: bool, show_leads: bool, show_team: bool, compare: str = "last_year") -> dict:
    prev_from, prev_to = (same_period_last_year if compare == "last_year" else previous_period)(date_from, date_to)
    m, pm = money(date_from, date_to), money(prev_from, prev_to)
    b, pb = bookings(date_from, date_to), bookings(prev_from, prev_to)
    l = leads(date_from, date_to) if show_leads else None
    pl = leads(prev_from, prev_to) if show_leads else None

    kpis = {
        "revenue": {"value": m["revenue"], "previous": pm["revenue"]},
        "collected": {"value": m["collected"], "previous": pm["collected"]},
        "bookings": {"value": b["count"], "previous": pb["count"]},
        "booked_value": {"value": b["value"], "previous": pb["value"]},
        "average_booking": {"value": b["average_value"], "previous": pb["average_value"]},
    }
    if show_profit:
        kpis |= {
            "expenses": {"value": m["expenses"], "previous": pm["expenses"]},
            "profit": {"value": m["profit"], "previous": pm["profit"]},
            "margin_pct": {"value": m["margin_pct"], "previous": pm["margin_pct"]},
        }
    if l is not None:
        kpis |= {
            "leads": {"value": l["count"], "previous": pl["count"]},
            "conversion_pct": {"value": l["conversion_pct"], "previous": pl["conversion_pct"]},
        }

    result = {
        "date_from": date_from,
        "date_to": date_to,
        "previous": {"date_from": prev_from, "date_to": prev_to, "compare": compare},
        "kpis": kpis,
        "monthly": monthly_series(date_from, date_to, m, b, l),
        "event_types": b["by_event_type"],
        "events_held": b["events_held"],
        "cancelled_bookings": b["cancelled"],
        "top_clients": top_clients(date_from, date_to),
    }
    if not show_profit:
        for row in result["monthly"]:
            row.pop("expenses", None)
            row.pop("profit", None)
    if l is not None:
        result["leads"] = {k: v for k, v in l.items() if k != "by_month"}
    if show_team:
        result["team"] = team(date_from, date_to)
    return result

