from django.urls import path

from . import views

urlpatterns = [path("analytics/overview/", views.OverviewView.as_view(), name="analytics-overview")]
