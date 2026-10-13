"""Gap-free, per-financial-year document numbers, e.g. BK/2026-27/0001.

Indian financial years run 1 April – 31 March. Used for bookings now, and for
quotations, invoices and receipts in the accounting module.
"""

import datetime

from django.db import transaction
from django.utils import timezone

from .models import NumberSequence


def financial_year(date: datetime.date | None = None) -> str:
    date = date or timezone.localdate()
    start = date.year if date.month >= 4 else date.year - 1
    return f"{start}-{str(start + 1)[-2:]}"


def next_number(prefix: str, date: datetime.date | None = None, width: int = 4) -> str:
    fy = financial_year(date)
    with transaction.atomic():
        seq, _ = NumberSequence.objects.select_for_update().get_or_create(prefix=prefix, financial_year=fy)
        seq.last_number += 1
        seq.save(update_fields=["last_number"])
        return f"{prefix}/{fy}/{seq.last_number:0{width}d}"
