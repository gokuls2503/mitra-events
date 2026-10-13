import datetime
from decimal import Decimal as D

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounting import reports, services
from apps.accounting.calc import amount_in_words, compute_document
from apps.accounting.models import CompanyProfile, Expense, Invoice, JournalLine, Ledger, Quotation
from apps.accounts.models import Role, User
from apps.core.numbering import financial_year
from apps.crm.models import Client
from apps.crm import services as crm_services
from apps.operations.models import Vendor

TODAY = timezone.localdate()
FY = financial_year(TODAY)


def user(role):
    return User.objects.create_user(email=f"{role.lower()}@t.local", password="x-Pass-12345", full_name=role.title(), role=role)


def api(u):
    c = APIClient()
    c.force_authenticate(u)
    return c


@pytest.fixture
def setup(db):
    profile = CompanyProfile.load()
    profile.gstin = "33AAAAA0000A1Z5"
    profile.save()
    return {
        "owner": user(Role.OWNER),
        "accountant": user(Role.ACCOUNTANT),
        "manager": user(Role.MANAGER),
        "staff": user(Role.STAFF),
        "client": Client.objects.create(name="Kavya", phone="+919876543210", address="RS Puram", gstin=""),
        "cash": Ledger.objects.get(system_code="CASH"),
        "bank": Ledger.objects.get(name="Bank Account"),
    }


def item(rate="45000", qty="1", discount="0", tax="18", desc="Stage decor"):
    return {"description": desc, "quantity": D(qty), "rate": D(rate), "discount": D(discount), "tax_rate": D(tax), "sac": "998596"}


def issued_invoice(client, items=None, place="33", **kw):
    inv = services.save_invoice(client=client, items=items or [item()], place_of_supply=place, **kw)
    return services.issue_invoice(inv)


def assert_books_balance():
    totals = JournalLine.objects.filter(entry__is_cancelled=False).values_list("debit", "credit")
    assert sum(d for d, _ in totals) == sum(c for _, c in totals)
    tb = reports.trial_balance(TODAY)
    assert tb["total_debit"] == tb["total_credit"]


# --- Maths -------------------------------------------------------------------------


class TestCalc:
    def test_intra_state_splits_cgst_sgst_and_rounds_to_rupee(self):
        t = compute_document([item(), item(rate="1999.99", qty="3", discount="500")], intra_state=True)
        assert t.taxable_total == D("50499.97")
        assert (t.cgst_total, t.sgst_total, t.igst_total) == (D("4545.00"), D("4545.00"), D("0.00"))
        assert (t.total, t.round_off) == (D("59590.00"), D("0.03"))

    def test_inter_state_is_igst(self):
        t = compute_document([item(rate="10000")], intra_state=False)
        assert (t.cgst_total, t.igst_total, t.total) == (D("0"), D("1800.00"), D("11800.00"))

    def test_rounding_down(self):
        t = compute_document([item(rate="100.30", tax="0")], intra_state=True)
        assert (t.total, t.round_off) == (D("100.00"), D("-0.30"))

    def test_discount_bigger_than_line_rejected(self):
        with pytest.raises(ValueError):
            compute_document([item(rate="100", discount="101")], intra_state=True)

    @pytest.mark.parametrize(
        "amount,words",
        [
            ("100000", "Rupees One Lakh Only"),
            ("120450.50", "Rupees One Lakh Twenty Thousand Four Hundred Fifty and Fifty Paise Only"),
            ("10000000", "Rupees One Crore Only"),
            ("2050000000", "Rupees Two Hundred Five Crore Only"),
        ],
    )
    def test_amount_in_words(self, amount, words):
        assert amount_in_words(D(amount)) == words


# --- Invoices ------------------------------------------------------------------------


