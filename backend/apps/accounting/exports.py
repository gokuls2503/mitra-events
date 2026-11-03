import io
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.http import HttpResponse
from django.template.loader import render_to_string
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from . import calc
from .models import CompanyProfile
from .states import STATE_NAMES

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
HEADER_FILL = PatternFill("solid", fgColor="4A1D3D")
INR_FORMAT = '#,##,##0.00;[Red]-#,##,##0.00'  # Indian digit grouping


def xlsx_response(filename: str, title: str, subtitle: str, columns: list[str], rows: list[list], totals: list | None = None) -> HttpResponse:
    """One-sheet spreadsheet: title, subtitle, header row, data, optional bold totals row."""
    wb = Workbook()
    ws = wb.active
    ws.title = title[:31]
    company = CompanyProfile.load()
    ws.append([company.legal_name])
    ws.append([title])
    ws.append([subtitle])
    ws["A1"].font = Font(bold=True, size=13)
    ws["A2"].font = Font(bold=True, size=12)
    ws.append([])
    ws.append(columns)
    header_row = ws.max_row
    for cell in ws[header_row]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(vertical="center")
    for row in rows:
        ws.append([float(v) if isinstance(v, Decimal) else v for v in row])
    if totals:
        ws.append([float(v) if isinstance(v, Decimal) else v for v in totals])
        for cell in ws[ws.max_row]:
            cell.font = Font(bold=True)
    for col_idx in range(1, len(columns) + 1):
        letter = get_column_letter(col_idx)
        width = max((len(str(c.value)) for c in ws[letter][header_row - 1 :] if c.value is not None), default=8)
        ws.column_dimensions[letter].width = min(max(width + 2, 10), 50)
        for c in ws[letter][header_row:]:
            if isinstance(c.value, float):
                c.number_format = INR_FORMAT
    ws.freeze_panes = ws.cell(row=header_row + 1, column=1)

    buf = io.BytesIO()
    wb.save(buf)
    response = HttpResponse(buf.getvalue(), content_type=XLSX)
    response["Content-Disposition"] = f'attachment; filename="{filename}.xlsx"'
    return response


def pdf_response(template: str, context: dict, filename: str, inline=True) -> HttpResponse:
    from weasyprint import HTML  # imported lazily: heavy, and only needed for PDFs

    company = CompanyProfile.load()
    html = render_to_string(
        template,
        {**context, "company": company, "company_state": STATE_NAMES.get(company.state_code, "")},
    )
    # base_url lets templates load the bundled fonts (templates/pdf/fonts/).
    pdf = HTML(string=html, base_url=str(Path(settings.BASE_DIR) / "templates" / "pdf")).write_pdf()
    response = HttpResponse(pdf, content_type="application/pdf")
    disposition = "inline" if inline else "attachment"
    response["Content-Disposition"] = f'{disposition}; filename="{filename}.pdf"'
    return response


MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]


def dmy(d) -> str:
    """01/DEC/2026 — months are always names on documents, like the admin."""
    return f"{d.day:02d}/{MONTHS[d.month - 1]}/{d.year}" if d else ""


def event_dates(start, end) -> str:
    """12/NOV/2026, or 12/13/NOV/2026 for a run in one month (as on the paper letterpad),
    otherwise 30/NOV/2026 - 02/DEC/2026."""
    if not start:
        return ""
    if not end or end == start:
        return dmy(start)
    if (start.year, start.month) == (end.year, end.month):
        return f"{start.day:02d}/{end.day:02d}/{MONTHS[start.month - 1]}/{start.year}"
    return f"{dmy(start)} - {dmy(end)}"


def ordinal(n: int) -> str:
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def local_phone(phone: str) -> str:
    """'+919003567253' → '9003567253' (how the letterpad prints numbers)."""
    digits = "".join(ch for ch in phone or "" if ch.isdigit())
    return digits[-10:] if len(digits) >= 10 else phone


def reference_photo(lead):
    """The lead's first Stage photo, else its first Design reference — shown under the client details."""
    if lead is None:
        return None
    for section in ("stage", "design"):
        img = lead.images.filter(section=section).order_by("created_at", "id").first()
        if img and img.image and Path(img.image.path).exists():
            return Path(img.image.path).as_uri()
    return None


