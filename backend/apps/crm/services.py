"""CRM business rules. Views and the public enquiry form go through these functions
so every change leaves a trail in the lead's timeline."""

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.core.numbering import next_number

from .models import Booking, Client, FollowUp, Lead, LeadActivity

BOOKING_PREFIX = "BK"


def record(lead: Lead, kind: str, text: str = "", user=None) -> LeadActivity:
    return LeadActivity.objects.create(lead=lead, kind=kind, text=text, created_by=user)


def _display(user) -> str:
    return user.full_name if user else "nobody"


@transaction.atomic
def create_lead(*, user=None, **data) -> Lead:
    """Creates a lead and links it to an existing client with the same phone number."""
    lead = Lead(**data, created_by=user, updated_by=user)
    if not lead.client_id:
        lead.client = Client.objects.filter(phone=lead.phone).first()
    lead.save()
    via = lead.get_source_display()
    record(lead, LeadActivity.Kind.CREATED, f"Enquiry received via {via}" + (" (returning client)" if lead.client_id else ""), user)
    return lead


@transaction.atomic
def change_status(lead: Lead, status: str, *, user=None, lost_reason: str = "", note: str = "") -> Lead:
    if status == lead.status:
        return lead
    if status == Lead.Status.WON:
        raise ValidationError({"status": "Convert the lead to a booking to mark it as won."})
    if hasattr(lead, "booking") and lead.booking is not None:
        raise ValidationError({"status": "This lead already has a booking. Change the booking instead."})
    if status == Lead.Status.LOST and not lost_reason.strip():
        raise ValidationError({"lost_reason": "Please say why the lead was lost."})

    old = lead.get_status_display()
    lead.status = status
    lead.status_changed_at = timezone.now()
    lead.lost_reason = lost_reason.strip() if status == Lead.Status.LOST else ""
    lead.updated_by = user
    lead.save(update_fields=["status", "status_changed_at", "lost_reason", "updated_by", "updated_at"])

    text = f"{old} → {lead.get_status_display()}"
    if lead.lost_reason:
        text += f". Reason: {lead.lost_reason}"
    if note.strip():
        text += f"\n{note.strip()}"
    record(lead, LeadActivity.Kind.STATUS, text, user)

    if status == Lead.Status.LOST:
        # No point chasing a lost lead.
        lead.follow_ups.filter(completed_at__isnull=True).delete()
    return lead


@transaction.atomic
def assign(lead: Lead, assignee, *, user=None) -> Lead:
    if lead.assigned_to_id == (assignee.pk if assignee else None):
        return lead
    lead.assigned_to = assignee
    lead.updated_by = user
    lead.save(update_fields=["assigned_to", "updated_by", "updated_at"])
    record(lead, LeadActivity.Kind.ASSIGNED, f"Assigned to {_display(assignee)}", user)
    return lead


@transaction.atomic
def complete_follow_up(follow_up: FollowUp, *, user=None, outcome: str = "") -> FollowUp:
    if follow_up.completed_at:
        raise ValidationError("This follow-up is already done.")
    follow_up.completed_at = timezone.now()
    follow_up.completed_by = user
    follow_up.outcome = outcome.strip()
    follow_up.save(update_fields=["completed_at", "completed_by", "outcome", "updated_at"])
    text = f"{follow_up.get_kind_display()} done"
    if follow_up.outcome:
        text += f": {follow_up.outcome}"
    record(follow_up.lead, LeadActivity.Kind.FOLLOW_UP, text, user)
    return follow_up


@transaction.atomic
def convert_to_booking(lead: Lead, *, user=None, client_data: dict | None = None, **booking_data) -> Booking:
    """Won lead → client (found by phone, or created) + booking."""
    lead = Lead.objects.select_for_update().get(pk=lead.pk)
    if Booking.objects.filter(lead=lead).exists():
        raise ValidationError("This lead has already been converted.")
    if lead.status == Lead.Status.LOST:
        raise ValidationError("Re-open this lost lead before converting it.")

    client_data = {k: v for k, v in (client_data or {}).items() if v not in (None, "")}
    client = lead.client or Client.objects.filter(phone=lead.phone).first()
    if client is None:
        client = Client.objects.create(
            name=client_data.pop("name", lead.name),
            phone=lead.phone,
            email=client_data.pop("email", lead.email),
            created_by=user,
            updated_by=user,
            **client_data,
        )
    elif client_data:
        for field, value in client_data.items():
            setattr(client, field, value)
        client.updated_by = user
        client.save()

    booking = create_booking(client=client, lead=lead, user=user, **booking_data)

    lead.client = client
    lead.status = Lead.Status.WON
    lead.status_changed_at = timezone.now()
    lead.lost_reason = ""
    lead.updated_by = user
    lead.save()
    lead.follow_ups.filter(completed_at__isnull=True).delete()
    record(lead, LeadActivity.Kind.CONVERTED, f"Booking {booking.number} created for {booking.event_date:%d %b %Y}", user)
    return booking


def create_booking(*, client: Client, user=None, **data) -> Booking:
    if data.get("end_date") and data["end_date"] < data["event_date"]:
        raise ValidationError({"end_date": "End date can't be before the event date."})
    return Booking.objects.create(
        number=next_number(BOOKING_PREFIX),  # FY of the booking date, like invoices
        client=client,
        created_by=user,
        updated_by=user,
        **data,
    )
