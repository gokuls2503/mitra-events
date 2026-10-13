"""Tally-style double-entry accounting.

Every financial document (invoice, receipt, expense, manual voucher) posts one balanced
JournalEntry. Reports are computed only from journal lines plus ledger opening balances,
so the books always reconcile. Cancelling a document cancels its entry — nothing is
deleted, and issued invoice numbers are never reused (a GST requirement).
"""

from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import AuditedModel, TimeStampedModel

from .states import GST_STATES

ZERO = Decimal("0.00")


def money(**kwargs):
    return models.DecimalField(max_digits=14, decimal_places=2, default=ZERO, **kwargs)


# --- Settings ----------------------------------------------------------------


class CompanyProfile(TimeStampedModel):
    """Single row (pk=1): everything printed on invoices. Editable by Owner / Accountant."""

    legal_name = models.CharField(max_length=160, default="Mitra Events Management")
    trade_name = models.CharField(max_length=160, blank=True)
    gstin = models.CharField("GSTIN", max_length=15, blank=True)
    pan = models.CharField("PAN", max_length=10, blank=True)
    state_code = models.CharField(max_length=2, choices=GST_STATES, default="33")
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)

    bank_name = models.CharField(max_length=120, blank=True)
    bank_account_name = models.CharField(max_length=160, blank=True)
    bank_account_number = models.CharField(max_length=30, blank=True)
    bank_ifsc = models.CharField("IFSC", max_length=11, blank=True)
    bank_branch = models.CharField(max_length=120, blank=True)
    upi_id = models.CharField("UPI ID", max_length=80, blank=True)

    invoice_prefix = models.CharField(max_length=8, default="INV")
    quotation_prefix = models.CharField(max_length=8, default="QT")
    receipt_prefix = models.CharField(max_length=8, default="RCPT")
    expense_prefix = models.CharField(max_length=8, default="EXP")
    voucher_prefix = models.CharField(max_length=8, default="JV")

    default_sac = models.CharField("Default SAC code", max_length=8, default="998596")
    default_tax_rate = models.ForeignKey("TaxRate", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    invoice_due_days = models.PositiveSmallIntegerField(default=7)
    quotation_valid_days = models.PositiveSmallIntegerField(default=15)
    invoice_terms = models.TextField(blank=True)
    quotation_terms = models.TextField(blank=True)
    authorised_signatory = models.CharField(max_length=120, blank=True)

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return self.legal_name


class TaxRate(models.Model):
    name = models.CharField(max_length=40, help_text='e.g. "GST 18%"')
    rate = models.DecimalField(max_digits=5, decimal_places=2, validators=[MinValueValidator(0)])
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["rate"]

    def __str__(self):
        return self.name


# --- Chart of accounts ----------------------------------------------------------


class AccountGroup(models.Model):
    class Nature(models.TextChoices):
        ASSET = "ASSET", "Assets"
        LIABILITY = "LIABILITY", "Liabilities"
        INCOME = "INCOME", "Income"
        EXPENSE = "EXPENSE", "Expenses"

    name = models.CharField(max_length=80, unique=True)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="children")
    nature = models.CharField(max_length=10, choices=Nature.choices)
    is_system = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "name"]

    def __str__(self):
        return self.name


class Ledger(AuditedModel):
    """An account. Opening balance is signed: positive = debit (Dr), negative = credit (Cr)."""

    class SystemCode(models.TextChoices):
        CASH = "CASH", "Cash"
        SALES = "SALES", "Sales"
        OUTPUT_CGST = "OUTPUT_CGST", "Output CGST"
        OUTPUT_SGST = "OUTPUT_SGST", "Output SGST"
        OUTPUT_IGST = "OUTPUT_IGST", "Output IGST"
        INPUT_CGST = "INPUT_CGST", "Input CGST"
        INPUT_SGST = "INPUT_SGST", "Input SGST"
        INPUT_IGST = "INPUT_IGST", "Input IGST"
        ROUND_OFF = "ROUND_OFF", "Round off"
        CAPITAL = "CAPITAL", "Capital"

    name = models.CharField(max_length=120, unique=True)
    group = models.ForeignKey(AccountGroup, on_delete=models.PROTECT, related_name="ledgers")
    system_code = models.CharField(max_length=20, choices=SystemCode.choices, unique=True, null=True, blank=True)
    client = models.OneToOneField("crm.Client", null=True, blank=True, on_delete=models.PROTECT, related_name="ledger")
    vendor = models.OneToOneField("operations.Vendor", null=True, blank=True, on_delete=models.PROTECT, related_name="ledger")
    opening_balance = money(help_text="Positive = Dr, negative = Cr")
    gstin = models.CharField("GSTIN", max_length=15, blank=True)
    bank_details = models.CharField(max_length=200, blank=True, help_text="For bank ledgers: account no. / IFSC")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


