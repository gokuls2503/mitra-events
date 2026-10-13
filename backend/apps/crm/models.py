from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.choices import EventType
from apps.core.models import AuditedModel, TimeStampedModel


class Client(AuditedModel):
    """A customer. One per phone number — enquiries from a known number link to the same client."""

    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=16, unique=True, help_text="Normalised +91XXXXXXXXXX")
    alt_phone = models.CharField(max_length=16, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=60, blank=True, default="Coimbatore")
    gstin = models.CharField("GSTIN", max_length=15, blank=True, help_text="For business clients who need GST invoices")
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.phone})"


class Lead(AuditedModel):
    """An enquiry, from the website or entered by staff, moving through the sales pipeline."""

    class Status(models.TextChoices):
        NEW = "NEW", "New"
        CONTACTED = "CONTACTED", "Contacted"
        MEETING = "MEETING", "Meeting / site visit"
        QUOTATION_SENT = "QUOTATION_SENT", "Quotation sent"
        NEGOTIATION = "NEGOTIATION", "Negotiation"
        WON = "WON", "Won"
        LOST = "LOST", "Lost"

    OPEN_STATUSES = [Status.NEW, Status.CONTACTED, Status.MEETING, Status.QUOTATION_SENT, Status.NEGOTIATION]

    class Source(models.TextChoices):
        WEBSITE = "WEBSITE", "Website"
        ESTIMATOR = "ESTIMATOR", "Website cost estimator"
        PHONE = "PHONE", "Phone call"
        WHATSAPP = "WHATSAPP", "WhatsApp"
        WALK_IN = "WALK_IN", "Walk-in"
        INSTAGRAM = "INSTAGRAM", "Instagram"
        FACEBOOK = "FACEBOOK", "Facebook"
        REFERRAL = "REFERRAL", "Referral"
        OTHER = "OTHER", "Other"

    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=16)
    email = models.EmailField(blank=True)
    client = models.ForeignKey(Client, null=True, blank=True, on_delete=models.PROTECT, related_name="leads")
    event_type = models.CharField(max_length=20, choices=EventType.choices, blank=True)
    event_date = models.DateField(null=True, blank=True)
    venue = models.CharField(max_length=200, blank=True)
    guest_count = models.PositiveIntegerField(null=True, blank=True)
    budget = models.DecimalField(max_digits=12, decimal_places=0, null=True, blank=True)
    message = models.TextField(blank=True)

    service = models.ForeignKey("website.Service", null=True, blank=True, on_delete=models.SET_NULL)
    package = models.ForeignKey("website.Package", null=True, blank=True, on_delete=models.SET_NULL)
    estimate = models.JSONField(null=True, blank=True, help_text="Snapshot of the website cost estimate")

    source = models.CharField(max_length=20, choices=Source.choices, default=Source.WEBSITE)
    source_page = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW, db_index=True)
    status_changed_at = models.DateTimeField(default=timezone.now)
    lost_reason = models.CharField(max_length=200, blank=True)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="assigned_leads"
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "-created_at"])]

    def __str__(self):
        return f"{self.name} — {self.get_event_type_display() or 'enquiry'}"

    @property
    def is_open(self):
        return self.status in self.OPEN_STATUSES


class LeadActivity(models.Model):
    """Timeline entry on a lead. System entries are written automatically; the rest are staff notes."""

    class Kind(models.TextChoices):
        CREATED = "CREATED", "Lead created"
        STATUS = "STATUS", "Status changed"
        ASSIGNED = "ASSIGNED", "Assigned"
        NOTE = "NOTE", "Note"
        CALL = "CALL", "Call"
        WHATSAPP = "WHATSAPP", "WhatsApp"
        MEETING = "MEETING", "Meeting / visit"
        FOLLOW_UP = "FOLLOW_UP", "Follow-up"
        CONVERTED = "CONVERTED", "Converted to booking"

    MANUAL_KINDS = [Kind.NOTE, Kind.CALL, Kind.WHATSAPP, Kind.MEETING]

    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name="activities")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    text = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name_plural = "lead activities"

    def __str__(self):
        return f"{self.get_kind_display()}: {self.text[:40]}"


