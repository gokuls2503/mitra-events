import datetime

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.core.numbering import financial_year, next_number
from apps.crm import services
from apps.crm.models import Booking, Client, FollowUp, Lead, LeadActivity

TOMORROW = timezone.localdate() + datetime.timedelta(days=1)
NEXT_MONTH = timezone.localdate() + datetime.timedelta(days=30)


def user(role, name=None):
    name = name or role.lower()
    return User.objects.create_user(email=f"{name}@t.local", password="x-Pass-12345", full_name=name.title(), role=role)


def api(u=None):
    c = APIClient()
    if u:
        c.force_authenticate(u)
    return c


def lead(**kw):
    data = {"name": "Kavya", "phone": "+919876543210", "event_type": "WEDDING"}
    data.update(kw)
    return services.create_lead(**data)


@pytest.fixture
def team(db):
    return {
        "owner": user(Role.OWNER),
        "manager": user(Role.MANAGER),
        "staff": user(Role.STAFF),
        "staff2": user(Role.STAFF, "staff2"),
        "accountant": user(Role.ACCOUNTANT),
    }


def booking_payload(**kw):
    data = {"title": "Kavya wedding", "event_type": "WEDDING", "event_date": NEXT_MONTH.isoformat(), "venue": "Hall A"}
    data.update(kw)
    return data


# --- Numbering ---------------------------------------------------------------


class TestNumbering:
    @pytest.mark.parametrize(
        "date,fy",
        [(datetime.date(2026, 3, 31), "2025-26"), (datetime.date(2026, 4, 1), "2026-27"), (datetime.date(2027, 1, 15), "2026-27")],
    )
    def test_financial_year(self, date, fy):
        assert financial_year(date) == fy

    @pytest.mark.django_db
    def test_sequence_restarts_each_financial_year(self):
        assert next_number("BK", datetime.date(2026, 5, 1)) == "BK/2026-27/0001"
        assert next_number("BK", datetime.date(2026, 6, 1)) == "BK/2026-27/0002"
        assert next_number("BK", datetime.date(2027, 4, 2)) == "BK/2027-28/0001"
        assert next_number("INV", datetime.date(2026, 6, 1)) == "INV/2026-27/0001"


# --- Lead rules ----------------------------------------------------------------


@pytest.mark.django_db
class TestLeadRules:
    def test_created_lead_has_timeline_entry(self):
        l = lead(source=Lead.Source.PHONE)
        assert l.activities.get().kind == LeadActivity.Kind.CREATED
        assert "Phone call" in l.activities.get().text

    def test_returning_client_is_linked_by_phone(self):
        c = Client.objects.create(name="Kavya R", phone="+919876543210")
        l = lead()
        assert l.client == c
        assert "returning client" in l.activities.get().text

    def test_website_enquiry_goes_through_service(self, team):
        res = api().post("/api/v1/website/enquiry/", {"name": "Web", "phone": "9876543210"}, format="json")
        assert res.status_code == 201
        assert Lead.objects.get().activities.filter(kind=LeadActivity.Kind.CREATED).exists()

    def test_status_change_logs_and_requires_reason_for_lost(self, team):
        l = lead()
        c = api(team["manager"])
        assert c.post(f"/api/v1/crm/leads/{l.pk}/status/", {"status": "LOST"}, format="json").status_code == 400
        res = c.post(f"/api/v1/crm/leads/{l.pk}/status/", {"status": "CONTACTED", "note": "Called, wants a visit"}, format="json")
        assert res.status_code == 200 and res.data["status"] == "CONTACTED"
        entry = l.activities.filter(kind=LeadActivity.Kind.STATUS).get()
        assert "New → Contacted" in entry.text and "wants a visit" in entry.text

    def test_won_only_via_conversion(self, team):
        l = lead()
        res = api(team["manager"]).post(f"/api/v1/crm/leads/{l.pk}/status/", {"status": "WON"}, format="json")
        assert res.status_code == 400

    def test_losing_a_lead_clears_pending_follow_ups(self, team):
        l = lead()
        FollowUp.objects.create(lead=l, due_at=timezone.now())
        services.change_status(l, Lead.Status.LOST, lost_reason="Budget")
        assert not l.follow_ups.exists()


# --- Conversion ------------------------------------------------------------------


