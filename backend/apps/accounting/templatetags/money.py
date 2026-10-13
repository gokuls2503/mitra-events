import re
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from django import template

register = template.Library()


@register.filter
def inr(value, places=2):
    """1360000.5 → '13,60,000.50' (Indian digit grouping)."""
    try:
        d = Decimal(str(value)).quantize(Decimal(1).scaleb(-int(places)), rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError):
        return value
    sign = "-" if d < 0 else ""
    whole, _, frac = f"{abs(d):f}".partition(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        head = re.sub(r"(\d)(?=(\d{2})+$)", r"\1,", head)
        whole = f"{head},{tail}"
    return f"{sign}{whole}{'.' + frac if frac else ''}"


@register.filter
def phone(value):
    """'+919876543210' → '+91 98765 43210'."""
    m = re.fullmatch(r"\+91(\d{5})(\d{5})", value or "")
    return f"+91 {m[1]} {m[2]}" if m else value