# --- Journal ---------------------------------------------------------------------


class JournalEntry(AuditedModel):
    class VoucherType(models.TextChoices):
        SALES = "SALES", "Sales"
        RECEIPT = "RECEIPT", "Receipt"
        PAYMENT = "PAYMENT", "Payment"
        PURCHASE = "PURCHASE", "Purchase / expense"
        CONTRA = "CONTRA", "Contra"
        JOURNAL = "JOURNAL", "Journal"

    number = models.CharField(max_length=30, db_index=True)
    date = models.DateField(db_index=True)
    voucher_type = models.CharField(max_length=10, choices=VoucherType.choices)
    narration = models.TextField(blank=True)
    is_manual = models.BooleanField(default=False, help_text="Entered by hand rather than posted by a document")
    is_cancelled = models.BooleanField(default=False, db_index=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-date", "-id"]
        verbose_name_plural = "journal entries"

    def __str__(self):
        return f"{self.number} ({self.get_voucher_type_display()})"


class JournalLine(models.Model):
    entry = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name="lines")
    ledger = models.ForeignKey(Ledger, on_delete=models.PROTECT, related_name="lines")
    debit = money(validators=[MinValueValidator(0)])
    credit = money(validators=[MinValueValidator(0)])
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=(models.Q(debit=0) | models.Q(credit=0)) & (models.Q(debit__gt=0) | models.Q(credit__gt=0)),
                name="journal_line_one_side",
            )
        ]


# --- Sales documents ----------------------------------------------------------------


class SalesDocument(AuditedModel):
    """Shared fields for quotations and invoices. Totals are always recomputed from items."""

    client = models.ForeignKey("crm.Client", on_delete=models.PROTECT, related_name="+")
    booking = models.ForeignKey("crm.Booking", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    place_of_supply = models.CharField(max_length=2, choices=GST_STATES, default="33")
    notes = models.TextField(blank=True)
    terms = models.TextField(blank=True)

    subtotal = money()
    discount_total = money()
    taxable_total = money()
    cgst_total = money()
    sgst_total = money()
    igst_total = money()
    round_off = money()
    total = money()

    class Meta:
        abstract = True


class LineItem(models.Model):
    description = models.CharField(max_length=300)
    sac = models.CharField("SAC", max_length=8, blank=True)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("1"), validators=[MinValueValidator(Decimal("0.01"))])
    unit = models.CharField(max_length=20, blank=True, default="Nos")
    rate = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    discount = money(validators=[MinValueValidator(0)])
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("18"))
    taxable_amount = money()
    cgst = money()
    sgst = money()
    igst = money()
    amount = money()
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        abstract = True
        ordering = ["order", "id"]


class Quotation(SalesDocument):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SENT = "SENT", "Sent"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"
        INVOICED = "INVOICED", "Invoiced"

    number = models.CharField(max_length=30, unique=True)
    lead = models.ForeignKey("crm.Lead", null=True, blank=True, on_delete=models.SET_NULL, related_name="quotations")
    date = models.DateField()
    valid_until = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT, db_index=True)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self):
        return self.number


class QuotationItem(LineItem):
    quotation = models.ForeignKey(Quotation, on_delete=models.CASCADE, related_name="items")


