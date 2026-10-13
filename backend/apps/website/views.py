import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count
from rest_framework import generics, mixins, status, viewsets
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import Role
from apps.core.permissions import RoleAccess
from apps.crm.models import Lead
from apps.crm.services import create_lead

from . import serializers as s
from .estimator import calculate_estimate
from .gallery import next_order
from .models import (
    EstimatorAddon,
    EstimatorEventType,
    EstimatorTier,
    GalleryCategory,
    GalleryImage,
    Package,
    Service,
    SiteSettings,
    Testimonial,
)

logger = logging.getLogger(__name__)


# --- Public ----------------------------------------------------------------


class PublicMixin:
    authentication_classes: list = []
    permission_classes = [AllowAny]
    pagination_class = None


class PublicSettingsView(PublicMixin, generics.RetrieveAPIView):
    serializer_class = s.PublicSettingsSerializer

    def get_object(self):
        return SiteSettings.load()


class PublicServiceViewSet(PublicMixin, viewsets.ReadOnlyModelViewSet):
    queryset = Service.objects.filter(is_published=True)
    serializer_class = s.PublicServiceSerializer
    lookup_field = "slug"
    filterset_fields = ["category", "is_featured"]


class PublicPackageViewSet(PublicMixin, viewsets.ReadOnlyModelViewSet):
    queryset = Package.objects.filter(is_published=True)
    serializer_class = s.PublicPackageSerializer
    lookup_field = "slug"
    filterset_fields = ["event_type", "is_popular"]


class PublicGalleryViewSet(PublicMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = GalleryImage.objects.filter(is_published=True).select_related("gallery_category")
    serializer_class = s.PublicGallerySerializer
    filterset_fields = ["category", "gallery_category", "is_featured"]


class PublicGalleryCategoryViewSet(PublicMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    """Every admin category, including empty ones, so the website can show "Photos coming soon"."""

    queryset = GalleryCategory.objects.order_by("order", "id")
    serializer_class = s.PublicGalleryCategorySerializer


class PublicTestimonialViewSet(PublicMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = Testimonial.objects.filter(is_published=True)
    serializer_class = s.PublicTestimonialSerializer
    filterset_fields = ["is_featured"]


class EstimatorOptionsView(PublicMixin, APIView):
    def get(self, request):
        return Response(
            {
                "event_types": s.EstimatorEventTypeSerializer(
                    EstimatorEventType.objects.filter(is_active=True), many=True
                ).data,
                "tiers": s.EstimatorTierSerializer(EstimatorTier.objects.filter(is_active=True), many=True).data,
                "addons": s.EstimatorAddonSerializer(EstimatorAddon.objects.filter(is_active=True), many=True).data,
            }
        )


def _estimate_from(data):
    try:
        return calculate_estimate(
            event_type=data["event_type"], guests=data["guests"], tier_id=data["tier"], addon_ids=data["addons"]
        )
    except DjangoValidationError as exc:
        raise ValidationError(exc.message_dict)


class EstimateThrottle(SimpleRateThrottle):
    scope = "estimate"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([EstimateThrottle])
def estimate_view(request):
    serializer = s.EstimateRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    return Response(_estimate_from(serializer.validated_data).as_dict())


class EnquiryView(PublicMixin, APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_form"

    def post(self, request):
        serializer = s.EnquirySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if data.pop("website", ""):
            # Honeypot filled in: almost certainly a bot. Pretend success, store nothing.
            logger.info("Enquiry honeypot triggered from %s", request.META.get("REMOTE_ADDR"))
            return Response({"ok": True}, status=status.HTTP_201_CREATED)

        estimate_input = data.pop("estimate_input", None)
        estimate = None
        if estimate_input:
            try:
                estimate = _estimate_from(estimate_input).as_dict()
            except ValidationError:
                estimate = None  # Never lose a lead over a stale estimate.
            if estimate:
                data.setdefault("event_type", estimate["event_type"])
                data.setdefault("guest_count", estimate["guests"])

        create_lead(
            **data,
            estimate=estimate,
            source=Lead.Source.ESTIMATOR if estimate else Lead.Source.WEBSITE,
        )
        return Response({"ok": True}, status=status.HTTP_201_CREATED)


# --- Admin CMS (Owner + Manager) --------------------------------------------

CONTENT_ROLES = (Role.OWNER, Role.MANAGER)


class CmsMixin:
    permission_classes = [RoleAccess]
    read_roles = CONTENT_ROLES
    write_roles = CONTENT_ROLES
    pagination_class = None


class CmsSettingsView(CmsMixin, generics.RetrieveUpdateAPIView):
    serializer_class = s.CmsSettingsSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self):
        return SiteSettings.load()


class CmsServiceViewSet(CmsMixin, viewsets.ModelViewSet):
    queryset = Service.objects.all()
    serializer_class = s.CmsServiceSerializer
    search_fields = ["name", "short_description"]
    filterset_fields = ["category", "is_published"]


class CmsPackageViewSet(CmsMixin, viewsets.ModelViewSet):
    queryset = Package.objects.all()
    serializer_class = s.CmsPackageSerializer
    filterset_fields = ["event_type", "is_published"]


class CmsGalleryCategoryViewSet(CmsMixin, viewsets.ModelViewSet):
    """Deleting a category keeps its images: they become Uncategorised (FK set to NULL)."""

    serializer_class = s.CmsGalleryCategorySerializer

    def get_queryset(self):
        return GalleryCategory.objects.annotate(image_count=Count("images")).order_by("order", "id")

    def perform_create(self, serializer):
        serializer.save(order=next_order())


class CmsGalleryViewSet(CmsMixin, viewsets.ModelViewSet):
    # Featured first, as the admin Gallery lists them.
    queryset = GalleryImage.objects.select_related("gallery_category").order_by("-is_featured", "order", "-created_at")
    serializer_class = s.CmsGallerySerializer
    filterset_fields = ["category", "gallery_category", "is_published", "is_featured"]

    def perform_destroy(self, instance):
        instance.image.delete(save=False)
        instance.delete()


class CmsTestimonialViewSet(CmsMixin, viewsets.ModelViewSet):
    queryset = Testimonial.objects.all()
    serializer_class = s.CmsTestimonialSerializer
    filterset_fields = ["is_published"]


class CmsEstimatorEventTypeViewSet(CmsMixin, viewsets.ModelViewSet):
    queryset = EstimatorEventType.objects.all()
    serializer_class = s.EstimatorEventTypeSerializer


class CmsEstimatorTierViewSet(CmsMixin, viewsets.ModelViewSet):
    queryset = EstimatorTier.objects.all()
    serializer_class = s.EstimatorTierSerializer


class CmsEstimatorAddonViewSet(CmsMixin, viewsets.ModelViewSet):
    queryset = EstimatorAddon.objects.all()
    serializer_class = s.EstimatorAddonSerializer