@pytest.mark.django_db
class TestConversion:
    def test_convert_creates_client_and_booking(self, team):
        l = lead(email="k@example.com")
        res = api(team["manager"]).post(
            f"/api/v1/crm/leads/{l.pk}/convert/",
            booking_payload(agreed_amount="150000", client_gstin="33abcde1234f1z5"),
            format="json",
        )
        assert res.status_code == 201, res.data
        assert res.data["number"].startswith(f"BK/{financial_year()}/")
        l.refresh_from_db()
        assert l.status == Lead.Status.WON and l.client.phone == "+919876543210"
        assert l.client.gstin == "33ABCDE1234F1Z5" and l.client.email == "k@example.com"
        assert l.activities.filter(kind=LeadActivity.Kind.CONVERTED).exists()

    def test_convert_reuses_existing_client(self, team):
        c = Client.objects.create(name="Kavya", phone="+919876543210")
        l = lead()
        api(team["owner"]).post(f"/api/v1/crm/leads/{l.pk}/convert/", booking_payload(), format="json")
        assert Client.objects.count() == 1 and c.bookings.count() == 1

    def test_cannot_convert_twice(self, team):
        l = lead()
        c = api(team["manager"])
        assert c.post(f"/api/v1/crm/leads/{l.pk}/convert/", booking_payload(), format="json").status_code == 201
        assert c.post(f"/api/v1/crm/leads/{l.pk}/convert/", booking_payload(), format="json").status_code == 400

    def test_cannot_change_status_after_booking(self, team):
        l = lead()
        c = api(team["manager"])
        c.post(f"/api/v1/crm/leads/{l.pk}/convert/", booking_payload(), format="json")
        res = c.post(f"/api/v1/crm/leads/{l.pk}/status/", {"status": "LOST", "lost_reason": "x"}, format="json")
        assert res.status_code == 400

    def test_end_date_before_start_rejected(self, team):
        l = lead()
        res = api(team["manager"]).post(
            f"/api/v1/crm/leads/{l.pk}/convert/",
            booking_payload(end_date=(NEXT_MONTH - datetime.timedelta(days=1)).isoformat()),
            format="json",
        )
        assert res.status_code == 400 and "end_date" in res.data

    def test_staff_cannot_convert(self, team):
        l = lead(assigned_to=team["staff"])
        res = api(team["staff"]).post(f"/api/v1/crm/leads/{l.pk}/convert/", booking_payload(), format="json")
        assert res.status_code == 403


# --- Role scoping --------------------------------------------------------------------


