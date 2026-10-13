import os

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models as dj_models
from django.utils import timezone
from rest_framework import serializers

from apps.core.choices import EventType
from apps.core.fields import RelativeImageField
from apps.core.validators import normalize_indian_phone
from apps.crm.models import Lead

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


def _string_list(value):
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise serializers.ValidationError("Must be a list of text items.")
    return [v.strip() for v in value if v.strip()]


class ImageFieldsMixin:
    """Every ImageField on these models is exposed as a relative URL."""

    serializer_field_mapping = {
        **serializers.ModelSerializer.serializer_field_mapping,
        dj_models.ImageField: RelativeImageField,
    }


# --- Public (read-only) ----------------------------------------------------


class PublicSettingsSerializer(ImageFieldsMixin, serializers.ModelSerializer):
    class Meta:
        model = SiteSettings
        exclude = ["id", "created_at", "updated_at"]


class PublicServiceSerializer(ImageFieldsMixin, serializers.ModelSerializer):
    category_label = serializers.CharField(source="get_category_display", read_only=True)

    class Meta:
        model = Service
        fields = [
            "slug",
            "name",
            "category",
            "category_label",
            "short_description",
            "description",
            "highlights",
            "cover_image",
            "starting_price",
            "is_featured",
            "seo_title",
            "seo_description",
        ]


class PublicPackageSerializer(serializers.ModelSerializer):
    event_type_label = serializers.CharField(source="get_event_type_display", read_only=True)

    class Meta:
        model = Package
        fields = [
            "slug",
            "name",
            "tagline",
            "event_type",
            "event_type_label",
            "price",
            "price_note",
            "inclusions",
            "is_popular",
        ]


class PublicGallerySerializer(ImageFieldsMixin, serializers.ModelSerializer):
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    gallery_category_name = serializers.CharField(source="gallery_category.name", read_only=True, default=None)

    class Meta:
        model = GalleryImage
        fields = ["id", "image", "category", "category_label", "gallery_category", "gallery_category_name", "caption", "alt_text", "is_featured"]


class PublicGalleryCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = GalleryCategory
        fields = ["id", "name"]


class PublicTestimonialSerializer(ImageFieldsMixin, serializers.ModelSerializer):
    event_type_label = serializers.CharField(source="get_event_type_display", read_only=True)

    class Meta:
        model = Testimonial
        fields = ["id", "client_name", "event_type", "event_type_label", "event_location", "quote", "rating", "photo", "is_featured"]


class EstimatorEventTypeSerializer(serializers.ModelSerializer):
    label = serializers.CharField(source="get_event_type_display", read_only=True)

    class Meta:
        model = EstimatorEventType
        fields = ["id", "event_type", "label", "description", "base_price", "per_guest_rate", "min_guests", "max_guests", "is_active", "order"]


class EstimatorTierSerializer(serializers.ModelSerializer):
    class Meta:
        model = EstimatorTier
        fields = ["id", "name", "description", "multiplier", "is_active", "order"]


class EstimatorAddonSerializer(serializers.ModelSerializer):
    class Meta:
        model = EstimatorAddon
        fields = ["id", "name", "description", "pricing", "price", "is_active", "order"]


class EstimateRequestSerializer(serializers.Serializer):
    event_type = serializers.ChoiceField(choices=EventType.choices)
    guests = serializers.IntegerField(min_value=1, max_value=100000)
    tier = serializers.IntegerField()
    addons = serializers.ListField(child=serializers.IntegerField(), required=False, default=list, max_length=50)


