from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.include_root_view = False
router.register("ops/vendors", views.VendorViewSet, basename="vendor")
router.register("ops/assignments", views.AssignmentViewSet, basename="assignment")
router.register("ops/tasks", views.TaskViewSet, basename="task")

urlpatterns = [
    path("dashboard/", views.DashboardView.as_view(), name="dashboard"),
    *router.urls,
]