@pytest.mark.django_db
class TestScoping:
    def test_staff_only_see_their_leads(self, team):
        mine = lead(name="Mine", assigned_to=team["staff"])
        lead(name="Theirs", phone="+919876500000", assigned_to=team["staff2"])
        lead(name="Nobody's", phone="+919876511111")
        res = api(team["staff"]).get("/api/v1/crm/leads/")
        assert [r["name"] for r in res.data["results"]] == ["Mine"]
        other = Lead.objects.get(name="Theirs")
        assert api(team["staff"]).get(f"/api/v1/crm/leads/{other.pk}/").status_code == 404
        assert api(team["staff"]).get(f"/api/v1/crm/leads/{mine.pk}/").status_code == 200

    def test_staff_create_is_self_assigned(self, team):
        res = api(team["staff"]).post(
            "/api/v1/crm/leads/",
            {"name": "Walk-in", "phone": "9876543210", "source": "WALK_IN", "assigned_to": team["staff2"].pk},
            format="json",
        )
        assert res.status_code == 201, res.data
        assert Lead.objects.get().assigned_to == team["staff"]

    def test_staff_cannot_reassign_or_delete(self, team):
        l = lead(assigned_to=team["staff"])
        c = api(team["staff"])
        assert c.post(f"/api/v1/crm/leads/{l.pk}/assign/", {"assigned_to": team["staff2"].pk}, format="json").status_code == 403
        assert c.delete(f"/api/v1/crm/leads/{l.pk}/").status_code == 403

    def test_staff_can_work_their_lead(self, team):
        l = lead(assigned_to=team["staff"])
        c = api(team["staff"])
        assert c.post(f"/api/v1/crm/leads/{l.pk}/status/", {"status": "CONTACTED"}, format="json").status_code == 200
        assert c.post(f"/api/v1/crm/leads/{l.pk}/activities/", {"kind": "CALL", "text": "Spoke"}, format="json").status_code == 201
        res = c.post(
            "/api/v1/crm/follow-ups/",
            {"lead": l.pk, "due_at": timezone.now().isoformat(), "kind": "CALL", "assigned_to": team["staff2"].pk},
            format="json",
        )
        assert res.status_code == 201 and res.data["assigned_to"] == team["staff"].pk

    def test_staff_cannot_add_follow_up_to_others_lead(self, team):
        other = lead(assigned_to=team["staff2"])
        res = api(team["staff"]).post(
            "/api/v1/crm/follow-ups/", {"lead": other.pk, "due_at": timezone.now().isoformat()}, format="json"
        )
        assert res.status_code == 403

    def test_accountant_is_read_only(self, team):
        l = lead()
        c = api(team["accountant"])
        assert c.get("/api/v1/crm/leads/").status_code == 200
        assert c.get(f"/api/v1/crm/leads/{l.pk}/activities/").status_code == 200
        assert c.post(f"/api/v1/crm/leads/{l.pk}/status/", {"status": "CONTACTED"}, format="json").status_code == 403
        assert c.post(f"/api/v1/crm/leads/{l.pk}/activities/", {"kind": "NOTE", "text": "x"}, format="json").status_code == 403
        assert c.patch(f"/api/v1/crm/leads/{l.pk}/", {"venue": "x"}, format="json").status_code == 403

    def test_staff_see_only_events_they_coordinate(self, team):
        c = Client.objects.create(name="C", phone="+919000000001")
        services.create_booking(client=c, title="Mine", event_type="BIRTHDAY", event_date=NEXT_MONTH, venue="V", coordinator=team["staff"])
        services.create_booking(client=c, title="Other", event_type="BIRTHDAY", event_date=NEXT_MONTH, venue="V")
        res = api(team["staff"]).get("/api/v1/crm/bookings/")
        assert [b["title"] for b in res.data["results"]] == ["Mine"]
        assert api(team["staff"]).post("/api/v1/crm/bookings/", {}, format="json").status_code == 403

    def test_staff_clients_limited_to_their_work(self, team):
        mine = Client.objects.create(name="Mine", phone="+919000000001")
        Client.objects.create(name="Other", phone="+919000000002")
        lead(phone=mine.phone, assigned_to=team["staff"])
        res = api(team["staff"]).get("/api/v1/crm/clients/")
        assert [c["name"] for c in res.data["results"]] == ["Mine"]

    def test_only_managers_assign(self, team):
        l = lead()
        res = api(team["manager"]).post(f"/api/v1/crm/leads/{l.pk}/assign/", {"assigned_to": team["staff"].pk}, format="json")
        assert res.status_code == 200 and res.data["assigned_to_detail"]["id"] == team["staff"].pk
        assert l.activities.filter(kind=LeadActivity.Kind.ASSIGNED).exists()

    def test_cannot_assign_to_accountant(self, team):
        l = lead()
        res = api(team["manager"]).post(f"/api/v1/crm/leads/{l.pk}/assign/", {"assigned_to": team["accountant"].pk}, format="json")
        assert res.status_code == 400


# --- Follow-ups, bookings, misc -------------------------------------------------------


@pytest.mark.django_db
class TestFollowUps:
    def test_due_filters(self, team):
        l = lead()
        now = timezone.localtime()  # "today" means today in India, not UTC
        FollowUp.objects.create(lead=l, due_at=now - datetime.timedelta(days=2), notes="overdue")
        FollowUp.objects.create(lead=l, due_at=now.replace(hour=23, minute=59), notes="today")
        FollowUp.objects.create(lead=l, due_at=now + datetime.timedelta(days=3), notes="upcoming")
        c = api(team["manager"])
        notes = lambda due: [f["notes"] for f in c.get(f"/api/v1/crm/follow-ups/?due={due}").data["results"]]  # noqa: E731
        assert notes("overdue") == ["overdue"]
        assert notes("today") == ["today"]
        assert notes("upcoming") == ["upcoming"]

    def test_complete_logs_outcome_and_locks(self, team):
        l = lead()
        fu = FollowUp.objects.create(lead=l, due_at=timezone.now())
        c = api(team["manager"])
        res = c.post(f"/api/v1/crm/follow-ups/{fu.pk}/complete/", {"outcome": "Booked site visit"}, format="json")
        assert res.status_code == 200 and res.data["completed_at"]
        assert "Booked site visit" in l.activities.filter(kind=LeadActivity.Kind.FOLLOW_UP).get().text
        assert c.post(f"/api/v1/crm/follow-ups/{fu.pk}/complete/", {}, format="json").status_code == 400
        assert c.patch(f"/api/v1/crm/follow-ups/{fu.pk}/", {"notes": "x"}, format="json").status_code == 400

    def test_no_follow_ups_on_closed_leads(self, team):
        l = lead()
        services.change_status(l, Lead.Status.LOST, lost_reason="Went elsewhere")
        res = api(team["manager"]).post("/api/v1/crm/follow-ups/", {"lead": l.pk, "due_at": timezone.now().isoformat()}, format="json")
        assert res.status_code == 400


