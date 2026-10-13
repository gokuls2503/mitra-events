from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import Role, User
from apps.accounts.serializers import UserMiniSerializer
from apps.core.fields import IndianPhoneField
from apps.website.models import Package

from .models import Booking, Client, FollowUp, Lead, LeadActivity


# Users who can own leads / coordinate events.
assignable_users = User.objects.filter(is_active=True, role__in=[Role.OWNER, Role.MANAGER, Role.STAFF])


class ClientSerializer(serializers.ModelSerializer):
    lead_count = serializers.IntegerField(read_only=True)
    booking_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Client
        fields = [
            "id",
            "name",
            "phone",
            "alt_phone",
            "email",
            "address",
            "city",
            "gstin",
            "notes",
            "lead_count",
            "booking_count",
            "created_at",
        ]
        read_only_fields = ["created_at"]

    def build_standard_field(self, field_name, model_field):
        cls, kwargs = super().build_standard_field(field_name, model_field)
        if field_name in ("phone", "alt_phone"):
            cls = IndianPhoneField
            kwargs.pop("max_length", None)
        return cls, kwargs

    def validate_gstin(self, value):
        value = value.strip().upper()
        if value and len(value) != 15:
            raise serializers.ValidationError("GSTIN must be 15 characters.")
        return value


class LeadSerializer(serializers.ModelSerializer):
    phone = IndianPhoneField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    source_label = serializers.CharField(source="get_source_display", read_only=True)
    event_type_label = serializers.CharField(source="get_event_type_display", read_only=True)
    assigned_to_detail = UserMiniSerializer(source="assigned_to", read_only=True)
    client_name = serializers.CharField(source="client.name", read_only=True, default=None)
    package_name = serializers.CharField(source="package.name", read_only=True, default=None)
    service_name = serializers.CharField(source="service.name", read_only=True, default=None)
    booking = serializers.SerializerMethodField()
    next_follow_up = serializers.SerializerMethodField()

    class Meta:
        model = Lead
        fields = [
            "id",
            "name",
            "phone",
            "email",
            "client",
            "client_name",
            "event_type",
            "event_type_label",
            "event_date",
            "venue",
            "guest_count",
            "budget",
            "message",
            "service",
            "service_name",
            "package",
            "package_name",
            "estimate",
            "source",
            "source_label",
            "source_page",
            "status",
            "status_label",
            "status_changed_at",
            "lost_reason",
            "assigned_to",
            "assigned_to_detail",
            "booking",
            "next_follow_up",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "client",
            "estimate",
            "source_page",
            "status",
            "status_changed_at",
            "lost_reason",
            "assigned_to",
            "created_at",
            "updated_at",
        ]

    def get_booking(self, lead):
        booking = getattr(lead, "booking", None)
        return {"id": booking.id, "number": booking.number} if booking else None

    def get_next_follow_up(self, lead):
        # Uses the prefetched `open_follow_ups` when the view provides it.
        pending = getattr(lead, "open_follow_ups", None)
        if pending is None:
            pending = list(lead.follow_ups.filter(completed_at__isnull=True).order_by("due_at")[:1])
        return pending[0].due_at if pending else None


class LeadCreateSerializer(LeadSerializer):
    """Staff entering a phone/walk-in enquiry may also pick the owner."""

    assigned_to = serializers.PrimaryKeyRelatedField(queryset=assignable_users, required=False, allow_null=True)

    class Meta(LeadSerializer.Meta):
        read_only_fields = [f for f in LeadSerializer.Meta.read_only_fields if f != "assigned_to"]


class StatusChangeSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Lead.Status.choices)
    lost_reason = serializers.CharField(required=False, allow_blank=True, max_length=200)
    note = serializers.CharField(required=False, allow_blank=True, max_length=1000)


class AssignSerializer(serializers.Serializer):
    assigned_to = serializers.PrimaryKeyRelatedField(queryset=assignable_users, allow_null=True)


class LeadActivitySerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default=None)

    class Meta:
        model = LeadActivity
        fields = ["id", "kind", "kind_label", "text", "created_by_name", "created_at"]
        read_only_fields = ["created_at"]

    def validate_kind(self, value):
        if value not in LeadActivity.MANUAL_KINDS:
            raise serializers.ValidationError("Only notes, calls, WhatsApp and meetings can be logged by hand.")
        return value

    def validate_text(self, value):
        if not value.strip():
            raise serializers.ValidationError("Write something.")
        return value.strip()


class FollowUpSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    lead_name = serializers.CharField(source="lead.name", read_only=True)
    lead_phone = serializers.CharField(source="lead.phone", read_only=True)
    lead_status = serializers.CharField(source="lead.status", read_only=True)
    assigned_to = serializers.PrimaryKeyRelatedField(queryset=assignable_users, required=False, allow_null=True)
    assigned_to_name = serializers.CharField(source="assigned_to.full_name", read_only=True, default=None)
    completed_by_name = serializers.CharField(source="completed_by.full_name", read_only=True, default=None)
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = FollowUp
        fields = [
            "id",
            "lead",
            "lead_name",
            "lead_phone",
            "lead_status",
            "due_at",
            "kind",
            "kind_label",
            "notes",
            "assigned_to",
            "assigned_to_name",
            "completed_at",
            "completed_by_name",
            "outcome",
            "is_overdue",
            "created_at",
        ]
        read_only_fields = ["completed_at", "outcome", "created_at"]

    def get_is_overdue(self, obj):
        return obj.completed_at is None and obj.due_at < timezone.now()

    def validate_lead(self, lead):
        if self.instance and self.instance.lead_id != lead.id:
            raise serializers.ValidationError("A follow-up can't be moved to another lead.")
        if not lead.is_open:
            raise serializers.ValidationError("This lead is closed; reopen it to schedule follow-ups.")
        return lead


class CompleteFollowUpSerializer(serializers.Serializer):
    outcome = serializers.CharField(required=False, allow_blank=True, max_length=300)


class BookingSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    event_type_label = serializers.CharField(source="get_event_type_display", read_only=True)
    client_name = serializers.CharField(source="client.name", read_only=True)
    client_phone = serializers.CharField(source="client.phone", read_only=True)
    coordinator = serializers.PrimaryKeyRelatedField(queryset=assignable_users, required=False, allow_null=True)
    coordinator_name = serializers.CharField(source="coordinator.full_name", read_only=True, default=None)
    package = serializers.PrimaryKeyRelatedField(queryset=Package.objects.all(), required=False, allow_null=True)
    package_name = serializers.CharField(source="package.name", read_only=True, default=None)
    lead_id = serializers.IntegerField(source="lead.id", read_only=True, default=None)

    class Meta:
        model = Booking
        fields = [
            "id",
            "number",
            "client",
            "client_name",
            "client_phone",
            "lead_id",
            "title",
            "event_type",
            "event_type_label",
            "package",
            "package_name",
            "event_date",
            "end_date",
            "start_time",
            "setup_time",
            "venue",
            "venue_address",
            "guest_count",
            "agreed_amount",
            "status",
            "status_label",
            "coordinator",
            "coordinator_name",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["number", "created_at", "updated_at"]

    def validate(self, attrs):
        start = attrs.get("event_date", getattr(self.instance, "event_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": "End date can't be before the event date."})
        if self.instance and "client" in attrs and attrs["client"] != self.instance.client:
            raise serializers.ValidationError({"client": "A booking can't be moved to another client."})
        return attrs


class ConvertLeadSerializer(serializers.Serializer):
    """Booking details + optional client details captured while converting."""

    title = serializers.CharField(max_length=160)
    event_type = serializers.ChoiceField(choices=Booking._meta.get_field("event_type").choices)
    package = serializers.PrimaryKeyRelatedField(queryset=Package.objects.all(), required=False, allow_null=True)
    event_date = serializers.DateField()
    end_date = serializers.DateField(required=False, allow_null=True)
    start_time = serializers.TimeField(required=False, allow_null=True)
    setup_time = serializers.TimeField(required=False, allow_null=True)
    venue = serializers.CharField(max_length=200)
    venue_address = serializers.CharField(required=False, allow_blank=True)
    guest_count = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    agreed_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True, min_value=0)
    coordinator = serializers.PrimaryKeyRelatedField(queryset=assignable_users, required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)

    client_name = serializers.CharField(required=False, allow_blank=True, max_length=120)
    client_email = serializers.EmailField(required=False, allow_blank=True)
    client_address = serializers.CharField(required=False, allow_blank=True)
    client_gstin = serializers.CharField(required=False, allow_blank=True, max_length=15)

    def validate(self, attrs):
        if attrs.get("end_date") and attrs["end_date"] < attrs["event_date"]:
            raise serializers.ValidationError({"end_date": "End date can't be before the event date."})
        return attrs

    def split(self):
        data = dict(self.validated_data)
        client = {
            "name": data.pop("client_name", ""),
            "email": data.pop("client_email", ""),
            "address": data.pop("client_address", ""),
            "gstin": data.pop("client_gstin", "").upper(),
        }
        return client, data
