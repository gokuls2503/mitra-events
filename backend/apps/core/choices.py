from django.db import models


class EventType(models.TextChoices):
    """Shared across the website, estimator, CRM and bookings."""

    WEDDING = "WEDDING", "Wedding"
    ENGAGEMENT = "ENGAGEMENT", "Engagement"
    RECEPTION = "RECEPTION", "Reception"
    BIRTHDAY = "BIRTHDAY", "Birthday"
    BABY_SHOWER = "BABY_SHOWER", "Baby shower / Seemantham"
    HOUSEWARMING = "HOUSEWARMING", "Housewarming"
    CORPORATE = "CORPORATE", "Corporate event"
    TRADITIONAL = "TRADITIONAL", "Puja & traditional"
    OTHER = "OTHER", "Other"
