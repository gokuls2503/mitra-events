from decimal import Decimal

from rest_framework import serializers

from apps.crm.models import Booking, Client
from apps.operations.models import Vendor

from .models import (
    AccountGroup,
    CompanyProfile,
    Expense,
    Invoice,
    InvoiceItem,
    JournalEntry,
    JournalLine,
    Ledger,
    Quotation,
    QuotationItem,
    Receipt,
    ReceiptAllocation,
    TaxRate,
)
from .states import STATE_NAMES


class RelativeFileField(serializers.FileField):
    def to_representation(self, value):
        return value.url if value else None


# --- Settings -----------------------------------------------------------------


class CompanyProfileSerializer(serializers.ModelSerializer):
    state_name = serializers.SerializerMethodField()

    class Meta:
        model = CompanyProfile
        exclude = ["id", "created_at"]
        read_only_fields = ["updated_at"]

    def get_state_name(self, obj):
        return STATE_NAMES.get(obj.state_code, "")

    def validate_gstin(self, value):
        value = value.strip().upper()
        if value and len(value) != 15:
            raise serializers.ValidationError("GSTIN must be 15 characters.")
        return value

    def validate(self, attrs):
        gstin = attrs.get("gstin", getattr(self.instance, "gstin", ""))
        state = attrs.get("state_code", getattr(self.instance, "state_code", ""))
        if gstin and state and gstin[:2] != state:
            raise serializers.ValidationError({"gstin": f"A GSTIN in state {state} starts with {state}."})
        for f in ("invoice_prefix", "quotation_prefix", "receipt_prefix", "expense_prefix", "voucher_prefix"):
            if f in attrs:
                attrs[f] = attrs[f].strip().upper()
                if not attrs[f] or "/" in attrs[f]:
                    raise serializers.ValidationError({f: "Use letters/numbers only, e.g. INV."})
        return attrs


class TaxRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxRate
        fields = ["id", "name", "rate", "is_active"]


class AccountGroupSerializer(serializers.ModelSerializer):
    nature_label = serializers.CharField(source="get_nature_display", read_only=True)
    parent_name = serializers.CharField(source="parent.name", read_only=True, default=None)

    class Meta:
        model = AccountGroup
        fields = ["id", "name", "parent", "parent_name", "nature", "nature_label", "is_system", "order"]
        read_only_fields = ["is_system", "nature"]

    def validate(self, attrs):
        if not attrs.get("parent"):
            raise serializers.ValidationError({"parent": "New groups go under an existing group."})
        return attrs

    def create(self, validated_data):
        validated_data["nature"] = validated_data["parent"].nature
        return super().create(validated_data)


# --- Ledgers -----------------------------------------------------------------------


class LedgerSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source="group.name", read_only=True)
    nature = serializers.CharField(source="group.nature", read_only=True)
    balance = serializers.SerializerMethodField()
    is_system = serializers.SerializerMethodField()

    class Meta:
        model = Ledger
        fields = [
            "id",
            "name",
            "group",
            "group_name",
            "nature",
            "system_code",
            "client",
            "vendor",
            "opening_balance",
            "gstin",
            "bank_details",
            "is_active",
            "balance",
            "is_system",
        ]
        read_only_fields = ["system_code", "client", "vendor"]

    def get_balance(self, obj):
        balances = self.context.get("balances")
        if balances is None:
            return None
        amount = balances.get(obj.id, obj.opening_balance)
        return {"amount": abs(amount), "side": "Dr" if amount >= 0 else "Cr"}

    def get_is_system(self, obj):
        return bool(obj.system_code)

    def validate(self, attrs):
        if self.instance and self.instance.system_code and "group" in attrs and attrs["group"] != self.instance.group:
            raise serializers.ValidationError({"group": "System ledgers can't move to another group."})
        return attrs


# --- Line items & sales documents ------------------------------------------------------


class ItemSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=300)
    sac = serializers.CharField(max_length=8, required=False, allow_blank=True, default="")
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))
    unit = serializers.CharField(max_length=20, required=False, allow_blank=True, default="Nos")
    rate = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))
    discount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0"), required=False, default=Decimal("0"))
    tax_rate = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal("0"), max_value=Decimal("28"))
    # Read-only computed values
    taxable_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    cgst = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    sgst = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    igst = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)


