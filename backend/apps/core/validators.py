import re

from django.core.exceptions import ValidationError

MAX_IMAGE_MB = 5
_PHONE_RE = re.compile(r"^(?:\+?91)?[6-9]\d{9}$")


def validate_image_size(file):
    if file.size > MAX_IMAGE_MB * 1024 * 1024:
        raise ValidationError(f"Image must be under {MAX_IMAGE_MB} MB.")


def normalize_indian_phone(value: str) -> str:
    """Accepts '98765 43210', '+91-98765-43210', '09876543210' → '+919876543210'."""
    digits = re.sub(r"[\s\-()]", "", value or "")
    if digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    if not _PHONE_RE.match(digits):
        raise ValidationError("Enter a valid 10-digit Indian mobile number.")
    return "+91" + digits[-10:]