@pytest.mark.django_db
class TestInvoices:
    def test_seeded_chart_of_accounts(self, setup):
        codes = set(Ledger.objects.exclude(system_code=None).values_list("system_code", flat=True))
        assert {"CASH", "SALES", "OUTPUT_CGST", "OUTPUT_SGST", "OUTPUT_IGST", "INPUT_CGST", "ROUND_OFF"} <= codes
        assert CompanyProfile.load().default_tax_rate.rate == D("18")

    def test_draft_has_no_number_and_posts_nothing(self, setup):
        inv = services.save_invoice(client=setup["client"], items=[item()])
        assert inv.number is None and inv.journal is None
        assert not JournalLine.objects.exists()
        assert inv.due_date == TODAY + datetime.timedelta(days=7)

    def test_issue_numbers_snapshots_and_posts_balanced_entry(self, setup):
        inv = issued_invoice(setup["client"], items=[item(rate="45000"), item(rate="1999.99", qty="3", discount="500")])
        assert inv.number == f"INV/{FY}/0001" and inv.status == Invoice.Status.ISSUED
        assert inv.billing_name == "Kavya" and inv.billing_address == "RS Puram"
        lines = {l.ledger.system_code or "CLIENT": (l.debit, l.credit) for l in inv.journal.lines.select_related("ledger")}
        assert lines["CLIENT"] == (D("59590.00"), D("0"))
        assert lines["SALES"] == (D("0"), D("50499.97"))
        assert lines["OUTPUT_CGST"] == (D("0"), D("4545.00"))
        assert lines["ROUND_OFF"] == (D("0"), D("0.03"))
        assert "OUTPUT_IGST" not in lines  # zero lines are dropped
        assert_books_balance()

    def test_interstate_invoice_posts_igst(self, setup):
        inv = issued_invoice(setup["client"], items=[item(rate="10000")], place="29")
        codes = {l.ledger.system_code for l in inv.journal.lines.select_related("ledger")}
        assert "OUTPUT_IGST" in codes and "OUTPUT_CGST" not in codes

    def test_numbers_are_sequential_and_ignore_drafts(self, setup):
        a = issued_invoice(setup["client"])
        services.save_invoice(client=setup["client"], items=[item()])  # stays draft
        b = issued_invoice(setup["client"])
        assert (a.number, b.number) == (f"INV/{FY}/0001", f"INV/{FY}/0002")

    def test_prefix_is_configurable(self, setup):
        p = CompanyProfile.load()
        p.invoice_prefix = "MEM"
        p.save()
        assert issued_invoice(setup["client"]).number == f"MEM/{FY}/0001"

    def test_cannot_issue_without_company_gstin(self, setup):
        p = CompanyProfile.load()
        p.gstin = ""
        p.save()
        inv = services.save_invoice(client=setup["client"], items=[item()])
        res = api(setup["accountant"]).post(f"/api/v1/accounts/invoices/{inv.pk}/issue/")
        assert res.status_code == 400 and "GSTIN" in str(res.data)

    def test_issued_invoice_is_locked(self, setup):
        inv = issued_invoice(setup["client"])
        c = api(setup["accountant"])
        assert c.patch(f"/api/v1/accounts/invoices/{inv.pk}/", {"notes": "x"}, format="json").status_code == 400
        assert c.delete(f"/api/v1/accounts/invoices/{inv.pk}/").status_code == 400

    def test_cancel_keeps_number_and_voids_entry(self, setup):
        inv = issued_invoice(setup["client"])
        c = api(setup["accountant"])
        assert c.post(f"/api/v1/accounts/invoices/{inv.pk}/cancel/", {}, format="json").status_code == 400  # needs reason
        res = c.post(f"/api/v1/accounts/invoices/{inv.pk}/cancel/", {"reason": "Client cancelled"}, format="json")
        assert res.status_code == 200 and res.data["status"] == "CANCELLED" and res.data["number"] == inv.number
        inv.refresh_from_db()
        assert inv.journal.is_cancelled
        assert reports.closing_balances()[services.client_ledger(setup["client"]).id] == 0
        assert issued_invoice(setup["client"]).number.endswith("0002")  # number never reused

    def test_api_create_and_issue(self, setup):
        c = api(setup["accountant"])
        res = c.post(
            "/api/v1/accounts/invoices/",
            {"client": setup["client"].pk, "items": [{"description": "Decor", "quantity": "1", "rate": "10000", "tax_rate": "18"}]},
            format="json",
        )
        assert res.status_code == 201, res.data
        assert res.data["total"] == "11800.00" and res.data["number"] is None
        res = c.post(f"/api/v1/accounts/invoices/{res.data['id']}/issue/")
        assert res.status_code == 200 and res.data["number"] == f"INV/{FY}/0001"

    def test_booking_must_belong_to_client(self, setup):
        other = Client.objects.create(name="Other", phone="+919000000001")
        b = crm_services.create_booking(client=other, title="x", event_type="WEDDING", event_date=TODAY, venue="v")
        res = api(setup["accountant"]).post(
            "/api/v1/accounts/invoices/",
            {"client": setup["client"].pk, "booking": b.pk, "items": [{"description": "x", "quantity": "1", "rate": "1", "tax_rate": "18"}]},
            format="json",
        )
        assert res.status_code == 400 and "booking" in res.data

    def test_pdf_renders(self, setup):
        inv = issued_invoice(setup["client"])
        res = api(setup["accountant"]).get(f"/api/v1/accounts/invoices/{inv.pk}/pdf/")
        assert res.status_code == 200 and res["Content-Type"] == "application/pdf"
        assert res.content[:4] == b"%PDF"