class FollowUp(TimeStampedModel):
    class Kind(models.TextChoices):
        CALL = "CALL", "Call"
        WHATSAPP = "WHATSAPP", "WhatsApp"
        MEETING = "MEETING", "Meeting"
        SITE_VISIT = "SITE_VISIT", "Site visit"
        EMAIL = "EMAIL", "Email"

    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name="follow_ups")
    due_at = models.DateTimeField(db_index=True)
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.CALL)
    notes = models.CharField(max_length=300, blank=True)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="follow_ups"
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    outcome = models.CharField(max_length=300, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["completed_at", "due_at"]

    def __str__(self):
        return f"{self.get_kind_display()} with {self.lead.name} at {self.due_at:%d %b %H:%M}"

    @property
    def is_done(self):
        return self.completed_at is not None


class Booking(AuditedModel):
    """A confirmed event. Created by converting a won lead, or directly for repeat clients."""

    class Status(models.TextChoices):
        CONFIRMED = "CONFIRMED", "Confirmed"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    number = models.CharField(max_length=24, unique=True, editable=False)
    client = models.ForeignKey(Client, on_delete=models.PROTECT, related_name="bookings")
    lead = models.OneToOneField(Lead, null=True, blank=True, on_delete=models.SET_NULL, related_name="booking")
    title = models.CharField(max_length=160, help_text='e.g. "Priya & Karthik — Wedding reception"')
    event_type = models.CharField(max_length=20, choices=EventType.choices)
    package = models.ForeignKey("website.Package", null=True, blank=True, on_delete=models.SET_NULL)
    event_date = models.DateField(db_index=True)
    end_date = models.DateField(null=True, blank=True, help_text="For multi-day events")
    start_time = models.TimeField(null=True, blank=True)
    setup_time = models.TimeField(null=True, blank=True, help_text="When the decor team must arrive")
    venue = models.CharField(max_length=200)
    venue_address = models.TextField(blank=True)
    guest_count = models.PositiveIntegerField(null=True, blank=True)
    agreed_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text="Before GST")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.CONFIRMED, db_index=True)
    coordinator = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="coordinated_bookings"
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["event_date", "start_time"]

    def __str__(self):
        return f"{self.number} {self.title}"


# --- Lead references: design images, venue photos and materials --------------------
# They belong to the lead; after conversion the booking reaches them through booking.lead.


class LeadImage(models.Model):
    class Section(models.TextChoices):
        DESIGN = "design", "Design reference"
        STAGE = "stage", "Stage / venue"

    class Source(models.TextChoices):
        OURS = "ours", "Our reference"
        CLIENT = "client", "From client"

    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name="images")
    section = models.CharField(max_length=10, choices=Section.choices, db_index=True)
    image = models.ImageField(upload_to="leads/%Y/%m/")
    thumbnail = models.ImageField(upload_to="leads/%Y/%m/thumbs/", blank=True)
    caption = models.CharField(max_length=200, blank=True)
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.OURS, help_text="Design images only")
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.get_section_display()} image for {self.lead}"


class MaterialCatalog(TimeStampedModel):
    """Predefined decoration materials. The unit (from units.UNITS) is fixed per material; the
    rate is a default the company fills in. Never deleted — made inactive instead."""

    class Category(models.TextChoices):
        FLOWERS = "flowers", "Flowers"
        DECOR = "decor", "Decor"
        LIGHTING = "lighting", "Lighting"
        FABRIC = "fabric", "Fabric"
        FURNITURE = "furniture", "Furniture"
        OTHER = "other", "Other"

    name = models.CharField(max_length=120, unique=True)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.OTHER)
    default_unit = models.CharField(max_length=20, blank=True)
    default_rate = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "material"

    def __str__(self):
        return self.name


class LeadItem(TimeStampedModel):
    """A material needed for this lead's decoration. Name, unit and rate are copied from the
    catalog when picked, so later catalog changes don't rewrite what was planned."""

    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name="items")
    catalog_item = models.ForeignKey(MaterialCatalog, null=True, blank=True, on_delete=models.SET_NULL, related_name="lead_items")
    name = models.CharField(max_length=120)
    unit = models.CharField(max_length=20, blank=True)
    qty = models.DecimalField(max_digits=10, decimal_places=2)
    rate = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.name} × {self.qty}"

    @property
    def amount(self):
        return (self.qty * self.rate).quantize(Decimal("0.01"))
