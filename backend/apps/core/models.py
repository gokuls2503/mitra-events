from django.conf import settings
from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class AuditedModel(TimeStampedModel):
    """Records which admin user created / last changed the row."""

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        abstract = True


class NumberSequence(models.Model):
    """Counter behind apps.core.numbering.next_number — one row per prefix per financial year."""

    prefix = models.CharField(max_length=10)
    financial_year = models.CharField(max_length=7)  # "2026-27"
    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["prefix", "financial_year"], name="uniq_sequence_per_fy")]

    def __str__(self):
        return f"{self.prefix}/{self.financial_year}: {self.last_number}"