TOTAL_FIELDS = ["subtotal", "discount_total", "taxable_total", "cgst_total", "sgst_total", "igst_total", "round_off", "total"]


class SalesDocumentSerializer(serializers.ModelSerializer):
    items = ItemSerializer(many=True)
    client = serializers.PrimaryKeyRelatedField(queryset=Client.objects.all())
    booking = serializers.PrimaryKeyRelatedField(queryset=Booking.objects.all(), required=False, allow_null=True)
    client_name = serializers.CharField(source="client.name", read_only=True)
    client_gstin = serializers.CharField(source="client.gstin", read_only=True)
    booking_title = serializers.CharField(source="booking.title", read_only=True, default=None)
    booking_number = serializers.CharField(source="booking.number", read_only=True, default=None)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    place_of_supply_name = serializers.SerializerMethodField()

    def get_place_of_supply_name(self, obj):
        return STATE_NAMES.get(obj.place_of_supply, "")

    def validate(self, attrs):
        booking, client = attrs.get("booking"), attrs.get("client", getattr(self.instance, "client", None))
        if booking and client and booking.client_id != client.id:
            raise serializers.ValidationError({"booking": "That event belongs to a different client."})
        return attrs


class QuotationSerializer(SalesDocumentSerializer):
    class Meta:
        model = Quotation
        fields = [
            "id", "number", "client", "client_name", "client_gstin", "booking", "booking_title", "booking_number",
            "lead", "date", "valid_until", "status", "status_label", "place_of_supply", "place_of_supply_name",
            "notes", "terms", "items", *TOTAL_FIELDS, "created_at",
        ]
        read_only_fields = ["number", "status", *TOTAL_FIELDS, "created_at"]
        extra_kwargs = {"date": {"required": False}, "terms": {"required": False}}


class AllocationReadSerializer(serializers.ModelSerializer):
    receipt_number = serializers.CharField(source="receipt.number", read_only=True)
    receipt_date = serializers.DateField(source="receipt.date", read_only=True)
    receipt_cancelled = serializers.BooleanField(source="receipt.is_cancelled", read_only=True)
    invoice_number = serializers.CharField(source="invoice.number", read_only=True)

    class Meta:
        model = ReceiptAllocation
        fields = ["id", "receipt", "receipt_number", "receipt_date", "receipt_cancelled", "invoice", "invoice_number", "amount"]


class InvoiceSerializer(SalesDocumentSerializer):
    balance_due = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    allocations = AllocationReadSerializer(many=True, read_only=True)
    quotation_number = serializers.CharField(source="quotation.number", read_only=True, default=None)

    class Meta:
        model = Invoice
        fields = [
            "id", "number", "client", "client_name", "client_gstin", "booking", "booking_title", "booking_number",
            "quotation", "quotation_number", "invoice_date", "due_date", "status", "status_label",
            "place_of_supply", "place_of_supply_name", "notes", "terms", "items", *TOTAL_FIELDS,
            "amount_paid", "balance_due", "billing_name", "billing_address", "billing_gstin", "billing_phone",
            "issued_at", "cancel_reason", "allocations", "created_at",
        ]
        read_only_fields = [
            "number", "status", "quotation", *TOTAL_FIELDS, "amount_paid", "billing_name", "billing_address",
            "billing_gstin", "billing_phone", "issued_at", "cancel_reason", "created_at",
        ]
        extra_kwargs = {"invoice_date": {"required": False}, "terms": {"required": False}}


# --- Receipts ---------------------------------------------------------------------------


class AllocationInputSerializer(serializers.Serializer):
    invoice = serializers.PrimaryKeyRelatedField(queryset=Invoice.objects.all())
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))


