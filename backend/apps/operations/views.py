"""Operations API: vendors, event assignments, tasks and the daily dashboard.

Access:
  Owner / Manager  everything
  Staff            read vendors; see assignments on their events; tasks assigned to them
                   (or that they created) — they can add tasks for themselves and tick them off
  Accountant       read-only (vendors, assignments and tasks — needed for costing later)
"""

import datetime

from django.db.models import Count, Q
from django.utils import timezone
from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role
from apps.core.permissions import RoleAccess
from apps.crm.models import Booking, FollowUp, Lead
from apps.crm.views import ALL_ROLES, MANAGERS, SALES_ROLES, is_manager, is_staff_member, staff_bookings

from . import serializers as s
from . import services
from .models import EventAssignment, Task, Vendor


# --- Vendors ------------------------------------------------------------------------


class VendorViewSet(viewsets.ModelViewSet):
    permission_classes = [RoleAccess]
    read_roles = ALL_ROLES
    write_roles = MANAGERS
    serializer_class = s.VendorSerializer
    filterset_fields = ["category", "is_active"]
    search_fields = ["name", "contact_person", "phone", "email", "gstin"]
    ordering_fields = ["name", "category"]

    def get_queryset(self):
        today = timezone.localdate()
        return Vendor.objects.annotate(
            upcoming_jobs=Count(
                "assignments",
                filter=Q(assignments__booking__event_date__gte=today)
                & ~Q(assignments__status=EventAssignment.Status.CANCELLED)
                & ~Q(assignments__booking__status=Booking.Status.CANCELLED),
            )
        ).order_by("name")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    def perform_destroy(self, instance):
        if instance.assignments.exists():
            raise ValidationError("This vendor has event history. Mark them inactive instead.")
        instance.delete()


# --- Assignments ----------------------------------------------------------------------


class AssignmentViewSet(viewsets.ModelViewSet):
    permission_classes = [RoleAccess]
    read_roles = ALL_ROLES
    write_roles = MANAGERS
    serializer_class = s.AssignmentSerializer
    filterset_fields = ["booking", "staff", "vendor", "status"]
    pagination_class = None

    def get_queryset(self):
        qs = EventAssignment.objects.select_related("booking", "staff", "vendor")
        if is_staff_member(self.request.user):
            qs = qs.filter(booking__in=staff_bookings(self.request.user))
        return qs

    def list(self, request, *args, **kwargs):
        # Unpaginated lists are fine per event or per person, but never for "everything".
        if not any(k in request.query_params for k in ("booking", "staff", "vendor")):
            raise ValidationError("Filter by booking, staff or vendor.")
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


# --- Tasks ---------------------------------------------------------------------------


class TaskFilter(filters.FilterSet):
    when = filters.ChoiceFilter(
        method="filter_when",
        choices=[(c, c) for c in ("overdue", "today", "upcoming", "undated", "open", "done")],
    )
    mine = filters.BooleanFilter(method="filter_mine")

    class Meta:
        model = Task
        fields = ["booking", "assigned_to", "status", "priority"]

    def filter_when(self, qs, name, value):
        today = timezone.localdate()
        open_qs = qs.exclude(status=Task.Status.DONE)
        return {
            "overdue": open_qs.filter(due_date__lt=today),
            "today": open_qs.filter(due_date=today),
            "upcoming": open_qs.filter(due_date__gt=today),
            "undated": open_qs.filter(due_date__isnull=True),
            "open": open_qs,
            "done": qs.filter(status=Task.Status.DONE).order_by("-completed_at"),
        }[value]

    def filter_mine(self, qs, name, value):
        return qs.filter(assigned_to=self.request.user) if value else qs


class TaskViewSet(viewsets.ModelViewSet):
    permission_classes = [RoleAccess]
    read_roles = ALL_ROLES
    write_roles = SALES_ROLES
    serializer_class = s.TaskSerializer
    filterset_class = TaskFilter
    search_fields = ["title", "description", "booking__title", "booking__number"]

    def get_queryset(self):
        qs = Task.objects.select_related("assigned_to", "completed_by", "booking")
        user = self.request.user
        if is_staff_member(user):
            qs = qs.filter(Q(assigned_to=user) | Q(created_by=user))
        return qs

    def _check_booking(self, booking):
        if booking and is_staff_member(self.request.user) and not staff_bookings(self.request.user).filter(pk=booking.pk).exists():
            raise PermissionDenied("You can only add tasks to events you're working on.")

    def perform_create(self, serializer):
        user = self.request.user
        self._check_booking(serializer.validated_data.get("booking"))
        extra = {"created_by": user}
        if is_staff_member(user):
            extra["assigned_to"] = user
        task = serializer.save(**extra)
        if task.status == Task.Status.DONE:
            services.set_task_status(task, Task.Status.DONE, user=user)

    def perform_update(self, serializer):
        user = self.request.user
        if is_staff_member(user):
            serializer.validated_data.pop("assigned_to", None)
            self._check_booking(serializer.validated_data.get("booking"))
        new_status = serializer.validated_data.pop("status", None)
        task = serializer.save()
        if new_status and new_status != task.status:
            services.set_task_status(task, new_status, user=user)

    def perform_destroy(self, instance):
        user = self.request.user
        if not is_manager(user) and instance.created_by_id != user.id:
            raise PermissionDenied("You can only delete tasks you created.")
        instance.delete()

    @action(detail=False, methods=["post"], url_path="standard-checklist")
    def standard_checklist(self, request):
        if not is_manager(request.user):
            raise PermissionDenied("Only the owner or a manager can add the standard checklist.")
        try:
            booking = Booking.objects.get(pk=request.data.get("booking"))
        except (Booking.DoesNotExist, ValueError, TypeError):
            raise ValidationError({"booking": "Choose an event."})
        created = services.add_standard_checklist(booking, user=request.user)
        return Response({"created": len(created)}, status=status.HTTP_201_CREATED)


