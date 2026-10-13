import datetime
from decimal import Decimal as D

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounting import reports, services
from apps.accounting.models import CompanyProfile, Ledger
from apps.accounts.models import Role, User
from apps.analytics import metrics
from apps.crm import services as crm
from apps.crm.models import Client, Lead

TODAY = timezone.localdate()
MONTH_START = TODAY.replace(day=1)


def user(role):
    return User.objects.create_user(email=f"{role.lower()}@t.local", password="x-Pass-12345", full_name=role.title(), role=role)


def api(u):
    c = APIClient()
    c.force_authenticate(u)
    return c


def item(rate):
    return {"description": "Decor", "quantity": D("1"), "rate": D(rate), "discount": D("0"), "tax_rate": D("18")}


@pytest.fixture
def books(db):
    p = CompanyProfile.load()
    p.gstin = "33AAAAA0000A1Z5"
    p.save()
    client = Client.objects.create(name="Kavya", phone="+919876543210")
    staff = user(Role.STAFF)
    # Leads: 4 this period from two sources, 1 won (converted), 1 lost.
    won = crm.create_lead(name="A", phone="+919000000001", source="WEBSITE", assigned_to=staff)
    crm.create_lead(name="B", phone="+919000000002", source="WEBSITE", assigned_to=staff)
    lost = crm.create_lead(name="C", phone="+919000000003", source="INSTAGRAM")
    crm.create_lead(name="D", phone="+919000000004", source="INSTAGRAM")
    booking = crm.convert_to_booking(won, title="A wedding", event_type="WEDDING", event_date=TODAY + datetime.timedelta(days=20), venue="Hall", agreed_amount=D("100000"))
    crm.change_status(lost, Lead.Status.LOST, lost_reason="Budget too low ")
    # Money: invoice 100,000 + GST, 50,000 received, 30,000 expenses.
    inv = services.issue_invoice(services.save_invoice(client=booking.client, booking=booking, items=[item("100000")]))
    services.create_receipt(client=booking.client, amount=D("50000"), deposit_to=Ledger.objects.get(system_code="CASH"), mode="CASH", allocations=[(inv, D("50000"))])
    services.save_expense(date=TODAY, expense_ledger=Ledger.objects.get(name="Labour & Helpers"), description="Helpers", amount=D("30000"), paid_from=Ledger.objects.get(system_code="CASH"))
    return {"client": client, "staff": staff, "booking": booking}


class TestPeriods:
    def test_previous_period_is_same_length_and_adjacent(self):
        assert metrics.previous_period(datetime.date(2026, 4, 1), datetime.date(2026, 6, 30)) == (datetime.date(2025, 12, 31), datetime.date(2026, 3, 31))

    def test_same_period_last_year_handles_leap_day(self):
        assert metrics.same_period_last_year(datetime.date(2028, 2, 1), datetime.date(2028, 2, 29)) == (datetime.date(2027, 2, 1), datetime.date(2027, 2, 28))

    def test_month_starts(self):
        assert metrics.month_starts(datetime.date(2026, 11, 15), datetime.date(2027, 2, 3)) == [
            datetime.date(2026, 11, 1), datetime.date(2026, 12, 1), datetime.date(2027, 1, 1), datetime.date(2027, 2, 1),
        ]


@pytest.mark.django_db
class TestOverview:
    def test_money_matches_profit_and_loss(self, books):
        data = metrics.overview(MONTH_START, TODAY, show_profit=True, show_leads=True, show_team=True)
        pl = reports.profit_and_loss(MONTH_START, TODAY)
        assert data["kpis"]["revenue"]["value"] == D("100000") == pl["sales"]["total"]
        assert data["kpis"]["profit"]["value"] == pl["net_profit"] == D("70000")
        assert data["kpis"]["margin_pct"]["value"] == 70.0
        assert data["kpis"]["collected"]["value"] == D("50000")
        assert data["monthly"][-1]["revenue"] == D("100000")

    def test_leads_conversion_sources_and_lost_reasons(self, books):
        data = metrics.overview(MONTH_START, TODAY, show_profit=True, show_leads=True, show_team=True)
        leads = data["leads"]
        assert (leads["count"], leads["won"], leads["lost"]) == (4, 1, 1)
        assert leads["conversion_pct"] == 25.0 and leads["win_rate_pct"] == 50.0
        by_source = {s["source"]: s for s in leads["by_source"]}
        assert by_source["WEBSITE"]["won"] == 1 and by_source["WEBSITE"]["conversion_pct"] == 50.0
        assert by_source["WEBSITE"]["booked_value"] == D("100000")
        assert leads["lost_reasons"] == [{"reason": "Budget too low", "count": 1}]
        assert data["team"][0]["name"] == "Staff" and data["team"][0]["won"] == 1

    def test_bookings_and_event_types(self, books):
        data = metrics.overview(MONTH_START, TODAY, show_profit=True, show_leads=True, show_team=True)
        assert data["kpis"]["bookings"]["value"] == 1 and data["kpis"]["average_booking"]["value"] == D("100000")
        assert data["event_types"][0]["label"] == "Wedding"
        assert data["top_clients"][0]["revenue"] == D("100000") and data["top_clients"][0]["outstanding"] == D("68000")

    def test_previous_period_compared(self, books):
        data = metrics.overview(MONTH_START, TODAY, show_profit=True, show_leads=True, show_team=True)
        assert data["kpis"]["revenue"]["previous"] == 0 and data["kpis"]["leads"]["previous"] == 0


@pytest.mark.django_db
class TestAccess:
    def test_owner_sees_everything(self, books):
        data = api(user(Role.OWNER)).get("/api/v1/analytics/overview/").data
        assert {"profit", "expenses", "leads"} <= set(data["kpis"]) and "team" in data and "profit" in data["monthly"][-1]

    def test_manager_sees_no_profit(self, books):
        data = api(user(Role.MANAGER)).get("/api/v1/analytics/overview/").data
        assert "profit" not in data["kpis"] and "expenses" not in data["kpis"]
        assert "profit" not in data["monthly"][-1] and "expenses" not in data["monthly"][-1]
        assert "leads" in data and "team" in data

    def test_accountant_sees_money_not_pipeline(self, books):
        data = api(user(Role.ACCOUNTANT)).get("/api/v1/analytics/overview/").data
        assert "profit" in data["kpis"] and "leads" not in data and "team" not in data

    def test_staff_blocked(self, books):
        assert api(books["staff"]).get("/api/v1/analytics/overview/").status_code == 403

    def test_bad_ranges(self, books):
        c = api(user(Role.OWNER))
        assert c.get("/api/v1/analytics/overview/?from=2026-10-10&to=2026-10-01").status_code == 400
        assert c.get("/api/v1/analytics/overview/?from=2020-01-01&to=2026-10-01").status_code == 400

    def test_compare_modes(self, books):
        c = api(user(Role.OWNER))
        assert c.get("/api/v1/analytics/overview/?from=2026-04-01&to=2026-06-30").data["previous"]["date_from"] == datetime.date(2025, 4, 1)
        assert c.get("/api/v1/analytics/overview/?from=2026-04-01&to=2026-06-30&compare=previous").data["previous"]["date_from"] == datetime.date(2025, 12, 31)
        assert c.get("/api/v1/analytics/overview/?compare=bogus").status_code == 400

    def test_excel_export(self, books):
        res = api(user(Role.MANAGER)).get("/api/v1/analytics/overview/?export=xlsx")
        assert res.status_code == 200 and res.content[:2] == b"PK"
