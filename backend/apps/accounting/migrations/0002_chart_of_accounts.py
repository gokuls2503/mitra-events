"""Standard chart of accounts, GST rates and company profile — the starting point for the books.

Everything here can be renamed or extended in the admin; ledgers with a system_code are the
ones the posting engine relies on (their names can change, their codes can't).
"""

from decimal import Decimal

from django.db import migrations

# (name, parent, nature, order)
GROUPS = [
    ("Capital Account", None, "LIABILITY", 1),
    ("Loans (Liability)", None, "LIABILITY", 2),
    ("Current Liabilities", None, "LIABILITY", 3),
    ("Duties & Taxes", "Current Liabilities", "LIABILITY", 4),
    ("Sundry Creditors", "Current Liabilities", "LIABILITY", 5),
    ("Fixed Assets", None, "ASSET", 10),
    ("Current Assets", None, "ASSET", 11),
    ("Bank Accounts", "Current Assets", "ASSET", 12),
    ("Cash-in-Hand", "Current Assets", "ASSET", 13),
    ("Sundry Debtors", "Current Assets", "ASSET", 14),
    ("Deposits (Asset)", "Current Assets", "ASSET", 15),
    ("Sales Accounts", None, "INCOME", 20),
    ("Indirect Incomes", None, "INCOME", 21),
    ("Direct Expenses", None, "EXPENSE", 30),
    ("Indirect Expenses", None, "EXPENSE", 31),
]

# (name, group, system_code)
LEDGERS = [
    ("Cash", "Cash-in-Hand", "CASH"),
    ("Bank Account", "Bank Accounts", None),
    ("Sales — Event Decoration Services", "Sales Accounts", "SALES"),
    ("Output CGST", "Duties & Taxes", "OUTPUT_CGST"),
    ("Output SGST", "Duties & Taxes", "OUTPUT_SGST"),
    ("Output IGST", "Duties & Taxes", "OUTPUT_IGST"),
    ("Input CGST", "Duties & Taxes", "INPUT_CGST"),
    ("Input SGST", "Duties & Taxes", "INPUT_SGST"),
    ("Input IGST", "Duties & Taxes", "INPUT_IGST"),
    ("Round Off", "Indirect Expenses", "ROUND_OFF"),
    ("Capital Account", "Capital Account", "CAPITAL"),
    # Common expense heads
    ("Flowers & Decor Materials", "Direct Expenses", None),
    ("Vendor Charges", "Direct Expenses", None),
    ("Labour & Helpers", "Direct Expenses", None),
    ("Transport", "Direct Expenses", None),
    ("Salaries", "Indirect Expenses", None),
    ("Rent", "Indirect Expenses", None),
    ("Electricity & Utilities", "Indirect Expenses", None),
    ("Marketing & Advertising", "Indirect Expenses", None),
    ("Office Expenses", "Indirect Expenses", None),
    ("Bank Charges", "Indirect Expenses", None),
]

RATES = [("GST 0%", "0"), ("GST 5%", "5"), ("GST 12%", "12"), ("GST 18%", "18"), ("GST 28%", "28")]


def forwards(apps, schema_editor):
    AccountGroup = apps.get_model("accounting", "AccountGroup")
    Ledger = apps.get_model("accounting", "Ledger")
    TaxRate = apps.get_model("accounting", "TaxRate")
    CompanyProfile = apps.get_model("accounting", "CompanyProfile")

    groups = {}
    for name, parent, nature, order in GROUPS:
        groups[name] = AccountGroup.objects.create(
            name=name, parent=groups.get(parent), nature=nature, is_system=True, order=order
        )
    for name, group, code in LEDGERS:
        Ledger.objects.create(name=name, group=groups[group], system_code=code)
    rates = {rate: TaxRate.objects.create(name=name, rate=Decimal(rate)) for name, rate in RATES}
    CompanyProfile.objects.update_or_create(
        pk=1,
        defaults={
            "default_tax_rate": rates["18"],
            "invoice_terms": "1. Payment due by the date above.\n2. Advance paid is non-refundable within 7 days of the event.\n3. Subject to Coimbatore jurisdiction.",
            "quotation_terms": "1. 50% advance to confirm the booking, balance before the event.\n2. Prices valid until the date above.\n3. GST extra as applicable.",
        },
    )


def backwards(apps, schema_editor):
    for model in ("Ledger", "AccountGroup", "TaxRate", "CompanyProfile"):
        apps.get_model("accounting", model).objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [("accounting", "0001_initial")]
    operations = [migrations.RunPython(forwards, backwards)]
