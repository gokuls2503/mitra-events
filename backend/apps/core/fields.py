from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .validators import normalize_indian_phone


class RelativeImageField(serializers.ImageField):
    """Returns '/media/…' rather than an absolute URL.

    Absolute URLs would bake whichever host made the request into the page —
    wrong for build-time pre-rendering and behind proxies.
    """

    def to_representation(self, value):
        return value.url if value else None


class IndianPhoneField(serializers.CharField):
    """Normalises to +91XXXXXXXXXX while parsing, so uniqueness checks see the normalised value."""

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        if not value and self.allow_blank:
            return ""
        try:
            return normalize_indian_phone(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages[0])
