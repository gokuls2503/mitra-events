from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

public = DefaultRouter(trailing_slash=True)
public.include_root_view = False
public.register("website/services", views.PublicServiceViewSet, basename="public-service")
public.register("website/packages", views.PublicPackageViewSet, basename="public-package")
public.register("website/gallery-categories", views.PublicGalleryCategoryViewSet, basename="public-gallery-category")
public.register("website/gallery", views.PublicGalleryViewSet, basename="public-gallery")
public.register("website/testimonials", views.PublicTestimonialViewSet, basename="public-testimonial")

cms = DefaultRouter()
cms.include_root_view = False
cms.register("cms/services", views.CmsServiceViewSet, basename="cms-service")
cms.register("cms/packages", views.CmsPackageViewSet, basename="cms-package")
cms.register("cms/gallery-categories", views.CmsGalleryCategoryViewSet, basename="cms-gallery-category")
cms.register("cms/gallery", views.CmsGalleryViewSet, basename="cms-gallery")
cms.register("cms/testimonials", views.CmsTestimonialViewSet, basename="cms-testimonial")
cms.register("cms/estimator/event-types", views.CmsEstimatorEventTypeViewSet, basename="cms-estimator-event-type")
cms.register("cms/estimator/tiers", views.CmsEstimatorTierViewSet, basename="cms-estimator-tier")
cms.register("cms/estimator/addons", views.CmsEstimatorAddonViewSet, basename="cms-estimator-addon")

urlpatterns = [
    path("website/settings/", views.PublicSettingsView.as_view(), name="public-settings"),
    path("website/estimator/", views.EstimatorOptionsView.as_view(), name="public-estimator"),
    path("website/estimate/", views.estimate_view, name="public-estimate"),
    path("website/enquiry/", views.EnquiryView.as_view(), name="public-enquiry"),
    path("cms/settings/", views.CmsSettingsView.as_view(), name="cms-settings"),
    *public.urls,
    *cms.urls,
]
