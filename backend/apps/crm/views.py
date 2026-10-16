"""CRM API.

Access (mirrors the approved role matrix):
  Owner / Manager  everything
  Staff            only leads assigned to them (and their follow-ups, clients and the events
                   they coordinate or are assigned to); can log activity, change status and schedule follow-ups,
                   but cannot reassign, delete, or convert leads to bookings
  Accountant       read-only, except client billing details (GSTIN, address) which they can edit
"""

import datetime

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, Prefetch, Q, Sum
from django.utils import timezone
from django_filters import rest_framework as filters
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.accounts.models import Role
from apps.core.permissions import RoleAccess

from . import serializers as s
from . import services
from .models import Booking, Client, FollowUp, Lead, LeadActivity

ALL_ROLES = (Role.OWNER, Role.MANAGER, Role.STAFF, Role.ACCOUNTANT)
SALES_ROLES = (Role.OWNER, Role.MANAGER, Role.STAFF)
MANAGERS = (Role.OWNER, Role.MANAGER)


def is_manager(user) -> bool:
    return user.role in MANAGERS


def is_staff_member(user) -> bool:
    return user.role == Role.STAFF


def staff_bookings(user):
    """Bookings a staff member works on: ones they coordinate or are assigned to."""
    return Booking.objects.filter(Q(coordinator=user) | Q(assignments__staff=user)).distinct()


def as_drf_error(exc: DjangoValidationError) -> ValidationError:
    return ValidationError(exc.message_dict if hasattr(exc, "error_dict") else exc.messages)


# --- Leads -------------------------------------------------------------------


class LeadFilter(filters.FilterSet):
    open = filters.BooleanFilter(method="filter_open")
    board = filters.BooleanFilter(method="filter_board", help_text="Open leads + leads closed in the last 30 days")
    mine = filters.BooleanFilter(method="filter_mine")
    unassigned = filters.BooleanFilter(field_name="assigned_to", lookup_expr="isnull")
    created_from = filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    created_to = filters.DateFilter(field_name="created_at", lookup_expr="date__lte")
    # Matches a lead if any of its event types is the one asked for.
    event_type = filters.CharFilter(method="filter_event_type")

    class Meta:
        model = Lead
        fields = ["status", "source", "assigned_to", "client"]

    def filter_event_type(self, qs, name, value):
        return qs.filter(Q(event_types__contains=[value]) | Q(event_type=value)) if value else qs

    def filter_open(self, qs, name, value):
        return qs.filter(status__in=Lead.OPEN_STATUSES) if value else qs.exclude(status__in=Lead.OPEN_STATUSES)

    def filter_board(self, qs, name, value):
        if not value:
            return qs
        since = timezone.now() - datetime.timedelta(days=30)
        return qs.filter(Q(status__in=Lead.OPEN_STATUSES) | Q(status_changed_at__gte=since))

    def filter_mine(self, qs, name, value):
        return qs.filter(assigned_to=self.request.user) if value else qs


