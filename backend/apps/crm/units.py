"""Units for materials and lead items — the one list to edit when the client wants a unit
added or removed. Stored as plain text, so changing this list needs no migration; units
already saved on leads are left as they are."""

from rest_framework import serializers

UNITS = ["nos", "kg", "g", "litre", "ml", "metre", "muzham", "bunch", "pair", "set"]


def check_unit(value: str) -> str:
    value = (value or "").strip()
    if value not in UNITS:
        raise serializers.ValidationError("Pick a unit from the list.")
    return value
