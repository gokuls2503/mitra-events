"""Event cost estimate — the single source of truth for the formula.

    base     = event base price + per-guest rate × guests
    decor    = base × tier multiplier
    add-ons  = flat price, or price × guests
    total    = decor + add-ons
    range    = total −10% … +15%, rounded to the nearest ₹1,000
"""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError

from .models import EstimatorAddon, EstimatorEventType, EstimatorTier

LOW_FACTOR = Decimal("0.90")
HIGH_FACTOR = Decimal("1.15")


def _round_thousand(value: Decimal) -> int:
    return int((value / 1000).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * 1000)


@dataclass
class Estimate:
    event_type: str
    event_type_label: str
    guests: int
    tier: str
    lines: list[dict]
    total: int
    low: int
    high: int

    def as_dict(self):
        return {
            "event_type": self.event_type,
            "event_type_label": self.event_type_label,
            "guests": self.guests,
            "tier": self.tier,
            "lines": self.lines,
            "total": self.total,
            "low": self.low,
            "high": self.high,
            "note": "Indicative range, excluding GST. Final quote depends on venue, date and design.",
        }


def calculate_estimate(*, event_type: str, guests: int, tier_id: int, addon_ids: list[int]) -> Estimate:
    try:
        event = EstimatorEventType.objects.get(event_type=event_type, is_active=True)
    except EstimatorEventType.DoesNotExist:
        raise ValidationError({"event_type": "This event type isn't available in the estimator."})
    try:
        tier = EstimatorTier.objects.get(pk=tier_id, is_active=True)
    except EstimatorTier.DoesNotExist:
        raise ValidationError({"tier": "Choose a decor level."})
    if not event.min_guests <= guests <= event.max_guests:
        raise ValidationError({"guests": f"Guests must be between {event.min_guests} and {event.max_guests}."})

    addons = list(EstimatorAddon.objects.filter(pk__in=set(addon_ids), is_active=True))
    if len(addons) != len(set(addon_ids)):
        raise ValidationError({"addons": "One or more add-ons are not available."})

    base = event.base_price + event.per_guest_rate * guests
    decor = base * tier.multiplier
    lines = [
        {"label": f"{event.get_event_type_display()} decor for {guests} guests", "amount": int(base)},
        {"label": f"{tier.name} decor level (×{tier.multiplier})", "amount": int(decor - base)},
    ]
    total = decor
    for addon in addons:
        amount = addon.price * guests if addon.pricing == EstimatorAddon.Pricing.PER_GUEST else addon.price
        lines.append({"label": addon.name, "amount": int(amount)})
        total += amount

    return Estimate(
        event_type=event.event_type,
        event_type_label=event.get_event_type_display(),
        guests=guests,
        tier=tier.name,
        lines=lines,
        total=int(total),
        low=_round_thousand(total * LOW_FACTOR),
        high=_round_thousand(total * HIGH_FACTOR),
    )
