import datetime

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.crm import services as crm_services
from apps.crm.models import Booking, Client
from apps.operations import services
from apps.operations.models import EventAssignment, Task, Vendor

TODAY = timezone.localdate()


def user(role, name=None):
    name = name or role.lower()
    return User.objects.create_user(email=f"{name}@t.local", password="x-Pass-12345", full_name=name.title(), role=role)


def api(u):
    c = APIClient()
    c.force_authenticate(u)
    return c


@pytest.fixture
def team(db):
    return {
        "manager": user(Role.MANAGER),
        "staff": user(Role.STAFF),
        "staff2": user(Role.STAFF, "staff2"),
        "accountant": user(Role.ACCOUNTANT),
    }


@pytest.fixture
def client_obj(db):
    return Client.objects.create(name="C", phone="+919000000001")


def booking(client, days=10, end_days=None, **kw):
    data = dict(title=f"Event +{days}", event_type="WEDDING", event_date=TODAY + datetime.timedelta(days=days), venue="Hall")
    if end_days is not None:
        data["end_date"] = TODAY + datetime.timedelta(days=end_days)
    data.update(kw)
    return crm_services.create_booking(client=client, **data)


def vendor(**kw):
    data = {"name": "Rose Florist", "category": "FLORIST", "phone": "+919111111111"}
    data.update(kw)
    return Vendor.objects.create(**data)


@pytest.mark.django_db
class TestVendors:
    def test_manager_creates_vendor_with_normalised_phone(self, team):
        res = api(team["manager"]).post("/api/v1/ops/vendors/", {"name": "Bright Lights", "category": "LIGHTING", "phone": "98765 43210"}, format="json")
        assert res.status_code == 201, res.data
        assert res.data["phone"] == "+919876543210"

    def test_staff_can_read_but_not_write(self, team):
        vendor()
        c = api(team["staff"])
        assert c.get("/api/v1/ops/vendors/").status_code == 200
        assert c.post("/api/v1/ops/vendors/", {"name": "X", "category": "OTHER", "phone": "9876543210"}, format="json").status_code == 403

    def test_vendor_with_history_cannot_be_deleted(self, team, client_obj):
        v = vendor()
        EventAssignment.objects.create(booking=booking(client_obj), vendor=v, role="Flowers")
        assert api(team["manager"]).delete(f"/api/v1/ops/vendors/{v.pk}/").status_code == 400

    def test_upcoming_jobs_count(self, team, client_obj):
        v = vendor()
        EventAssignment.objects.create(booking=booking(client_obj, days=5), vendor=v, role="A")
        EventAssignment.objects.create(booking=booking(client_obj, days=-5), vendor=v, role="Past")
        res = api(team["manager"]).get("/api/v1/ops/vendors/")
        assert res.data["results"][0]["upcoming_jobs"] == 1