# --- Quotations -----------------------------------------------------------------------------


@pytest.mark.django_db
class TestQuotations:
    def test_manager_creates_and_converts_to_draft_invoice(self, setup):
        c = api(setup["manager"])
        res = c.post(
            "/api/v1/accounts/quotations/",
            {"client": setup["client"].pk, "items": [{"description": "Mandap", "quantity": "1", "rate": "50000", "tax_rate": "18"}]},
            format="json",
        )
        assert res.status_code == 201, res.data
        assert res.data["number"] == f"QT/{FY}/0001" and res.data["total"] == "59000.00"
        assert "advance" in res.data["terms"]  # default quotation terms applied
        res = c.post(f"/api/v1/accounts/quotations/{res.data['id']}/convert/")
        assert res.status_code == 201 and res.data["status"] == "DRAFT" and res.data["total"] == "59000.00"
        assert Quotation.objects.get().status == Quotation.Status.INVOICED
        assert c.post(f"/api/v1/accounts/quotations/{Quotation.objects.get().pk}/convert/").status_code == 400

    def test_cancelling_invoice_reopens_quotation(self, setup):
        q = services.save_quotation(client=setup["client"], items=[item()])
        inv = services.issue_invoice(services.quotation_to_invoice(q))
        services.cancel_invoice(inv, reason="Redo")
        q.refresh_from_db()
        assert q.status == Quotation.Status.ACCEPTED

    def test_quotation_pdf(self, setup):
        q = services.save_quotation(client=setup["client"], items=[item()])
        res = api(setup["manager"]).get(f"/api/v1/accounts/quotations/{q.pk}/pdf/")
        assert res.status_code == 200 and res.content[:4] == b"%PDF"


# --- Receipts -----------------------------------------------------------------------------