class EnquirySerializer(serializers.ModelSerializer):
    """Public enquiry form. `website` is a honeypot: humans never see it."""

    website = serializers.CharField(required=False, allow_blank=True, write_only=True)
    service = serializers.SlugRelatedField(
        slug_field="slug", queryset=Service.objects.filter(is_published=True), required=False, allow_null=True
    )
    package = serializers.SlugRelatedField(
        slug_field="slug", queryset=Package.objects.filter(is_published=True), required=False, allow_null=True
    )
    estimate_input = EstimateRequestSerializer(required=False, write_only=True)

    class Meta:
        model = Lead
        fields = [
            "name",
            "phone",
            "email",
            "event_type",
            "event_date",
            "venue",
            "guest_count",
            "budget",
            "message",
            "service",
            "package",
            "source_page",
            "estimate_input",
            "website",
        ]
        extra_kwargs = {"name": {"min_length": 2}, "message": {"max_length": 2000}}

    def validate_phone(self, value):
        try:
            return normalize_indian_phone(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages[0])

    def validate_event_date(self, value):
        if value and value < timezone.localdate():
            raise serializers.ValidationError("Event date can't be in the past.")
        return value


# --- Admin (CMS) ----------------------------------------------------------


class CmsSettingsSerializer(ImageFieldsMixin, serializers.ModelSerializer):
    class Meta:
        model = SiteSettings
        exclude = ["id", "created_at"]
        read_only_fields = ["updated_at"]
        extra_kwargs = {"hero_image": {"allow_null": True}, "about_image": {"allow_null": True}}


class CmsServiceSerializer(ImageFieldsMixin, serializers.ModelSerializer):
    category_label = serializers.CharField(source="get_category_display", read_only=True)

    class Meta:
        model = Service
        fields = "__all__"
        read_only_fields = ["created_at", "updated_at"]
        extra_kwargs = {"slug": {"required": False}, "cover_image": {"allow_null": True}}

    def validate_highlights(self, value):
        return _string_list(value)


class CmsPackageSerializer(serializers.ModelSerializer):
    event_type_label = serializers.CharField(source="get_event_type_display", read_only=True)

    class Meta:
        model = Package
        fields = "__all__"
        read_only_fields = ["created_at", "updated_at"]
        extra_kwargs = {"slug": {"required": False}}

    def validate_inclusions(self, value):
        return _string_list(value)


class CmsGalleryCategorySerializer(serializers.ModelSerializer):
    image_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = GalleryCategory
        fields = ["id", "name", "order", "image_count"]
        read_only_fields = ["order"]
        extra_kwargs = {"name": {"error_messages": {"blank": "Enter a category name."}}}

    def validate_name(self, value):
        value = " ".join(value.split())
        if value.lower() in GalleryCategory.RESERVED_NAMES:
            raise serializers.ValidationError(f"“{value}” is a reserved name. Pick another one.")
        clash = GalleryCategory.objects.filter(name__iexact=value).exclude(pk=getattr(self.instance, "pk", None)).first()
        if clash:
            raise serializers.ValidationError(f"A category named “{clash.name}” already exists.")
        return value


class CmsGallerySerializer(ImageFieldsMixin, serializers.ModelSerializer):
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    gallery_category_name = serializers.CharField(source="gallery_category.name", read_only=True, default=None)

    class Meta:
        model = GalleryImage
        fields = "__all__"
        read_only_fields = ["created_at", "updated_at"]

    def validate(self, attrs):
        if self.instance:
            return attrs
        if not attrs.get("gallery_category"):
            raise serializers.ValidationError({"gallery_category": "Choose a category to upload images."})
        # Uploads arrive as multipart form data, where DRF reads a missing boolean as False
        # (ignoring the model default). The Gallery page has no hide option, so new images
        # are always published unless the request explicitly says otherwise.
        if "is_published" not in self.initial_data:
            attrs["is_published"] = True
        # New photos are named after their file ("IMG_2041.jpg" → "IMG_2041").
        if not attrs.get("caption"):
            attrs["caption"] = os.path.splitext(os.path.basename(attrs["image"].name))[0].strip()[:160]
        attrs.setdefault("alt_text", attrs["caption"])
        return attrs


class CmsTestimonialSerializer(ImageFieldsMixin, serializers.ModelSerializer):
    event_type_label = serializers.CharField(source="get_event_type_display", read_only=True)

    class Meta:
        model = Testimonial
        fields = "__all__"
        read_only_fields = ["created_at", "updated_at"]
        extra_kwargs = {"photo": {"allow_null": True}}