@pytest.mark.django_db
class TestBookingsAndClients:
    def test_calendar_range_includes_multi_day_overlap(self, team):
        c = Client.objects.create(name="C", phone="+919000000001")
        d = datetime.date(2026, 11, 30)
        services.create_booking(client=c, title="Spans", event_type="WEDDING", event_date=d, end_date=d + datetime.timedelta(days=2), venue="V")
        services.create_booking(client=c, title="Before", event_type="WEDDING", event_date=datetime.date(2026, 11, 10), venue="V")
        res = api(team["manager"]).get("/api/v1/crm/bookings/?date_from=2026-12-01&date_to=2026-12-31")
        assert [b["title"] for b in res.data["results"]] == ["Spans"]

    def test_bookings_cannot_be_deleted(self, team):
        c = Client.objects.create(name="C", phone="+919000000001")
        b = services.create_booking(client=c, title="T", event_type="WEDDING", event_date=NEXT_MONTH, venue="V")
        assert api(team["owner"]).delete(f"/api/v1/crm/bookings/{b.pk}/").status_code == 405

    def test_direct_booking_for_existing_client(self, team):
        c = Client.objects.create(name="C", phone="+919000000001")
        res = api(team["manager"]).post("/api/v1/crm/bookings/", {**booking_payload(), "client": c.pk}, format="json")
        assert res.status_code == 201, res.data
        assert Booking.objects.get().number.startswith("BK/")

    def test_client_phone_unique_after_normalising(self, team):
        c = api(team["manager"])
        assert c.post("/api/v1/crm/clients/", {"name": "A", "phone": "98765 43210"}, format="json").status_code == 201
        assert c.post("/api/v1/crm/clients/", {"name": "B", "phone": "+91-9876543210"}, format="json").status_code == 400

    def test_client_with_history_cannot_be_deleted(self, team):
        c = Client.objects.create(name="C", phone="+919876543210")
        lead()
        assert api(team["owner"]).delete(f"/api/v1/crm/clients/{c.pk}/").status_code == 400

    def test_pipeline_counts_respect_scope(self, team):
        lead(assigned_to=team["staff"])
        lead(phone="+919000000009")
        assert api(team["manager"]).get("/api/v1/crm/leads/pipeline/").data["new_count"] == 2
        assert api(team["staff"]).get("/api/v1/crm/leads/pipeline/").data["new_count"] == 1

    def test_team_endpoint_excludes_accountants_and_inactive(self, team):
        team["staff2"].is_active = False
        team["staff2"].save()
        names = [u["full_name"] for u in api(team["staff"]).get("/api/v1/team/").data]
        assert "Accountant" not in names and "Staff2" not in names and "Staff" in names


# --- Edit enquiry: planning details ------------------------------------------------------


@pytest.mark.django_db
class TestEnquiryDetails:
    def edit(self, team, l, **body):
        return api(team["manager"]).patch(f"/api/v1/crm/leads/{l.pk}/", body, format="json")

    def test_saves_planning_details_and_extra_numbers(self, team):
        l = lead()
        res = self.edit(
            team,
            l,
            phone="98765 43210",
            extra_phones=["9445742696", "+91 98946 06292"],
            event_date=NEXT_MONTH.isoformat(),
            end_date=(NEXT_MONTH + datetime.timedelta(days=2)).isoformat(),
            start_time="18:30",
            setup_time="14:00",
            venue_address="KSP Complex, Sundrapuram",
            coordinator=team["staff"].pk,
        )
        assert res.status_code == 200, res.data
        assert res.data["extra_phones"] == ["+919445742696", "+919894606292"]
        assert res.data["start_time"] == "18:30:00" and res.data["coordinator"] == team["staff"].pk
        assert res.data["venue_address"] == "KSP Complex, Sundrapuram"

    def test_at_most_two_extra_numbers(self, team):
        res = self.edit(team, lead(), extra_phones=["9445742696", "9894606292", "9000000003"])
        assert res.status_code == 400 and "extra_phones" in res.data

    @pytest.mark.parametrize("extra", [["12345"], ["9876543210"], ["9445742696", "9445742696"]])
    def test_rejects_invalid_or_repeated_numbers(self, team, extra):
        assert self.edit(team, lead(), extra_phones=extra).status_code == 400

    def test_clearing_extra_numbers(self, team):
        l = lead()
        self.edit(team, l, extra_phones=["9445742696"])
        assert self.edit(team, l, extra_phones=[]).data["extra_phones"] == []

    def test_end_date_not_before_event_date(self, team):
        res = self.edit(team, lead(), event_date=NEXT_MONTH.isoformat(), end_date=TOMORROW.isoformat())
        assert res.status_code == 400 and "end_date" in res.data

    def test_coordinator_must_be_on_the_team(self, team):
        assert self.edit(team, lead(), coordinator=team["accountant"].pk).status_code == 400