@pytest.mark.django_db
class TestReceipts:
    def test_part_then_full_payment(self, setup):
        inv = issued_invoice(setup["client"], items=[item(rate="10000")])  # 11,800
        services.create_receipt(client=setup["client"], amount=D("5000"), deposit_to=setup["bank"], mode="UPI", allocations=[(inv, D("5000"))])
        inv.refresh_from_db()
        assert (inv.status, inv.amount_paid, inv.balance_due) == (Invoice.Status.PARTIALLY_PAID, D("5000"), D("6800"))
        services.create_receipt(client=setup["client"], amount=D("6800"), deposit_to=setup["cash"], mode="CASH", allocations=[(inv, D("6800"))])
        inv.refresh_from_db()
        assert inv.status == Invoice.Status.PAID
        bal = reports.closing_balances()
        assert bal[services.client_ledger(setup["client"]).id] == 0
        assert bal[setup["bank"].id] == D("5000") and bal[setup["cash"].id] == D("6800")
        assert_books_balance()

    def test_cannot_over_apply(self, setup):
        inv = issued_invoice(setup["client"], items=[item(rate="1000")])  # 1,180
        res = api(setup["accountant"]).post(
            "/api/v1/accounts/receipts/",
            {"client": setup["client"].pk, "amount": "2000", "mode": "UPI", "deposit_to": setup["bank"].pk, "apply_to": [{"invoice": inv.pk, "amount": "1500"}]},
            format="json",
        )
        assert res.status_code == 400

    def test_must_deposit_to_cash_or_bank(self, setup):
        sales = Ledger.objects.get(system_code="SALES")
        res = api(setup["accountant"]).post(
            "/api/v1/accounts/receipts/",
            {"client": setup["client"].pk, "amount": "100", "mode": "CASH", "deposit_to": sales.pk},
            format="json",
        )
        assert res.status_code == 400 and "deposit_to" in res.data

    def test_advance_then_apply_later(self, setup):
        r = services.create_receipt(client=setup["client"], amount=D("20000"), deposit_to=setup["bank"], mode="BANK_TRANSFER")
        assert reports.receivables()["advances_total"] == D("20000")
        inv = issued_invoice(setup["client"], items=[item(rate="10000")])
        res = api(setup["accountant"]).post(f"/api/v1/accounts/receipts/{r.pk}/allocate/", {"apply_to": [{"invoice": inv.pk, "amount": "11800"}]}, format="json")
        assert res.status_code == 200 and res.data["unapplied"] == "8200.00"
        inv.refresh_from_db()
        assert inv.status == Invoice.Status.PAID

    def test_cancel_receipt_reopens_invoice(self, setup):
        inv = issued_invoice(setup["client"], items=[item(rate="1000")])
        r = services.create_receipt(client=setup["client"], amount=D("1180"), deposit_to=setup["cash"], mode="CASH", allocations=[(inv, D("1180"))])
        services.cancel_receipt(r)
        inv.refresh_from_db()
        assert inv.status == Invoice.Status.ISSUED and inv.amount_paid == 0
        assert reports.closing_balances()[setup["cash"].id] == 0

    def test_cannot_cancel_invoice_with_payments(self, setup):
        inv = issued_invoice(setup["client"], items=[item(rate="1000")])
        services.create_receipt(client=setup["client"], amount=D("100"), deposit_to=setup["cash"], mode="CASH", allocations=[(inv, D("100"))])
        res = api(setup["accountant"]).post(f"/api/v1/accounts/invoices/{inv.pk}/cancel/", {"reason": "x"}, format="json")
        assert res.status_code == 400

    def test_receipt_pdf(self, setup):
        r = services.create_receipt(client=setup["client"], amount=D("500"), deposit_to=setup["cash"], mode="CASH")
        res = api(setup["accountant"]).get(f"/api/v1/accounts/receipts/{r.pk}/pdf/")
        assert res.status_code == 200 and res.content[:4] == b"%PDF"


# --- Expenses ------------------------------------------------------------------------------