@pytest.mark.django_db
class TestAssignments:
    def test_must_be_staff_or_vendor_not_both(self, team, client_obj):
        b = booking(client_obj)
        c = api(team["manager"])
        assert c.post("/api/v1/ops/assignments/", {"booking": b.pk, "role": "x"}, format="json").status_code == 400
        both = {"booking": b.pk, "role": "x", "staff": team["staff"].pk, "vendor": vendor().pk}
        assert c.post("/api/v1/ops/assignments/", both, format="json").status_code == 400

    def test_same_staff_twice_on_event_rejected(self, team, client_obj):
        b = booking(client_obj)
        c = api(team["manager"])
        body = {"booking": b.pk, "role": "Decor", "staff": team["staff"].pk}
        assert c.post("/api/v1/ops/assignments/", body, format="json").status_code == 201
        assert c.post("/api/v1/ops/assignments/", body, format="json").status_code == 400

    def test_cost_only_for_vendors(self, team, client_obj):
        res = api(team["manager"]).post(
            "/api/v1/ops/assignments/",
            {"booking": booking(client_obj).pk, "role": "x", "staff": team["staff"].pk, "agreed_cost": "500"},
            format="json",
        )
        assert res.status_code == 400

    def test_conflicts_detect_overlapping_dates(self, team, client_obj):
        v = vendor()
        multi = booking(client_obj, days=10, end_days=12, title="Three-day wedding")
        booking_same_day = booking(client_obj, days=11, title="Birthday")
        other_day = booking(client_obj, days=20, title="Later")
        cancelled = booking(client_obj, days=11, title="Cancelled one")
        Booking.objects.filter(pk=cancelled.pk).update(status=Booking.Status.CANCELLED)
        for b in (multi, other_day, cancelled):
            EventAssignment.objects.create(booking=b, vendor=v, role="Flowers")
        a = EventAssignment.objects.create(booking=booking_same_day, vendor=v, role="Flowers")
        assert [b.title for b in services.conflicts_for(a)] == ["Three-day wedding"]

    def test_list_requires_a_filter(self, team):
        assert api(team["manager"]).get("/api/v1/ops/assignments/").status_code == 400

    def test_assignment_gives_staff_access_to_event(self, team, client_obj):
        b = booking(client_obj)
        assert api(team["staff"]).get(f"/api/v1/crm/bookings/{b.pk}/").status_code == 404
        EventAssignment.objects.create(booking=b, staff=team["staff"], role="Decor")
        assert api(team["staff"]).get(f"/api/v1/crm/bookings/{b.pk}/").status_code == 200
        assert api(team["staff"]).get(f"/api/v1/ops/assignments/?booking={b.pk}").status_code == 200
        assert api(team["staff"]).get(f"/api/v1/crm/clients/{client_obj.pk}/").status_code == 200

    def test_staff_cannot_assign(self, team, client_obj):
        b = booking(client_obj, coordinator=team["staff"])
        res = api(team["staff"]).post("/api/v1/ops/assignments/", {"booking": b.pk, "role": "x", "staff": team["staff2"].pk}, format="json")
        assert res.status_code == 403


@pytest.mark.django_db
class TestTasks:
    def test_standard_checklist_dates_and_idempotence(self, team, client_obj):
        b = booking(client_obj, days=30, coordinator=team["staff"])
        c = api(team["manager"])
        assert c.post("/api/v1/ops/tasks/standard-checklist/", {"booking": b.pk}, format="json").data["created"] == len(services.STANDARD_CHECKLIST)
        assert c.post("/api/v1/ops/tasks/standard-checklist/", {"booking": b.pk}, format="json").data["created"] == 0
        setup = b.tasks.get(title__startswith="Setup at venue")
        assert setup.due_date == b.event_date and setup.assigned_to == team["staff"]
        assert b.tasks.get(title__startswith="Collect balance").due_date == b.event_date + datetime.timedelta(days=2)

    def test_short_notice_checklist_is_not_born_overdue(self, team, client_obj):
        b = booking(client_obj, days=2)
        services.add_standard_checklist(b)
        assert not b.tasks.filter(due_date__lt=TODAY).exists()

    def test_done_records_who_and_when_and_can_be_reopened(self, team):
        t = Task.objects.create(title="Order flowers", assigned_to=team["staff"])
        c = api(team["staff"])
        res = c.patch(f"/api/v1/ops/tasks/{t.pk}/", {"status": "DONE"}, format="json")
        assert res.status_code == 200 and res.data["completed_at"] and res.data["completed_by_name"] == "Staff"
        res = c.patch(f"/api/v1/ops/tasks/{t.pk}/", {"status": "TODO"}, format="json")
        assert res.data["completed_at"] is None

    def test_staff_sees_only_their_tasks_and_self_assigns(self, team):
        Task.objects.create(title="Mine", assigned_to=team["staff"])
        Task.objects.create(title="Theirs", assigned_to=team["staff2"])
        c = api(team["staff"])
        assert [t["title"] for t in c.get("/api/v1/ops/tasks/").data["results"]] == ["Mine"]
        res = c.post("/api/v1/ops/tasks/", {"title": "Buy tape", "assigned_to": team["staff2"].pk}, format="json")
        assert res.status_code == 201 and res.data["assigned_to"] == team["staff"].pk

    def test_staff_cannot_add_task_to_unrelated_event(self, team, client_obj):
        b = booking(client_obj)
        res = api(team["staff"]).post("/api/v1/ops/tasks/", {"title": "x", "booking": b.pk}, format="json")
        assert res.status_code == 403

    def test_when_filters(self, team):
        for title, delta in (("late", -1), ("now", 0), ("soon", 2)):
            Task.objects.create(title=title, due_date=TODAY + datetime.timedelta(days=delta))
        Task.objects.create(title="done", due_date=TODAY, status=Task.Status.DONE)
        c = api(team["manager"])
        titles = lambda w: [t["title"] for t in c.get(f"/api/v1/ops/tasks/?when={w}").data["results"]]  # noqa: E731
        assert titles("overdue") == ["late"] and titles("today") == ["now"] and titles("upcoming") == ["soon"]
        assert titles("done") == ["done"]

    def test_accountant_read_only(self, team):
        t = Task.objects.create(title="x")
        c = api(team["accountant"])
        assert c.get("/api/v1/ops/tasks/").status_code == 200
        assert c.patch(f"/api/v1/ops/tasks/{t.pk}/", {"status": "DONE"}, format="json").status_code == 403


