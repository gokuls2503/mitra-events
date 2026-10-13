import datetime

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.crm.models import Booking

from .models import EventAssignment, Task

# Standard prep checklist, as (title, days before the event, priority).
# Negative offsets are after the event. Edit here to change what "Add standard checklist" creates.
STANDARD_CHECKLIST = [
    ("Confirm venue access & setup timings with the hall", 14, Task.Priority.HIGH),
    ("Finalise decor design & colour theme with the client", 10, Task.Priority.HIGH),
    ("Confirm all vendors and their reporting times", 7, Task.Priority.HIGH),
    ("Order fresh flowers", 3, Task.Priority.NORMAL),
    ("Check props, drapes & lights in the godown", 3, Task.Priority.NORMAL),
    ("Arrange transport for materials and team", 2, Task.Priority.NORMAL),
    ("Share final event-day plan with the team", 1, Task.Priority.HIGH),
    ("Setup at venue & walkthrough with client", 0, Task.Priority.URGENT),
    ("Dismantle and pack up", -1, Task.Priority.NORMAL),
    ("Collect balance payment & feedback", -2, Task.Priority.NORMAL),
]


@transaction.atomic
def add_standard_checklist(booking: Booking, *, user=None) -> list[Task]:
    """Adds the standard tasks to a booking, skipping any that already exist (by title)."""
    existing = set(booking.tasks.values_list("title", flat=True))
    today = timezone.localdate()
    tasks = []
    for title, days_before, priority in STANDARD_CHECKLIST:
        if title in existing:
            continue
        due = booking.event_date - datetime.timedelta(days=days_before)
        tasks.append(
            Task(
                title=title,
                booking=booking,
                assigned_to=booking.coordinator,
                # Don't create tasks already overdue for a booking made at short notice.
                due_date=max(due, today) if days_before >= 0 else due,
                priority=priority,
                created_by=user,
            )
        )
    return Task.objects.bulk_create(tasks)


def set_task_status(task: Task, status: str, *, user=None) -> Task:
    task.status = status
    if status == Task.Status.DONE:
        task.completed_at = task.completed_at or timezone.now()
        task.completed_by = task.completed_by or user
    else:
        task.completed_at = None
        task.completed_by = None
    task.save()
    return task


def _event_days(booking: Booking) -> tuple[datetime.date, datetime.date]:
    return booking.event_date, booking.end_date or booking.event_date


def conflicts_for(assignment: EventAssignment) -> list[Booking]:
    """Other live bookings on overlapping dates that the same person/vendor is assigned to."""
    start, end = _event_days(assignment.booking)
    who = Q(staff=assignment.staff) if assignment.staff_id else Q(vendor=assignment.vendor)
    others = (
        EventAssignment.objects.filter(who)
        .exclude(booking=assignment.booking)
        .exclude(status=EventAssignment.Status.CANCELLED)
        .exclude(booking__status=Booking.Status.CANCELLED)
        .filter(booking__event_date__lte=end)
        .filter(Q(booking__end_date__gte=start) | Q(booking__end_date__isnull=True, booking__event_date__gte=start))
        .select_related("booking")
    )
    return [a.booking for a in others]