@pytest.mark.django_db
class TestMultipleEventTypes:
    def test_kept_in_the_order_picked(self, team):
        l = lead(event_type="")
        res = api(team["manager"]).patch(
            f"/api/v1/crm/leads/{l.pk}/", {"event_types": ["ENGAGEMENT", "WEDDING", "BIRTHDAY"]}, format="json"
        )
        assert res.status_code == 200, res.data
        assert res.data["event_types"] == ["ENGAGEMENT", "WEDDING", "BIRTHDAY"]
        assert res.data["event_type"] == "ENGAGEMENT"  # the first one drives filters and booking conversion
        assert res.data["event_type_label"] == "Engagement, Wedding, Birthday"

    def test_clearing_and_duplicates(self, team):
        l = lead()
        c = api(team["manager"])
        assert c.patch(f"/api/v1/crm/leads/{l.pk}/", {"event_types": ["WEDDING", "WEDDING"]}, format="json").status_code == 400
        res = c.patch(f"/api/v1/crm/leads/{l.pk}/", {"event_types": []}, format="json")
        assert res.data["event_type"] == "" and res.data["event_type_label"] == ""

    def test_single_type_paths_still_fill_the_list(self, team):
        # Website enquiries and the New lead form set just one type.
        assert lead(event_type="RECEPTION").event_types == ["RECEPTION"]

    def test_filter_matches_any_picked_type(self, team):
        l = lead()
        api(team["manager"]).patch(f"/api/v1/crm/leads/{l.pk}/", {"event_types": ["ENGAGEMENT", "BIRTHDAY"]}, format="json")
        ids = [r["id"] for r in api(team["manager"]).get("/api/v1/crm/leads/?event_type=BIRTHDAY").data["results"]]
        assert l.pk in ids


@pytest.mark.django_db
class TestBookingEventTypes:
    def test_convert_keeps_all_types_in_order(self, team):
        res = api(team["manager"]).post(
            f"/api/v1/crm/leads/{lead().pk}/convert/",
            {k: v for k, v in booking_payload(event_types=["RECEPTION", "WEDDING"]).items() if k != "event_type"},
            format="json",
        )
        assert res.status_code == 201, res.data
        assert res.data["event_types"] == ["RECEPTION", "WEDDING"] and res.data["event_type"] == "RECEPTION"
        assert res.data["event_type_label"] == "Reception, Wedding"

    def test_convert_needs_at_least_one_type(self, team):
        body = {k: v for k, v in booking_payload(event_types=[]).items() if k != "event_type"}
        res = api(team["manager"]).post(f"/api/v1/crm/leads/{lead().pk}/convert/", body, format="json")
        assert res.status_code == 400 and "event_types" in res.data

    def test_edit_booking_types_and_filter(self, team):
        c = api(team["manager"])
        client = Client.objects.create(name="Kavya", phone="+919876543210")
        b = c.post("/api/v1/crm/bookings/", booking_payload(client=client.pk), format="json").data
        assert b["event_types"] == ["WEDDING"]  # single-type requests still fill the list
        res = c.patch(f"/api/v1/crm/bookings/{b['id']}/", {"event_types": ["ENGAGEMENT", "BIRTHDAY"]}, format="json")
        assert res.data["event_type"] == "ENGAGEMENT" and res.data["event_type_label"] == "Engagement, Birthday"
        assert c.patch(f"/api/v1/crm/bookings/{b['id']}/", {"event_types": []}, format="json").status_code == 400
        ids = [r["id"] for r in c.get("/api/v1/crm/bookings/?event_type=BIRTHDAY").data["results"]]
        assert b["id"] in ids


@pytest.mark.django_db
def test_convert_saves_times(team):
    res = api(team["manager"]).post(
        f"/api/v1/crm/leads/{lead().pk}/convert/", booking_payload(start_time="18:30", setup_time="14:00"), format="json"
    )
    assert res.status_code == 201, res.data
    assert (res.data["start_time"], res.data["setup_time"]) == ("18:30:00", "14:00:00")
