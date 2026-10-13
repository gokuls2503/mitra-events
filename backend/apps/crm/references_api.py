"""API for lead references (Design / Stage images, Items) and the materials catalog.

Access mirrors the lead: Owner/Manager everything; Staff only their leads (and leads of events
they work on); Accountant read-only. The materials catalog is edited by Owner/Manager.
"""

from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.fields import RelativeImageField
from apps.core.permissions import RoleAccess

from . import references
from .models import LeadImage, LeadItem, MaterialCatalog
from .units import UNITS, check_unit
from .views import ALL_ROLES, MANAGERS, SALES_ROLES, as_drf_error

ZERO = Decimal("0.00")


# --- Serializers ------------------------------------------------------------------


class LeadImageSerializer(serializers.ModelSerializer):
    image = RelativeImageField(read_only=True)
    thumbnail = RelativeImageField(read_only=True)
    uploaded_by_name = serializers.CharField(source="uploaded_by.full_name", read_only=True, default=None)

    class Meta:
        model = LeadImage
        fields = ["id", "lead", "section", "image", "thumbnail", "caption", "source", "uploaded_by_name", "created_at"]
        read_only_fields = ["lead", "created_at"]


class ImageUploadSerializer(serializers.Serializer):
    image = serializers.FileField()  # checked by references.process_upload
    section = serializers.ChoiceField(choices=LeadImage.Section.choices)
    source = serializers.ChoiceField(choices=LeadImage.Source.choices, default=LeadImage.Source.OURS)
    caption = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


def normalise_name(value: str) -> str:
    return " ".join(value.split())


class MaterialSerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    default_rate = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"), required=False, allow_null=True)

    class Meta:
        model = MaterialCatalog
        fields = ["id", "name", "category", "category_label", "default_unit", "default_rate", "is_active"]
        extra_kwargs = {"default_unit": {"required": True}, "category": {"required": True}}

    def validate_name(self, value):
        value = normalise_name(value)
        clash = MaterialCatalog.objects.filter(name__iexact=value).exclude(pk=getattr(self.instance, "pk", None))
        if clash.exists():
            raise serializers.ValidationError("A material with this name already exists.")
        return value

    def validate_default_unit(self, value):
        if self.instance and value == self.instance.default_unit:
            return value  # an older unit saved before the list existed
        return check_unit(value)


class LeadItemSerializer(serializers.ModelSerializer):
    catalog_item = serializers.PrimaryKeyRelatedField(queryset=MaterialCatalog.objects.all(), required=False, allow_null=True)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    is_custom = serializers.SerializerMethodField()
    qty = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))
    rate = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))

    class Meta:
        model = LeadItem
        fields = ["id", "lead", "catalog_item", "name", "unit", "qty", "rate", "amount", "is_custom"]
        read_only_fields = ["lead"]
        extra_kwargs = {"name": {"required": False}}

    def get_is_custom(self, obj):
        return obj.catalog_item_id is None

    def validate(self, attrs):
        if self.instance:
            return self.validate_update(attrs)
        catalog = attrs.get("catalog_item")
        if catalog is not None:
            if not catalog.is_active:
                raise serializers.ValidationError({"catalog_item": "This material is no longer in use."})
            # Name and unit come from Materials (the unit is locked); the rate may differ per lead.
            attrs["name"] = catalog.name
            attrs["unit"] = catalog.default_unit
            return attrs
        if not (attrs.get("name") or "").strip():
            raise serializers.ValidationError({"name": "Type the item name or pick one from Materials."})
        try:
            attrs["unit"] = check_unit(attrs.get("unit"))
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({"unit": exc.detail})
        attrs["name"] = normalise_name(attrs["name"])
        return attrs

    def validate_update(self, attrs):
        attrs.pop("catalog_item", None)  # linking happens through save-to-materials
        if "name" in attrs:
            attrs["name"] = normalise_name(attrs["name"])
        unit = attrs.get("unit")
        if unit is not None and unit != self.instance.unit:
            if self.instance.catalog_item_id:
                raise serializers.ValidationError({"unit": "This item's unit comes from Materials."})
            try:
                attrs["unit"] = check_unit(unit)
            except serializers.ValidationError as exc:
                raise serializers.ValidationError({"unit": exc.detail})
        return attrs


class SaveToMaterialsSerializer(serializers.Serializer):
    category = serializers.ChoiceField(choices=MaterialCatalog.Category.choices)
    unit = serializers.CharField(required=False, allow_blank=True)
    default_rate = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"), required=False, allow_null=True)


def items_payload(lead) -> dict:
    items = list(lead.items.select_related("catalog_item"))
    data = LeadItemSerializer(items, many=True).data
    return {"items": data, "count": len(items), "total": sum((i.amount for i in items), ZERO)}