@pytest.mark.django_db
class TestExpenses:
    def test_paid_expense_with_gst(self, setup):
        flowers = Ledger.objects.get(name="Flowers & Decor Materials")
        e = services.save_expense(date=TODAY, expense_ledger=flowers, description="Roses", amount=D("10000"), tax_rate=D("5"), paid_from=setup["cash"])
        assert (e.cgst, e.sgst, e.total, e.number) == (D("250.00"), D("250.00"), D("10500.00"), f"EXP/{FY}/0001")
        bal = reports.closing_balances()
        assert bal[flowers.id] == D("10000") and bal[setup["cash"].id] == D("-10500")
        assert bal[Ledger.objects.get(system_code="INPUT_CGST").id] == D("250")
        assert_books_balance()

    def test_on_credit_goes_to_vendor_then_vendor_is_paid(self, setup):
        vendor = Vendor.objects.create(name="Rose Florist", category="FLORIST", phone="+919111111111")
        charges = Ledger.objects.get(name="Vendor Charges")
        services.save_expense(date=TODAY, expense_ledger=charges, vendor=vendor, description="Mandap flowers", amount=D("8000"))
        assert reports.payables()["total"] == D("8000")
        vl = services.vendor_ledger(vendor)
        api(setup["accountant"]).post(
            "/api/v1/accounts/vouchers/",
            {"voucher_type": "PAYMENT", "date": TODAY.isoformat(), "narration": "Paid florist", "lines": [
                {"ledger": vl.pk, "debit": "8000", "credit": "0"},
                {"ledger": setup["bank"].pk, "debit": "0", "credit": "8000"},
            ]},
            format="json",
        )
        assert reports.payables()["total"] == 0
        assert_books_balance()

    def test_needs_paid_from_or_vendor(self, setup):
        res = api(setup["accountant"]).post(
            "/api/v1/accounts/expenses/",
            {"date": TODAY.isoformat(), "expense_ledger": Ledger.objects.get(name="Rent").pk, "description": "Rent", "amount": "15000"},
            format="json",
        )
        assert res.status_code == 400

    def test_expense_head_must_be_an_expense(self, setup):
        res = api(setup["accountant"]).post(
            "/api/v1/accounts/expenses/",
            {"date": TODAY.isoformat(), "expense_ledger": setup["bank"].pk, "description": "x", "amount": "1", "paid_from": setup["cash"].pk},
            format="json",
        )
        assert res.status_code == 400

    def test_edit_reposts_and_cancel_voids(self, setup):
        rent = Ledger.objects.get(name="Rent")
        e = services.save_expense(date=TODAY, expense_ledger=rent, description="Rent", amount=D("15000"), paid_from=setup["bank"])
        res = api(setup["accountant"]).patch(f"/api/v1/accounts/expenses/{e.pk}/", {"amount": "16000"}, format="json")
        assert res.status_code == 200, res.data
        assert reports.closing_balances()[rent.id] == D("16000")
        assert JournalLine.objects.filter(entry=e.journal).count() == 2  # rewritten, not duplicated
        api(setup["accountant"]).post(f"/api/v1/accounts/expenses/{e.pk}/cancel/")
        assert reports.closing_balances()[rent.id] == 0


# --- Vouchers & reports -----------------------------------------------------------------------


