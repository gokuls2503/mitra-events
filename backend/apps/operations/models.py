from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.core.models import AuditedModel, TimeStampedModel


class Vendor(AuditedModel):
    """Outside suppliers Mitra works with: florists, lighting, sound, catering…"""

    class Category(models.TextChoices):
        FLORIST = "FLORIST", "Florist"
        LIGHTING = "LIGHTING", "Lighting"
        SOUND = "SOUND", "Sound & DJ"
        CATERING = "CATERING", "Catering"
        PHOTOGRAPHY = "PHOTOGRAPHY", "Photography & video"
        TENT = "TENT", "Tent, stage & furniture"
        BALLOONS = "BALLOONS", "Balloons & props"
        TRANSPORT = "TRANSPORT", "Transport"
        LABOUR = "LABOUR", "Labour / helpers"
        OTHER = "OTHER", "Other"

    name = models.CharField(max_length=120)
    category = models.CharField(max_length=20, choices=Category.choices, db_index=True)
    contact_person = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=16)
    alt_phone = models.CharField(max_length=16, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    gstin = models.CharField("GSTIN", max_length=15, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.get_category_display()})"


class EventAssignment(AuditedModel):
    """A staff member or a vendor working on a booking."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Requested"
        CONFIRMED = "CONFIRMED", "Confirmed"
        DONE = "DONE", "Done"
        CANCELLED = "CANCELLED", "Cancelled"

    booking = models.ForeignKey("crm.Booking", on_delete=models.CASCADE, related_name="assignments")
    staff = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="event_assignments"
    )
    vendor = models.ForeignKey(Vendor, null=True, blank=True, on_delete=models.PROTECT, related_name="assignments")
    role = models.CharField(max_length=120, help_text='e.g. "Stage decor lead", "Mandap flowers", "Sound system"')
    report_time = models.TimeField(null=True, blank=True, help_text="When they must be at the venue")
    agreed_cost = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True, help_text="What we pay this vendor for the event"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    notes = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["report_time", "id"]
        constraints = [
            models.CheckConstraint(
                condition=(Q(staff__isnull=False, vendor__isnull=True) | Q(staff__isnull=True, vendor__isnull=False)),
                name="assignment_staff_xor_vendor",
            ),
            models.UniqueConstraint(fields=["booking", "staff"], condition=Q(staff__isnull=False), name="uniq_staff_per_booking"),
        ]

    def __str__(self):
        who = self.staff.full_name if self.staff else self.vendor.name
        return f"{who} — {self.role}"


class Task(TimeStampedModel):
    class Priority(models.IntegerChoices):
        LOW = 1, "Low"
        NORMAL = 2, "Normal"
        HIGH = 3, "High"
        URGENT = 4, "Urgent"

    class Status(models.TextChoices):
        TODO = "TODO", "To do"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        DONE = "DONE", "Done"

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    booking = models.ForeignKey("crm.Booking", null=True, blank=True, on_delete=models.CASCADE, related_name="tasks")
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="tasks"
    )
    due_date = models.DateField(null=True, blank=True, db_index=True)
    priority = models.PositiveSmallIntegerField(choices=Priority.choices, default=Priority.NORMAL)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.TODO, db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["due_date", "-priority", "id"]

    def __str__(self):
        return self.title