# --- Lead-scoped endpoints ---------------------------------------------------------------


class LeadReferenceAccess:
    permission_classes = [RoleAccess]
    read_roles = ALL_ROLES
    write_roles = SALES_ROLES

    def get_lead(self, lead_id):
        return get_object_or_404(references.reference_leads(self.request.user), pk=lead_id)


class LeadImagesView(LeadReferenceAccess, APIView):
    """GET /crm/leads/{id}/images/?section=  ·  POST multipart: image, section, source, caption"""

    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, lead_id):
        lead = self.get_lead(lead_id)
        qs = lead.images.select_related("uploaded_by")
        section = request.query_params.get("section")
        if section:
            qs = qs.filter(section=section)
        return Response(LeadImageSerializer(qs, many=True).data)

    def post(self, request, lead_id):
        lead = self.get_lead(lead_id)
        body = ImageUploadSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            img = references.add_image(lead=lead, upload=body.validated_data["image"], user=request.user, **{k: v for k, v in body.validated_data.items() if k != "image"})
        except DjangoValidationError as exc:
            raise as_drf_error(exc)
        return Response(LeadImageSerializer(img).data, status=status.HTTP_201_CREATED)


class LeadItemsView(LeadReferenceAccess, APIView):
    """GET /crm/leads/{id}/items/ → {items, count, total}  ·  POST one item"""

    parser_classes = [JSONParser]

    def get(self, request, lead_id):
        return Response(items_payload(self.get_lead(lead_id)))

    def post(self, request, lead_id):
        lead = self.get_lead(lead_id)
        body = LeadItemSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        body.save(lead=lead)
        return Response(body.data, status=status.HTTP_201_CREATED)


class LeadImageViewSet(LeadReferenceAccess, mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """PATCH caption / section (move) / source; DELETE."""

    serializer_class = LeadImageSerializer
    http_method_names = ["patch", "delete", "options"]

    def get_queryset(self):
        return LeadImage.objects.filter(lead__in=references.reference_leads(self.request.user).values("pk"))

    def perform_update(self, serializer):
        section = serializer.validated_data.get("section", serializer.instance.section)
        if section == LeadImage.Section.STAGE:
            serializer.validated_data["source"] = LeadImage.Source.OURS  # source only applies to Design
        serializer.save()

    def perform_destroy(self, instance):
        instance.image.delete(save=False)
        instance.thumbnail.delete(save=False)
        instance.delete()


class LeadItemViewSet(LeadReferenceAccess, mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = LeadItemSerializer
    http_method_names = ["post", "patch", "delete", "options"]  # POST only for save-to-materials

    def get_queryset(self):
        return LeadItem.objects.filter(lead__in=references.reference_leads(self.request.user).values("pk"))

    @action(detail=True, methods=["post"], url_path="save-to-materials")
    def save_to_materials(self, request, pk=None):
        """Add a custom item to Materials (or link it to a material with the same name)."""
        if request.user.role not in MANAGERS:
            raise PermissionDenied("Only the owner or a manager can change Materials.")
        item = self.get_object()
        if item.catalog_item_id:
            raise ValidationError("This item is already from Materials.")
        body = SaveToMaterialsSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        material = MaterialCatalog.objects.filter(name__iexact=item.name).first()
        created = material is None
        if created:
            try:
                unit = check_unit(body.validated_data.get("unit") or item.unit)
            except serializers.ValidationError as exc:
                raise ValidationError({"unit": exc.detail})
            material = MaterialCatalog.objects.create(
                name=normalise_name(item.name),
                category=body.validated_data["category"],
                default_unit=unit,
                default_rate=body.validated_data.get("default_rate"),
            )
        item.catalog_item = material
        item.save(update_fields=["catalog_item", "updated_at"])
        return Response({"item": LeadItemSerializer(item).data, "created": created, "material": material.name})


# --- Materials catalog -----------------------------------------------------------------------


class MaterialViewSet(viewsets.ModelViewSet):
    """Catalog of predefined materials. Never deleted — made inactive instead, so leads that
    used a material keep it."""

    permission_classes = [RoleAccess]
    read_roles = ALL_ROLES
    write_roles = MANAGERS
    serializer_class = MaterialSerializer
    search_fields = ["name"]
    filterset_fields = ["is_active", "category"]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return MaterialCatalog.objects.order_by("name")

    @action(detail=False)
    def choices(self, request):
        """Units and categories for the dropdowns, so the app has a single list to read."""
        return Response({"units": UNITS, "categories": [{"value": v, "label": l} for v, l in MaterialCatalog.Category.choices]})
