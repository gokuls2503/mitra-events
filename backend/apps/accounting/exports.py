import io
from decimal import Decimal

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
    pdf = HTML(string=html).write_pdf()
    response = HttpResponse(pdf, content_type="application/pdf")
    disposition = "inline" if inline else "attachment"
    response["Content-Disposition"] = f'{disposition}; filename="{filename}.pdf"'
    return response


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
    }