@pytest.mark.django_db
class TestDashboard:
    def test_manager_dashboard(self, team, client_obj):
        b = booking(client_obj, days=2)
        booking(client_obj, days=20, title="Later")
        services.add_standard_checklist(b)
        crm_services.create_lead(name="New one", phone="+919222222222")
        data = api(team["manager"]).get("/api/v1/dashboard/").data
        assert [e["title"] for e in data["events"]] == ["Event +2"]
        assert data["events"][0]["tasks_total"] == len(services.STANDARD_CHECKLIST)
        assert data["counts"]["new_leads"] == 1 and data["counts"]["unassigned_leads"] == 1
        assert [e["title"] for e in data["attention"]["events_without_coordinator"]] == ["Event +2", "Later"]

    def test_staff_dashboard_is_personal(self, team, client_obj):
        mine = booking(client_obj, days=1)
        EventAssignment.objects.create(booking=mine, staff=team["staff"], role="Decor")
        booking(client_obj, days=1, title="Not mine")
        Task.objects.create(title="My task", assigned_to=team["staff"], due_date=TODAY)
        Task.objects.create(title="Other task", assigned_to=team["staff2"], due_date=TODAY)
        crm_services.create_lead(name="Not my lead", phone="+919222222222")
        data = api(team["staff"]).get("/api/v1/dashboard/").data
        assert [e["title"] for e in data["events"]] == ["Event +1"]
        assert [t["title"] for t in data["my_tasks"]] == ["My task"]
        assert data["counts"]["new_leads"] == 0 and "attention" not in data

    def test_accountant_gets_events_only(self, team, client_obj):
        booking(client_obj, days=1)
        data = api(team["accountant"]).get("/api/v1/dashboard/").data
        assert len(data["events"]) == 1 and "counts" not in data

    def test_in_progress_multi_day_event_still_shows(self, team, client_obj):
        b = booking(client_obj, days=-1, end_days=1, title="Ongoing")
        Booking.objects.filter(pk=b.pk).update(status=Booking.Status.IN_PROGRESS)
        data = api(team["manager"]).get("/api/v1/dashboard/").data
        assert "Ongoing" in [e["title"] for e in data["events"]]


@pytest.mark.django_db
def test_user_with_event_history_cannot_be_hard_deleted(team):
    """People are deactivated, not deleted; the database backs that up for event history."""
    from django.db.models import ProtectedError

    c = Client.objects.create(name="C", phone="+919000000009")
    EventAssignment.objects.create(booking=booking(c), staff=team["staff"], role="x")
    with pytest.raises(ProtectedError):
        team["staff"].delete()