class ReceiptSerializer(serializers.ModelSerializer):
    client = serializers.PrimaryKeyRelatedField(queryset=Client.objects.all())
    booking = serializers.PrimaryKeyRelatedField(queryset=Booking.objects.all(), required=False, allow_null=True)
    deposit_to = serializers.PrimaryKeyRelatedField(queryset=Ledger.objects.filter(is_active=True))
    allocations = AllocationReadSerializer(many=True, read_only=True)
    apply_to = AllocationInputSerializer(many=True, write_only=True, required=False)
    client_name = serializers.CharField(source="client.name", read_only=True)
    deposit_to_name = serializers.CharField(source="deposit_to.name", read_only=True)
    mode_label = serializers.CharField(source="get_mode_display", read_only=True)
    booking_title = serializers.CharField(source="booking.title", read_only=True, default=None)
    allocated = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    unapplied = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Receipt
        fields = [
            "id", "number", "client", "client_name", "booking", "booking_title", "date", "amount", "mode", "mode_label",
            "deposit_to", "deposit_to_name", "reference", "notes", "is_cancelled", "allocations", "apply_to",
            "allocated", "unapplied", "created_at",
        ]
        read_only_fields = ["number", "is_cancelled", "created_at"]
        extra_kwargs = {"date": {"required": False}}



# --- Expenses ------------------------------------------------------------------------------


class ExpenseSerializer(serializers.ModelSerializer):
    expense_ledger = serializers.PrimaryKeyRelatedField(queryset=Ledger.objects.filter(is_active=True))
    paid_from = serializers.PrimaryKeyRelatedField(queryset=Ledger.objects.filter(is_active=True), required=False, allow_null=True)
    vendor = serializers.PrimaryKeyRelatedField(queryset=Vendor.objects.all(), required=False, allow_null=True)
    booking = serializers.PrimaryKeyRelatedField(queryset=Booking.objects.all(), required=False, allow_null=True)
    attachment = RelativeFileField(required=False, allow_null=True)
    expense_ledger_name = serializers.CharField(source="expense_ledger.name", read_only=True)
    paid_from_name = serializers.CharField(source="paid_from.name", read_only=True, default=None)
    vendor_name = serializers.CharField(source="vendor.name", read_only=True, default=None)
    booking_title = serializers.CharField(source="booking.title", read_only=True, default=None)

    class Meta:
        model = Expense
        fields = [
            "id", "number", "date", "expense_ledger", "expense_ledger_name", "vendor", "vendor_name", "booking",
            "booking_title", "description", "bill_number", "amount", "tax_rate", "is_interstate", "cgst", "sgst",
            "igst", "total", "paid_from", "paid_from_name", "attachment", "is_cancelled", "created_at",
        ]
        read_only_fields = ["number", "cgst", "sgst", "igst", "total", "is_cancelled", "created_at"]

    def validate_attachment(self, f):
        if f and f.size > 10 * 1024 * 1024:
            raise serializers.ValidationError("Attachment must be under 10 MB.")
        if f and not f.name.lower().endswith((".pdf", ".jpg", ".jpeg", ".png", ".webp")):
            raise serializers.ValidationError("Attach a PDF or an image.")
        return f


# --- Vouchers ---------------------------------------------------------------------------------


class JournalLineSerializer(serializers.ModelSerializer):
    ledger = serializers.PrimaryKeyRelatedField(queryset=Ledger.objects.filter(is_active=True))
    ledger_name = serializers.CharField(source="ledger.name", read_only=True)

    class Meta:
        model = JournalLine
        fields = ["id", "ledger", "ledger_name", "debit", "credit", "note"]


class JournalEntrySerializer(serializers.ModelSerializer):
    lines = JournalLineSerializer(many=True)
    voucher_type_label = serializers.CharField(source="get_voucher_type_display", read_only=True)
    source = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()

    class Meta:
        model = JournalEntry
        fields = [
            "id", "number", "date", "voucher_type", "voucher_type_label", "narration", "is_manual", "is_cancelled",
            "lines", "source", "total", "created_at",
        ]
        read_only_fields = ["number", "is_manual", "is_cancelled", "created_at"]

    def get_total(self, obj):
        return sum((l.debit for l in obj.lines.all()), Decimal("0"))

    def get_source(self, obj):
        """Which document posted this entry, so the day book can link to it."""
        for kind in ("invoice", "receipt", "expense"):
            doc = getattr(obj, kind, None)  # missing reverse one-to-one raises an AttributeError subclass
            if doc is not None:
                return {"kind": kind, "id": doc.id}
        return None