def document_photos(doc, kind: str, lead) -> list[str]:
    """Images under the client details: a quotation's own, else the lead's reference photo."""
    from .models import QuotationImage

    if kind == "quotation":
        own = [Path(i.image.path).as_uri() for i in doc.images.all() if i.image and Path(i.image.path).exists()]
        if own:
            return own[: QuotationImage.MAX_PER_QUOTATION]
    photo = reference_photo(lead)
    return [photo] if photo else []


def photo_rows(photos: list[str]) -> list[list[str]]:
    """How the photos sit on the page: up to three share a row; four make two pairs; five are two above three."""
    split = {4: 2, 5: 2}.get(len(photos))
    return [photos[:split], photos[split:]] if split else [photos] if photos else []


def letterpad_context(doc, kind: str) -> dict:
    """Client, event, photo and payment lines for the letterpad layout (pdf/document.html)."""
    from .models import Receipt

    booking = doc.booking
    lead = getattr(doc, "lead", None) or (booking.lead if booking and booking.lead_id else None)
    if booking is None and lead is not None:
        booking = getattr(lead, "booking", None)

    if kind == "invoice" and doc.billing_name:
        name, phone = doc.billing_name, doc.billing_phone or doc.client.phone
    else:
        name, phone = doc.client.name, doc.client.phone

    # Quotations only: the event type picked on the quotation, else the booking's or lead's
    # (all of them, e.g. "Engagement, Reception"). Invoices print as before.
    event_type = ""
    if kind == "quotation":
        source = booking or lead
        event_type = doc.event_types_label or (source.event_types_label if source else "")

    if booking is not None:
        venue, dates = booking.venue, event_dates(booking.event_date, booking.end_date)
    elif lead is not None:
        venue, dates = lead.venue, event_dates(lead.event_date, lead.end_date)
    else:
        venue, dates = "", ""

    # Money already received: receipts applied to this invoice, or (for a quotation) advances for its event.
    if kind == "invoice":
        paid = [(a.receipt.date, a.amount) for a in doc.allocations.select_related("receipt").filter(receipt__is_cancelled=False)]
    elif booking is not None:
        paid = [(r.date, r.amount) for r in Receipt.objects.filter(booking=booking, is_cancelled=False)]
    else:
        paid = []
    paid.sort(key=lambda p: p[0])
    payments = [{"label": f"{dmy(d)} {ordinal(n)} advance", "amount": amt} for n, (d, amt) in enumerate(paid, start=1)]
    received = sum((amt for _, amt in paid), Decimal(0))

    return {
        "party_name": name,
        "party_phone": local_phone(phone),
        "event_type": event_type,
        "venue": venue,
        "event_dates": dates,
        "photo_rows": photo_rows(document_photos(doc, kind, lead)),
        "doc_date": dmy(doc.invoice_date if kind == "invoice" else doc.date),
        "second_date": dmy(doc.due_date if kind == "invoice" else doc.valid_until),
        "payments": payments,
        "balance": doc.total - received,
    }


def document_context(doc, kind: str) -> dict:
    items = list(doc.items.all())
    intra = doc.igst_total == 0
    # Tax summary by rate, as required on GST invoices.
    by_rate: dict = {}
    for i in items:
        r = by_rate.setdefault(i.tax_rate, {"rate": i.tax_rate, "taxable": Decimal(0), "cgst": Decimal(0), "sgst": Decimal(0), "igst": Decimal(0)})
        r["taxable"] += i.taxable_amount
        r["cgst"] += i.cgst
        r["sgst"] += i.sgst
        r["igst"] += i.igst
    return {
        "doc": doc,
        "kind": kind,
        "items": items,
        "intra_state": intra,
        "tax_rows": sorted(by_rate.values(), key=lambda r: r["rate"]),
        "amount_words": calc.amount_in_words(doc.total),
        "place_of_supply": f"{doc.place_of_supply} - {STATE_NAMES.get(doc.place_of_supply, '')}",
        **letterpad_context(doc, kind),
    }
