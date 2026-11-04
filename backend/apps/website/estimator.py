"""Event cost estimate — the single source of truth for the formula.

    stage    = width × depth (sq ft) × event rate per sq ft
    add-ons  = flat price, or price × guests
    total    = event base price + stage + add-ons
    range    = total −10% … +15%, rounded to the nearest ₹1,000
"""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError

from .models import EstimatorAddon, EstimatorEventType

LOW_FACTOR = Decimal("0.90")
HIGH_FACTOR = Decimal("1.15")


def _round_thousand(value: Decimal) -> int:
    return int((value / 1000).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * 1000)


@dataclass
class Estimate:
    event_type: str
    event_type_label: str
    width_ft: int
    depth_ft: int
    area_sqft: int
    guests: int
    lines: list[dict]
    total: int
    low: int
    high: int

    def as_dict(self):
        return {
            "event_type": self.event_type,
            "event_type_label": self.event_type_label,
            "width_ft": self.width_ft,
            "depth_ft": self.depth_ft,
            "area_sqft": self.area_sqft,
            "guests": self.guests,
            "lines": self.lines,
            "total": self.total,
            "low": self.low,
            "high": self.high,
            "note": "Indicative price, excluding GST. Final quote depends on venue, date and design.",
        }


def calculate_estimate(*, event_type: str, width_ft: int, depth_ft: int, guests: int, addon_ids: list[int]) -> Estimate:
    try:
        event = EstimatorEventType.objects.get(event_type=event_type, is_active=True)
    except EstimatorEventType.DoesNotExist:
        raise ValidationError({"event_type": "This event type isn't available in the estimator."})
    area = width_ft * depth_ft
    if not event.min_sqft <= area <= event.max_sqft:
        raise ValidationError({"stage": f"Stage area must be between {event.min_sqft} and {event.max_sqft} sq ft."})

    addons = list(EstimatorAddon.objects.filter(pk__in=set(addon_ids), is_active=True))
    if len(addons) != len(set(addon_ids)):
        raise ValidationError({"addons": "One or more add-ons are not available."})
    if guests < 1 and any(a.pricing == EstimatorAddon.Pricing.PER_GUEST for a in addons):
        raise ValidationError({"guests": "Enter the number of guests for per-guest add-ons."})

    stage = event.rate_per_sqft * area
    lines = []
    if event.base_price:
        lines.append({"label": f"{event.get_event_type_display()} starting price", "amount": int(event.base_price)})
    lines.append(
        {"label": f"Stage decor {width_ft} × {depth_ft} ft ({area} sq ft × ₹{event.rate_per_sqft})", "amount": int(stage)}
    )
    total = event.base_price + stage
    for addon in addons:
        if addon.pricing == EstimatorAddon.Pricing.PER_GUEST:
            amount = addon.price * guests
            lines.append({"label": f"{addon.name} ({guests} guests)", "amount": int(amount)})
        else:
            amount = addon.price
            lines.append({"label": addon.name, "amount": int(amount)})
        total += amount

    return Estimate(
        event_type=event.event_type,
        event_type_label=event.get_event_type_display(),
        width_ft=width_ft,
        depth_ft=depth_ft,
        area_sqft=area,
        guests=guests,
        lines=lines,
        total=int(total),
        low=_round_thousand(total * LOW_FACTOR),
        high=_round_thousand(total * HIGH_FACTOR),
    )