@pytest.mark.django_db
class TestVouchersAndReports:
    def test_unbalanced_voucher_rejected(self, setup):
        res = api(setup["accountant"]).post(
            "/api/v1/accounts/vouchers/",
            {"voucher_type": "JOURNAL", "date": TODAY.isoformat(), "lines": [
                {"ledger": setup["cash"].pk, "debit": "100", "credit": "0"},
                {"ledger": setup["bank"].pk, "debit": "0", "credit": "90"},
            ]},
            format="json",
        )
        assert res.status_code == 400 and "match" in str(res.data)

    def test_contra_only_between_cash_and_bank(self, setup):
        rent = Ledger.objects.get(name="Rent")
        with pytest.raises(Exception):
            services.create_voucher(voucher_type="CONTRA", date=TODAY, narration="", lines=[(rent, 100, 0, ""), (setup["cash"], 0, 100, "")])

    def test_document_entries_cannot_be_cancelled_as_vouchers(self, setup):
        inv = issued_invoice(setup["client"])
        res = api(setup["accountant"]).post(f"/api/v1/accounts/vouchers/{inv.journal_id}/cancel/")
        assert res.status_code == 400

    def test_profit_and_loss_and_balance_sheet(self, setup):
        # Capital 50,000 into bank (opening balances), one sale, one expense.
        setup["bank"].opening_balance = D("50000")
        setup["bank"].save()
        cap = Ledger.objects.get(system_code="CAPITAL")
        cap.opening_balance = D("-50000")
        cap.save()
        inv = issued_invoice(setup["client"], items=[item(rate="100000")])  # 118,000
        services.create_receipt(client=setup["client"], amount=D("118000"), deposit_to=setup["bank"], mode="UPI", allocations=[(inv, D("118000"))])
        services.save_expense(date=TODAY, expense_ledger=Ledger.objects.get(name="Labour & Helpers"), description="Helpers", amount=D("30000"), paid_from=setup["cash"])
        pl = reports.profit_and_loss(TODAY.replace(day=1), TODAY)
        assert pl["sales"]["total"] == D("100000") and pl["direct_expenses"]["total"] == D("30000")
        assert pl["gross_profit"] == pl["net_profit"] == D("70000")
        bs = reports.balance_sheet(TODAY)
        assert bs["total_assets"] == bs["total_liabilities"]
        assert bs["profit_and_loss"] == D("70000") and bs["opening_difference"] is None
        assert_books_balance()

    def test_opening_difference_is_reported(self, setup):
        setup["cash"].opening_balance = D("1000")
        setup["cash"].save()
        tb = reports.trial_balance(TODAY)
        assert tb["opening_difference"] == {"amount": D("1000"), "side": "Dr"}

    def test_gst_summary_nets_input_against_output(self, setup):
        b2b = Client.objects.create(name="Acme", phone="+919000000002", gstin="33ABCDE1234F1Z5")
        issued_invoice(b2b, items=[item(rate="100000")])  # CGST 9000, SGST 9000
        issued_invoice(setup["client"], items=[item(rate="10000")], place="29")  # IGST 1800
        services.save_expense(date=TODAY, expense_ledger=Ledger.objects.get(name="Vendor Charges"), description="x", amount=D("20000"), tax_rate=D("18"), paid_from=setup["cash"])
        g = reports.gst_summary(TODAY.replace(day=1), TODAY)
        assert (g["b2b_count"], g["b2c_count"]) == (1, 1)
        assert g["outward_totals"]["cgst"] == D("9000") and g["outward_totals"]["igst"] == D("1800")
        assert g["net_payable"] == {"cgst": D("7200"), "sgst": D("7200"), "igst": D("1800")}

    def test_receivables_ageing(self, setup):
        inv = issued_invoice(setup["client"], items=[item(rate="1000")], invoice_date=TODAY - datetime.timedelta(days=50), due_date=TODAY - datetime.timedelta(days=40))
        data = reports.receivables()
        assert data["clients"][0]["31_60"] == inv.total and data["totals"]["total"] == inv.total

    def test_ledger_statement_running_balance(self, setup):
        inv = issued_invoice(setup["client"], items=[item(rate="1000")])
        services.create_receipt(client=setup["client"], amount=D("500"), deposit_to=setup["cash"], mode="CASH", allocations=[(inv, D("500"))])
        st = reports.ledger_statement(services.client_ledger(setup["client"]), TODAY, TODAY)
        assert [r["balance"]["amount"] for r in st["rows"]] == [D("1180.00"), D("680.00")]
        assert st["closing"] == {"amount": D("680.00"), "side": "Dr"}
        assert "Sales" in st["rows"][0]["particulars"]

    @pytest.mark.parametrize("name", ["trial-balance", "profit-loss", "balance-sheet", "gst", "receivables", "payables", "day-book"])
    def test_reports_render_and_export(self, setup, name):
        issued_invoice(setup["client"])
        c = api(setup["accountant"])
        assert c.get(f"/api/v1/accounts/reports/{name}/").status_code == 200
        res = c.get(f"/api/v1/accounts/reports/{name}/?export=xlsx")
        assert res.status_code == 200 and res.content[:2] == b"PK"  # xlsx is a zip


# --- Permissions & settings ---------------------------------------------------------------------


