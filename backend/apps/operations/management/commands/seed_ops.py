"""Demo vendors, event team assignments and checklists (development only).

Run after seed_crm. Vendor names are obviously fake ("Demo Florist").
"""

import random

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Role, User
from apps.crm import services as crm_services
from apps.crm.models import Booking, Client
from apps.operations import services
from apps.operations.models import EventAssignment, Task, Vendor

VENDORS = [
    ("Demo Florist", "FLORIST", "Flowers"),
    ("Demo Lights & Sound", "LIGHTING", "Stage & ambient lighting"),
    ("Demo DJ", "SOUND", "Sound system & DJ"),
    ("Demo Shamiana Works", "TENT", "Stage, tent & chairs"),
    ("Demo Clicks Studio", "PHOTOGRAPHY", "Photography & video"),
    ("Demo Balloon Art", "BALLOONS", "Balloon décor"),
    ("Demo Transport", "TRANSPORT", "Material transport"),
]


class Command(BaseCommand):
    help = "Seed demo vendors, assignments and tasks (development only). Run seed_crm first."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true")

    @transaction.atomic
    def handle(self, *args, reset, **options):
        if not settings.DEBUG:
            raise CommandError("seed_ops is for development only (DEBUG must be True).")
        if reset:
            Task.objects.all().delete()
            EventAssignment.objects.all().delete()
            Vendor.objects.all().delete()
        elif Vendor.objects.exists():
            self.stdout.write("Operations data already exists. Use --reset to replace it.")
            return

        rnd = random.Random(11)
        vendors = [
            Vendor.objects.create(name=name, category=cat, phone=f"+9191000{i:05d}", contact_person="Demo contact")
            for i, (name, cat, _) in enumerate(VENDORS, start=1)
        ]
        roles = {v.pk: role for v, (_, _, role) in zip(vendors, VENDORS)}
        team = list(User.objects.filter(is_active=True, role__in=[Role.STAFF, Role.MANAGER]))
        manager = User.objects.filter(role=Role.MANAGER).first()
        today = timezone.localdate()

        # Make sure the dashboard has something happening this week.
        client = Client.objects.order_by("id").first()
        staff = User.objects.filter(role=Role.STAFF).first()
        if client:
            for days, title, start, setup in [(0, "Demo — Housewarming decor", "10:00", "06:30"), (2, "Demo — Reception stage", "18:30", "13:00")]:
                if Booking.objects.filter(title=title).exists():
                    continue
                crm_services.create_booking(
                    client=client, user=manager, title=title, event_type="RECEPTION" if days else "HOUSEWARMING",
                    event_date=today + timezone.timedelta(days=days), venue="Demo Hall, Gandhipuram",
                    start_time=start, setup_time=setup, guest_count=200, agreed_amount=55000, coordinator=staff,
                )

        upcoming = Booking.objects.filter(event_date__gte=today).exclude(status=Booking.Status.CANCELLED)
        for b in upcoming:
            for person in team:
                EventAssignment.objects.create(
                    booking=b, staff=person, role="Decor lead" if person == b.coordinator else "Decor team",
                    status=EventAssignment.Status.CONFIRMED,
                )
            for v in rnd.sample(vendors, 3):
                EventAssignment.objects.create(
                    booking=b, vendor=v, role=roles[v.pk], agreed_cost=rnd.choice([4000, 8000, 12000, 18000]),
                    status=rnd.choice([EventAssignment.Status.PENDING, EventAssignment.Status.CONFIRMED]),
                )
            services.add_standard_checklist(b, user=manager)
            # Tick off the ones whose due date has already passed, like a real team would.
            for t in b.tasks.filter(due_date__lt=today):
                services.set_task_status(t, Task.Status.DONE, user=b.coordinator)

        # A few loose tasks not tied to an event.
        for title, days, who in [
            ("Restock drapes & fairy lights in godown", 0, team[0] if team else None),
            ("Call Demo Florist about rose prices", -1, team[0] if team else None),
            ("Update Instagram with last week's wedding photos", 3, manager),
        ]:
            Task.objects.create(title=title, due_date=today + timezone.timedelta(days=days), assigned_to=who, created_by=manager)

        self.stdout.write(self.style.SUCCESS(
            f"Seeded {Vendor.objects.count()} vendors, {EventAssignment.objects.count()} assignments, {Task.objects.count()} tasks."
        ))
