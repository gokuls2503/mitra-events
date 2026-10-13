from rest_framework import serializers

from apps.accounts.models import Role, User
from apps.core.fields import IndianPhoneField
from apps.crm.models import Booking

from . import services
from .models import EventAssignment, Task, Vendor

team_members = User.objects.filter(is_active=True, role__in=[Role.OWNER, Role.MANAGER, Role.STAFF])


class VendorSerializer(serializers.ModelSerializer):
    phone = IndianPhoneField()
    alt_phone = IndianPhoneField(required=False, allow_blank=True)
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    upcoming_jobs = serializers.IntegerField(read_only=True)

    class Meta:
        model = Vendor
        fields = [
            "id",
            "name",
            "category",
            "category_label",
            "contact_person",
            "phone",
            "alt_phone",
            "email",
            "address",
            "gstin",
            "notes",
            "is_active",
            "upcoming_jobs",
        ]

    def validate_gstin(self, value):
        value = value.strip().upper()
        if value and len(value) != 15:
            raise serializers.ValidationError("GSTIN must be 15 characters.")
        return value


class BookingMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Booking
        fields = ["id", "number", "title", "event_date", "venue"]


class AssignmentSerializer(serializers.ModelSerializer):
    staff = serializers.PrimaryKeyRelatedField(queryset=team_members, required=False, allow_null=True)
    vendor = serializers.PrimaryKeyRelatedField(queryset=Vendor.objects.all(), required=False, allow_null=True)
    staff_name = serializers.CharField(source="staff.full_name", read_only=True, default=None)
    vendor_name = serializers.CharField(source="vendor.name", read_only=True, default=None)
    vendor_category = serializers.CharField(source="vendor.get_category_display", read_only=True, default=None)
    phone = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    booking_detail = BookingMiniSerializer(source="booking", read_only=True)
    conflicts = serializers.SerializerMethodField()

    class Meta:
        model = EventAssignment
        fields = [
            "id",
            "booking",
            "booking_detail",
            "staff",
            "staff_name",
            "vendor",
            "vendor_name",
            "vendor_category",
            "phone",
            "role",
            "report_time",
            "agreed_cost",
            "status",
            "status_label",
            "notes",
            "conflicts",
        ]

    def get_phone(self, obj):
        return obj.staff.phone if obj.staff_id else obj.vendor.phone

    def get_conflicts(self, obj):
        return BookingMiniSerializer(services.conflicts_for(obj), many=True).data

    def validate(self, attrs):
        staff = attrs.get("staff", getattr(self.instance, "staff", None))
        vendor = attrs.get("vendor", getattr(self.instance, "vendor", None))
        if bool(staff) == bool(vendor):
            raise serializers.ValidationError("Choose either a team member or a vendor.")
        if vendor and not vendor.is_active and (not self.instance or self.instance.vendor_id != vendor.id):
            raise serializers.ValidationError({"vendor": "This vendor is inactive."})
        if staff and attrs.get("agreed_cost"):
            raise serializers.ValidationError({"agreed_cost": "Costs are only recorded for vendors."})
        booking = attrs.get("booking", getattr(self.instance, "booking", None))
        if self.instance and "booking" in attrs and attrs["booking"] != self.instance.booking:
            raise serializers.ValidationError({"booking": "An assignment can't move to another event."})
        if staff and EventAssignment.objects.filter(booking=booking, staff=staff).exclude(pk=getattr(self.instance, "pk", None)).exists():
            raise serializers.ValidationError({"staff": f"{staff.full_name} is already on this event."})
        return attrs


class TaskSerializer(serializers.ModelSerializer):
    assigned_to = serializers.PrimaryKeyRelatedField(queryset=team_members, required=False, allow_null=True)
    assigned_to_name = serializers.CharField(source="assigned_to.full_name", read_only=True, default=None)
    completed_by_name = serializers.CharField(source="completed_by.full_name", read_only=True, default=None)
    booking_detail = BookingMiniSerializer(source="booking", read_only=True)
    priority_label = serializers.CharField(source="get_priority_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Task
        fields = [
            "id",
            "title",
            "description",
            "booking",
            "booking_detail",
            "assigned_to",
            "assigned_to_name",
            "due_date",
            "priority",
            "priority_label",
            "status",
            "status_label",
            "completed_at",
            "completed_by_name",
            "created_at",
        ]
        read_only_fields = ["completed_at", "created_at"]