class Invoice(SalesDocument):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ISSUED = "ISSUED", "Issued"
        PARTIALLY_PAID = "PARTIALLY_PAID", "Partly paid"
        PAID = "PAID", "Paid"
        CANCELLED = "CANCELLED", "Cancelled"

    OPEN_STATUSES = [Status.ISSUED, Status.PARTIALLY_PAID]

    number = models.CharField(max_length=30, unique=True, null=True, blank=True, help_text="Assigned when issued")
    quotation = models.ForeignKey(Quotation, null=True, blank=True, on_delete=models.SET_NULL, related_name="invoices")
    invoice_date = models.DateField()
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.DRAFT, db_index=True)
    amount_paid = money()

    # Snapshot of who was billed, frozen at issue (client details may change later).
    billing_name = models.CharField(max_length=160, blank=True)
    billing_address = models.TextField(blank=True)
    billing_gstin = models.CharField(max_length=15, blank=True)
    billing_phone = models.CharField(max_length=16, blank=True)

    journal = models.OneToOneField(JournalEntry, null=True, blank=True, on_delete=models.PROTECT, related_name="invoice")
    issued_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-invoice_date", "-id"]

    def __str__(self):
        return self.number or f"Draft invoice #{self.pk}"

    @property
    def balance_due(self):
        return self.total - self.amount_paid


class InvoiceItem(LineItem):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="items")


# --- Receipts ---------------------------------------------------------------------


class Receipt(AuditedModel):
    class Mode(models.TextChoices):
        CASH = "CASH", "Cash"
        UPI = "UPI", "UPI"
        BANK_TRANSFER = "BANK_TRANSFER", "Bank transfer (NEFT/IMPS/RTGS)"
        CHEQUE = "CHEQUE", "Cheque"
        CARD = "CARD", "Card"

    number = models.CharField(max_length=30, unique=True)
    client = models.ForeignKey("crm.Client", on_delete=models.PROTECT, related_name="receipts")
    booking = models.ForeignKey("crm.Booking", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    date = models.DateField()
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    mode = models.CharField(max_length=15, choices=Mode.choices)
    deposit_to = models.ForeignKey(Ledger, on_delete=models.PROTECT, related_name="+", help_text="Cash or a bank ledger")
    reference = models.CharField(max_length=80, blank=True, help_text="UPI ref / cheque no. / UTR")
    notes = models.CharField(max_length=300, blank=True)
    journal = models.OneToOneField(JournalEntry, null=True, blank=True, on_delete=models.PROTECT, related_name="receipt")
    is_cancelled = models.BooleanField(default=False)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self):
        return self.number

    @property
    def allocated(self):
        return sum((a.amount for a in self.allocations.all()), ZERO)

    @property
    def unapplied(self):
        """Advance: received but not yet applied to any invoice."""
        return self.amount - self.allocated


class ReceiptAllocation(models.Model):
    receipt = models.ForeignKey(Receipt, on_delete=models.CASCADE, related_name="allocations")
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="allocations")
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])

    class Meta:
        constraints = [models.UniqueConstraint(fields=["receipt", "invoice"], name="uniq_allocation")]


# --- Expenses -----------------------------------------------------------------------


class Expense(AuditedModel):
    """A purchase / expense voucher, optionally a GST vendor bill and optionally tied to an event."""

    number = models.CharField(max_length=30, unique=True)
    date = models.DateField()
    expense_ledger = models.ForeignKey(Ledger, on_delete=models.PROTECT, related_name="+", help_text="What it was for")
    vendor = models.ForeignKey("operations.Vendor", null=True, blank=True, on_delete=models.PROTECT, related_name="expenses")
    booking = models.ForeignKey("crm.Booking", null=True, blank=True, on_delete=models.SET_NULL, related_name="expenses")
    description = models.CharField(max_length=300)
    bill_number = models.CharField(max_length=40, blank=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))], help_text="Before GST")
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=ZERO)
    is_interstate = models.BooleanField(default=False)
    cgst = money()
    sgst = money()
    igst = money()
    total = money()
    paid_from = models.ForeignKey(
        Ledger, null=True, blank=True, on_delete=models.PROTECT, related_name="+",
        help_text="Cash/bank it was paid from. Empty = on credit (owed to the vendor).",
    )
    attachment = models.FileField(upload_to="bills/%Y/%m/", blank=True)
    journal = models.OneToOneField(JournalEntry, null=True, blank=True, on_delete=models.PROTECT, related_name="expense")
    is_cancelled = models.BooleanField(default=False)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self):
        return f"{self.number} {self.description}"
