"""GET /analytics/overview/?from=&to=&compare=last_year|previous&export=xlsx

Visibility (approved role matrix):
  Owner       everything
  Manager     everything except expenses, profit and margins
  Accountant  money and bookings (no lead pipeline or team performance)
  Staff       no access
"""

import datetime

from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounting import exports
from apps.accounting.views import date_param, fy_start
from apps.accounts.models import Role
from apps.core.permissions import RoleAccess

from . import metrics

MAX_DAYS = 3 * 366


class OverviewView(APIView):
    permission_classes = [RoleAccess]
    read_roles = (Role.OWNER, Role.MANAGER, Role.ACCOUNTANT)

    def get(self, request):
        today = timezone.localdate()
        date_from = date_param(request, "from", fy_start(today))
        date_to = date_param(request, "to", today)
        if date_from > date_to:
            raise ValidationError({"from": "Start date must be before the end date."})
        if (date_to - date_from).days > MAX_DAYS:
            raise ValidationError({"from": "Choose a range of three years or less."})

        compare = request.query_params.get("compare", "last_year")
        if compare not in ("last_year", "previous"):
            raise ValidationError({"compare": "Use last_year or previous."})
        role = request.user.role
        data = metrics.overview(
            date_from,
            date_to,
            show_profit=role in (Role.OWNER, Role.ACCOUNTANT),
            show_leads=role in (Role.OWNER, Role.MANAGER),
            show_team=role in (Role.OWNER, Role.MANAGER),
            compare=compare,
        )
        if request.query_params.get("export") == "xlsx":
            return self.export(data, role)
        return Response(data)

    def export(self, data, role):
        cols = ["Month", "Revenue (excl. GST)", "Collected"]
        keys = ["revenue", "collected"]
        if "profit" in data["monthly"][0]:
            cols += ["Expenses", "Profit"]
            keys += ["expenses", "profit"]
        cols += ["Bookings", "Booked value"]
        keys += ["bookings", "booked_value"]
        if "leads" in data["monthly"][0]:
            cols += ["Leads", "Won"]
            keys += ["leads", "won"]
        rows = [[datetime.date.fromisoformat(r["month"] + "-01").strftime("%b %Y"), *[r[k] for k in keys]] for r in data["monthly"]]
        totals = ["Total", *[sum(r[k] for r in data["monthly"]) for k in keys]]
        return exports.xlsx_response(
            f"Business-overview-{data['date_from']}-{data['date_to']}",
            "Business overview",
            f"{data['date_from']:%d %b %Y} to {data['date_to']:%d %b %Y}",
            cols,
            rows,
            totals,
        )
