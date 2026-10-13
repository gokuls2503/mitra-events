"""GST arithmetic. All money is Decimal, rounded half-up to paise; invoice totals round to the rupee.

Within the company's state (place of supply == company state) tax splits equally into
CGST + SGST; for another state it is IGST.
"""

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

ZERO = Decimal("0.00")
PAISA = Decimal("0.01")
RUPEE = Decimal("1")


def q(value) -> Decimal:
    return Decimal(value).quantize(PAISA, rounding=ROUND_HALF_UP)


@dataclass
class LineResult:
    taxable_amount: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal
    amount: Decimal


def tax_split(taxable: Decimal, rate: Decimal, intra_state: bool) -> tuple[Decimal, Decimal, Decimal]:
    rate = Decimal(rate)
    if intra_state:
        half = q(taxable * rate / 200)
        return half, half, ZERO
    return ZERO, ZERO, q(taxable * rate / 100)


def compute_line(*, quantity, rate, discount, tax_rate, intra_state: bool) -> LineResult:
    gross = q(Decimal(quantity) * Decimal(rate))
    taxable = gross - q(discount or 0)
    if taxable < 0:
        raise ValueError("Discount can't be more than the line amount.")
    cgst, sgst, igst = tax_split(taxable, tax_rate, intra_state)
    return LineResult(taxable, cgst, sgst, igst, taxable + cgst + sgst + igst)


@dataclass
class DocumentTotals:
    subtotal: Decimal = ZERO
    discount_total: Decimal = ZERO
    taxable_total: Decimal = ZERO
    cgst_total: Decimal = ZERO
    sgst_total: Decimal = ZERO
    igst_total: Decimal = ZERO
    round_off: Decimal = ZERO
    total: Decimal = ZERO
    lines: list[LineResult] = field(default_factory=list)


def compute_document(items: list[dict], *, intra_state: bool) -> DocumentTotals:
    """items: dicts with quantity, rate, discount, tax_rate."""
    t = DocumentTotals()
    for item in items:
        r = compute_line(
            quantity=item["quantity"],
            rate=item["rate"],
            discount=item.get("discount") or 0,
            tax_rate=item["tax_rate"],
            intra_state=intra_state,
        )
        t.lines.append(r)
        t.subtotal += q(Decimal(item["quantity"]) * Decimal(item["rate"]))
        t.discount_total += q(item.get("discount") or 0)
        t.taxable_total += r.taxable_amount
        t.cgst_total += r.cgst
        t.sgst_total += r.sgst
        t.igst_total += r.igst
    exact = t.taxable_total + t.cgst_total + t.sgst_total + t.igst_total
    t.total = exact.quantize(RUPEE, rounding=ROUND_HALF_UP).quantize(PAISA)
    t.round_off = t.total - exact
    return t


# --- Amount in words (Indian numbering) -------------------------------------------

_ONES = (
    "Zero One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen Fourteen "
    "Fifteen Sixteen Seventeen Eighteen Nineteen"
).split()
_TENS = "_ _ Twenty Thirty Forty Fifty Sixty Seventy Eighty Ninety".split()


def _below_hundred(n: int) -> str:
    if n < 20:
        return _ONES[n]
    return _TENS[n // 10] + (f" {_ONES[n % 10]}" if n % 10 else "")


def _below_thousand(n: int) -> str:
    hundreds, rest = divmod(n, 100)
    parts = []
    if hundreds:
        parts.append(f"{_ONES[hundreds]} Hundred")
    if rest:
        parts.append(_below_hundred(rest))
    return " ".join(parts)


def number_in_words(n: int) -> str:
    if n == 0:
        return "Zero"
    parts = []
    for size, name in ((10_000_000, "Crore"), (100_000, "Lakh"), (1_000, "Thousand")):
        chunk, n = divmod(n, size)
        if chunk:
            # Crores can be any size ("Two Hundred Five Crore"); lakh and thousand chunks are always < 100.
            chunk_words = number_in_words(chunk) if size == 10_000_000 else _below_hundred(chunk)
            parts.append(f"{chunk_words} {name}")
    if n:
        parts.append(_below_thousand(n))
    return " ".join(parts)


def amount_in_words(amount: Decimal) -> str:
    """Decimal('120450.50') → 'Rupees One Lakh Twenty Thousand Four Hundred Fifty and Fifty Paise Only'."""
    amount = q(amount)
    rupees = int(amount)
    paise = int((amount - rupees) * 100)
    words = f"Rupees {number_in_words(rupees)}"
    if paise:
        words += f" and {_below_hundred(paise)} Paise"
    return words + " Only"