class LeadViewSet(viewsets.ModelViewSet):
    permission_classes = [RoleAccess]
    read_roles = ALL_ROLES
    write_roles = SALES_ROLES
    filterset_class = LeadFilter
    search_fields = ["name", "phone", "email", "venue", "client__name"]
    ordering_fields = ["created_at", "event_date", "status_changed_at", "name"]

    def get_queryset(self):
        qs = Lead.objects.select_related("assigned_to", "client", "package", "service", "booking").prefetch_related(
            Prefetch(
                "follow_ups",
                queryset=FollowUp.objects.filter(completed_at__isnull=True).order_by("due_at"),
                to_attr="open_follow_ups",
            )
        )
        if is_staff_member(self.request.user):
            qs = qs.filter(assigned_to=self.request.user)
        return qs

    def get_serializer_class(self):
        return s.LeadCreateSerializer if self.action == "create" else s.LeadSerializer

    def perform_create(self, serializer):
        user = self.request.user
        data = dict(serializer.validated_data)
        if is_staff_member(user):
            data["assigned_to"] = user  # staff own what they enter
        try:
            serializer.instance = services.create_lead(user=user, **data)
        except DjangoValidationError as exc:
            raise as_drf_error(exc)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    def perform_destroy(self, instance):
        if not is_manager(self.request.user):
            raise PermissionDenied("Only the owner or a manager can delete leads.")
        if hasattr(instance, "booking") and instance.booking:
            raise ValidationError("This lead has a booking and can't be deleted.")
        instance.delete()

    def _run(self, fn, *args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except DjangoValidationError as exc:
            raise as_drf_error(exc)

    def _fresh(self, lead):
        return s.LeadSerializer(self.get_queryset().get(pk=lead.pk)).data

    @action(detail=True, methods=["post"])
    def status(self, request, pk=None):
        lead = self.get_object()
        body = s.StatusChangeSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        self._run(services.change_status, lead, user=request.user, **body.validated_data)
        return Response(self._fresh(lead))

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        if not is_manager(request.user):
            raise PermissionDenied("Only the owner or a manager can reassign leads.")
        lead = self.get_object()
        body = s.AssignSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        self._run(services.assign, lead, body.validated_data["assigned_to"], user=request.user)
        return Response(self._fresh(lead))

    @action(detail=True, methods=["get", "post"])
    def activities(self, request, pk=None):
        lead = self.get_object()
        if request.method == "GET":
            qs = lead.activities.select_related("created_by")
            return Response(s.LeadActivitySerializer(qs, many=True).data)
        body = s.LeadActivitySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        activity = services.record(lead, body.validated_data["kind"], body.validated_data["text"], request.user)
        return Response(s.LeadActivitySerializer(activity).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def convert(self, request, pk=None):
        if not is_manager(request.user):
            raise PermissionDenied("Only the owner or a manager can confirm bookings.")
        lead = self.get_object()
        body = s.ConvertLeadSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        client_data, booking_data = body.split()
        booking = self._run(services.convert_to_booking, lead, user=request.user, client_data=client_data, **booking_data)
        return Response(s.BookingSerializer(booking).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"])
    def pipeline(self, request):
        """Counts and budget per status for the board header, plus the 'new' badge count."""
        qs = self.filter_queryset(self.get_queryset()).order_by()
        rows = qs.values("status").annotate(count=Count("id"), budget=Sum("budget"))
        by_status = {r["status"]: {"count": r["count"], "budget": r["budget"] or 0} for r in rows}
        return Response(
            {
                "statuses": [
                    {"status": value, "label": label, **by_status.get(value, {"count": 0, "budget": 0})}
                    for value, label in Lead.Status.choices
                ],
                "new_count": self.get_queryset().filter(status=Lead.Status.NEW).count(),
            }
        )


# --- Clients ------------------------------------------------------------------


class ClientViewSet(viewsets.ModelViewSet):
    permission_classes = [RoleAccess]
    read_roles = ALL_ROLES
    write_roles = (*MANAGERS, Role.ACCOUNTANT)  # accountant maintains billing details (GSTIN, address)
    search_fields = ["name", "phone", "alt_phone", "email", "gstin"]
    ordering_fields = ["name", "created_at"]
    filterset_fields = ["city"]
    serializer_class = s.ClientSerializer

    def get_queryset(self):
        qs = Client.objects.annotate(
            lead_count=Count("leads", distinct=True), booking_count=Count("bookings", distinct=True)
        )
        user = self.request.user
        if is_staff_member(user):
            qs = qs.filter(
                Q(leads__assigned_to=user) | Q(bookings__in=staff_bookings(user).values("pk"))
            ).distinct()
        return qs.order_by("name")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    def perform_destroy(self, instance):
        if instance.leads.exists() or instance.bookings.exists():
            raise ValidationError("This client has leads or bookings and can't be deleted.")
        instance.delete()


# --- Follow-ups ----------------------------------------------------------------


class FollowUpFilter(filters.FilterSet):
    due = filters.ChoiceFilter(
        method="filter_due",
        choices=[("today", "today"), ("overdue", "overdue"), ("upcoming", "upcoming"), ("open", "open"), ("done", "done")],
    )
    mine = filters.BooleanFilter(method="filter_mine")

    class Meta:
        model = FollowUp
        fields = ["lead", "assigned_to", "kind"]

    def filter_due(self, qs, name, value):
        now = timezone.now()
        today = timezone.localdate()
        open_qs = qs.filter(completed_at__isnull=True)
        if value == "today":
            return open_qs.filter(due_at__date=today)
        if value == "overdue":
            return open_qs.filter(due_at__lt=now).exclude(due_at__date=today)
        if value == "upcoming":
            return open_qs.filter(due_at__date__gt=today)
        if value == "open":
            return open_qs
        return qs.filter(completed_at__isnull=False).order_by("-completed_at")

    def filter_mine(self, qs, name, value):
        return qs.filter(assigned_to=self.request.user) if value else qs


class FollowUpViewSet(viewsets.ModelViewSet):
    permission_classes = [RoleAccess]
    read_roles = ALL_ROLES
    write_roles = SALES_ROLES
    serializer_class = s.FollowUpSerializer
    filterset_class = FollowUpFilter
    search_fields = ["lead__name", "lead__phone", "notes"]

    def get_queryset(self):
        qs = FollowUp.objects.select_related("lead", "assigned_to", "completed_by")
        user = self.request.user
        if is_staff_member(user):
            qs = qs.filter(Q(lead__assigned_to=user) | Q(assigned_to=user))
        return qs

    def _check_lead_access(self, lead):
        user = self.request.user
        if is_staff_member(user) and lead.assigned_to_id != user.id:
            raise PermissionDenied("You can only schedule follow-ups on your own leads.")

    def perform_create(self, serializer):
        lead = serializer.validated_data["lead"]
        self._check_lead_access(lead)
        assignee = serializer.validated_data.get("assigned_to") or lead.assigned_to or self.request.user
        if is_staff_member(self.request.user):
            assignee = self.request.user
        fu = serializer.save(assigned_to=assignee, created_by=self.request.user)
        services.record(
            lead,
            LeadActivity.Kind.FOLLOW_UP,
            f"{fu.get_kind_display()} scheduled for {timezone.localtime(fu.due_at):%d %b %Y, %I:%M %p}"
            + (f": {fu.notes}" if fu.notes else ""),
            self.request.user,
        )

    def perform_update(self, serializer):
        if serializer.instance.completed_at:
            raise ValidationError("Completed follow-ups can't be edited.")
        if is_staff_member(self.request.user) and "assigned_to" in serializer.validated_data:
            serializer.validated_data.pop("assigned_to")
        serializer.save()

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        fu = self.get_object()
        body = s.CompleteFollowUpSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            services.complete_follow_up(fu, user=request.user, outcome=body.validated_data.get("outcome", ""))
        except DjangoValidationError as exc:
            raise as_drf_error(exc)
        return Response(s.FollowUpSerializer(fu).data)


# --- Bookings ----------------------------------------------------------------


class BookingFilter(filters.FilterSet):
    date_from = filters.DateFilter(method="filter_from")
    date_to = filters.DateFilter(method="filter_to")
    upcoming = filters.BooleanFilter(method="filter_upcoming")
    mine = filters.BooleanFilter(method="filter_mine")

    # Matches a booking if any of its event types is the one asked for.
    event_type = filters.CharFilter(method="filter_event_type")

    class Meta:
        model = Booking
        fields = ["status", "client", "coordinator"]

    def filter_event_type(self, qs, name, value):
        return qs.filter(Q(event_types__contains=[value]) | Q(event_type=value)) if value else qs

    # Multi-day events overlap a range if they end on/after its start and start on/before its end.
    def filter_from(self, qs, name, value):
        return qs.filter(Q(end_date__gte=value) | Q(end_date__isnull=True, event_date__gte=value))

    def filter_to(self, qs, name, value):
        return qs.filter(event_date__lte=value)

    def filter_upcoming(self, qs, name, value):
        today = timezone.localdate()
        if value:
            return qs.filter(event_date__gte=today).exclude(status=Booking.Status.CANCELLED)
        return qs.filter(event_date__lt=today)

    def filter_mine(self, qs, name, value):
        return qs.filter(pk__in=staff_bookings(self.request.user).values("pk")) if value else qs


class BookingViewSet(mixins.CreateModelMixin, mixins.UpdateModelMixin, viewsets.ReadOnlyModelViewSet):
    """No delete: bookings are cancelled, so the history (and later invoices) stay intact."""

    permission_classes = [RoleAccess]
    read_roles = ALL_ROLES
    write_roles = MANAGERS
    serializer_class = s.BookingSerializer
    filterset_class = BookingFilter
    search_fields = ["number", "title", "venue", "client__name", "client__phone"]
    ordering_fields = ["event_date", "created_at", "agreed_amount"]

    def get_queryset(self):
        qs = Booking.objects.select_related("client", "coordinator", "package", "lead")
        if is_staff_member(self.request.user):
            qs = qs.filter(pk__in=staff_bookings(self.request.user).values("pk"))
        return qs

    def perform_create(self, serializer):
        data = dict(serializer.validated_data)
        client = data.pop("client")
        try:
            serializer.instance = services.create_booking(client=client, user=self.request.user, **data)
        except DjangoValidationError as exc:
            raise as_drf_error(exc)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)