@pytest.mark.django_db
class TestPermissions:
    def test_staff_has_no_access(self, setup):
        c = api(setup["staff"])
        for url in ("/api/v1/accounts/invoices/", "/api/v1/accounts/quotations/", "/api/v1/accounts/settings/", "/api/v1/accounts/ledgers/"):
            assert c.get(url).status_code == 403, url

    def test_manager_reads_invoices_but_cannot_write_or_see_reports(self, setup):
        inv = issued_invoice(setup["client"])
        c = api(setup["manager"])
        assert c.get(f"/api/v1/accounts/invoices/{inv.pk}/").status_code == 200
        assert c.post(f"/api/v1/accounts/invoices/{inv.pk}/cancel/", {"reason": "x"}, format="json").status_code == 403
        assert c.get("/api/v1/accounts/reports/profit-loss/").status_code == 403

    def test_manager_sees_no_margin_on_event_summary(self, setup):
        b = crm_services.create_booking(client=setup["client"], title="x", event_type="WEDDING", event_date=TODAY, venue="v")
        assert api(setup["manager"]).get(f"/api/v1/accounts/bookings/{b.pk}/summary/").data["margin"] is None
        assert api(setup["owner"]).get(f"/api/v1/accounts/bookings/{b.pk}/summary/").data["margin"] is not None

    def test_settings_validate_gstin_against_state(self, setup):
        c = api(setup["accountant"])
        assert c.patch("/api/v1/accounts/settings/", {"gstin": "29ABCDE1234F1Z5"}, format="json").status_code == 400
        res = c.patch("/api/v1/accounts/settings/", {"gstin": "33abcde1234f1z5", "bank_name": "SBI", "invoice_prefix": "mem"}, format="json")
        assert res.status_code == 200 and res.data["gstin"] == "33ABCDE1234F1Z5" and res.data["invoice_prefix"] == "MEM"

    def test_accountant_can_edit_client_billing(self, setup):
        res = api(setup["accountant"]).patch(f"/api/v1/crm/clients/{setup['client'].pk}/", {"gstin": "33ABCDE1234F1Z5"}, format="json")
        assert res.status_code == 200

    def test_event_summary_counts_split_receipts_once(self, setup):
        b1 = crm_services.create_booking(client=setup["client"], title="A", event_type="WEDDING", event_date=TODAY, venue="v")
        b2 = crm_services.create_booking(client=setup["client"], title="B", event_type="WEDDING", event_date=TODAY, venue="v")
        i1 = issued_invoice(setup["client"], items=[item(rate="1000")], booking=b1)
        i2 = issued_invoice(setup["client"], items=[item(rate="1000")], booking=b2)
        services.create_receipt(client=setup["client"], amount=D("2360"), deposit_to=setup["cash"], mode="CASH", booking=b1, allocations=[(i1, D("1180")), (i2, D("1180"))])
        assert api(setup["owner"]).get(f"/api/v1/accounts/bookings/{b1.pk}/summary/").data["received"] == D("1180")

    def test_dashboard_finance_for_owner_only(self, setup):
        issued_invoice(setup["client"])
        assert "finance" in api(setup["owner"]).get("/api/v1/dashboard/").data
        assert "finance" not in api(setup["manager"]).get("/api/v1/dashboard/").data


@pytest.mark.django_db
def test_expense_attachment_upload(setup, tmp_path, settings):
    from django.core.files.uploadedfile import SimpleUploadedFile

    settings.MEDIA_ROOT = tmp_path
    res = api(setup["accountant"]).post(
        "/api/v1/accounts/expenses/",
        {
            "date": TODAY.isoformat(), "expense_ledger": Ledger.objects.get(name="Transport").pk, "description": "Tempo",
            "amount": "1200", "paid_from": setup["cash"].pk, "attachment": SimpleUploadedFile("bill.pdf", b"%PDF-1.4 test", content_type="application/pdf"),
        },
        format="multipart",
    )
    assert res.status_code == 201, res.data
    assert res.data["attachment"].startswith("/media/bills/")
    assert Expense.objects.get().total == D("1200.00")