# --- Dashboard --------------------------------------------------------------------------


class DashboardView(APIView):
    """Everything the 'today' screen needs in one request, scoped to the viewer's role."""

    permission_classes = [RoleAccess]
    read_roles = ALL_ROLES

    def get(self, request):
        user = request.user
        today = timezone.localdate()
        now = timezone.now()
        week_end = today + datetime.timedelta(days=7)
        manager = is_manager(user)
        staff = is_staff_member(user)

        bookings = staff_bookings(user) if staff else Booking.objects.all()
        upcoming = (
            bookings.exclude(status=Booking.Status.CANCELLED)
            .filter(event_date__lte=week_end)
            .filter(Q(event_date__gte=today) | Q(end_date__gte=today) | Q(status=Booking.Status.IN_PROGRESS))
            .exclude(status=Booking.Status.COMPLETED)
            .select_related("client", "coordinator")
            .annotate(
                tasks_total=Count("tasks", distinct=True),
                tasks_done=Count("tasks", filter=Q(tasks__status=Task.Status.DONE), distinct=True),
                staff_count=Count("assignments", filter=Q(assignments__staff__isnull=False), distinct=True),
                vendor_count=Count("assignments", filter=Q(assignments__vendor__isnull=False), distinct=True),
                vendors_unconfirmed=Count(
                    "assignments",
                    filter=Q(assignments__vendor__isnull=False, assignments__status=EventAssignment.Status.PENDING),
                    distinct=True,
                ),
            )
            .order_by("event_date", "start_time")
        )

        events = [
            {
                "id": b.id,
                "number": b.number,
                "title": b.title,
                "event_date": b.event_date,
                "end_date": b.end_date,
                "start_time": b.start_time,
                "setup_time": b.setup_time,
                "venue": b.venue,
                "status": b.status,
                "status_label": b.get_status_display(),
                "client_name": b.client.name,
                "coordinator_name": b.coordinator.full_name if b.coordinator else None,
                "tasks_total": b.tasks_total,
                "tasks_done": b.tasks_done,
                "staff_count": b.staff_count,
                "vendor_count": b.vendor_count,
                "vendors_unconfirmed": b.vendors_unconfirmed,
            }
            for b in upcoming
        ]

        data = {"today": today, "events": events}
        if user.role in (Role.OWNER, Role.ACCOUNTANT):
            from apps.accounting.views import finance_snapshot  # accounting builds on operations, not vice versa

            data["finance"] = finance_snapshot()

        if user.role == Role.ACCOUNTANT:
            return Response(data)

        leads = Lead.objects.all() if manager else Lead.objects.filter(assigned_to=user)
        follow_ups = FollowUp.objects.filter(completed_at__isnull=True)
        follow_ups = follow_ups if manager else follow_ups.filter(Q(assigned_to=user) | Q(lead__assigned_to=user))
        my_tasks = Task.objects.filter(assigned_to=user).exclude(status=Task.Status.DONE)

        data["counts"] = {
            "new_leads": leads.filter(status=Lead.Status.NEW).count(),
            "unassigned_leads": leads.filter(status__in=Lead.OPEN_STATUSES, assigned_to__isnull=True).count() if manager else 0,
            "follow_ups_overdue": follow_ups.filter(due_at__lt=now).exclude(due_at__date=today).count(),
            "follow_ups_today": follow_ups.filter(due_at__date=today).count(),
            "tasks_overdue": my_tasks.filter(due_date__lt=today).count(),
            "tasks_today": my_tasks.filter(due_date=today).count(),
            "team_tasks_overdue": Task.objects.exclude(status=Task.Status.DONE).filter(due_date__lt=today).count() if manager else 0,
        }
        data["new_leads"] = [
            {
                "id": l.id,
                "name": l.name,
                "event_type_label": l.get_event_type_display(),
                "event_date": l.event_date,
                "source_label": l.get_source_display(),
                "created_at": l.created_at,
                "assigned_to_name": l.assigned_to.full_name if l.assigned_to else None,
            }
            for l in leads.filter(status=Lead.Status.NEW).select_related("assigned_to").order_by("created_at")[:6]
        ]
        data["my_tasks"] = s.TaskSerializer(
            my_tasks.filter(Q(due_date__lte=today + datetime.timedelta(days=3)) | Q(due_date__isnull=True))
            .select_related("booking", "assigned_to")
            .order_by("due_date", "-priority")[:10],
            many=True,
        ).data
        data["my_follow_ups"] = [
            {
                "id": f.id,
                "lead": f.lead_id,
                "lead_name": f.lead.name,
                "lead_phone": f.lead.phone,
                "kind_label": f.get_kind_display(),
                "due_at": f.due_at,
                "notes": f.notes,
            }
            for f in follow_ups.filter(Q(assigned_to=user) | Q(assigned_to__isnull=True, lead__assigned_to=user))
            .filter(due_at__date__lte=today)
            .select_related("lead")
            .order_by("due_at")[:8]
        ]
        if manager:
            soon = today + datetime.timedelta(days=30)
            data["attention"] = {
                "events_without_coordinator": list(
                    Booking.objects.filter(
                        coordinator__isnull=True, event_date__gte=today, event_date__lte=soon, status=Booking.Status.CONFIRMED
                    )
                    .order_by("event_date")
                    .values("id", "number", "title", "event_date")[:8]
                ),
            }
        return Response(data)
