from django.urls import path
from rest_framework.routers import DefaultRouter

from . import references_api, views

router = DefaultRouter()
router.include_root_view = False
router.register("crm/leads", views.LeadViewSet, basename="lead")
router.register("crm/clients", views.ClientViewSet, basename="client")
router.register("crm/follow-ups", views.FollowUpViewSet, basename="follow-up")
router.register("crm/bookings", views.BookingViewSet, basename="booking")
router.register("crm/lead-images", references_api.LeadImageViewSet, basename="lead-image")
router.register("crm/lead-items", references_api.LeadItemViewSet, basename="lead-item")
router.register("crm/materials", references_api.MaterialViewSet, basename="material")

urlpatterns = [
    path("crm/leads/<int:lead_id>/images/", references_api.LeadImagesView.as_view(), name="lead-images"),
    path("crm/leads/<int:lead_id>/items/", references_api.LeadItemsView.as_view(), name="lead-items"),
    *router.urls,
]
