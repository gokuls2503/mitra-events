from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.text import slugify

from apps.core.choices import EventType
from apps.core.models import TimeStampedModel
from apps.core.validators import validate_image_size


class SeoFields(models.Model):
    seo_title = models.CharField(max_length=70, blank=True, help_text="Defaults to the name if blank.")
    seo_description = models.CharField(max_length=160, blank=True)

    class Meta:
        abstract = True


class SiteSettings(TimeStampedModel):
    """Single row (pk=1) holding contact details and homepage text."""

    business_name = models.CharField(max_length=120, default="Mitra Events Management")
    tagline = models.CharField(max_length=160, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    phone_2 = models.CharField(max_length=20, blank=True, help_text="Optional second number")
    whatsapp = models.CharField(max_length=20, blank=True, help_text="Digits with country code, e.g. 919876543210")
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=60, default="Coimbatore")
    map_embed_url = models.URLField(max_length=500, blank=True)
    business_hours = models.CharField(max_length=120, blank=True)
    instagram_url = models.URLField(blank=True)
    facebook_url = models.URLField(blank=True)
    youtube_url = models.URLField(blank=True)

    hero_title = models.CharField(max_length=120, blank=True)
    hero_subtitle = models.CharField(max_length=240, blank=True)
    hero_image = models.ImageField(upload_to="site/", blank=True, validators=[validate_image_size])
    about_title = models.CharField(max_length=120, blank=True)
    about_body = models.TextField(blank=True)
    about_image = models.ImageField(upload_to="site/", blank=True, validators=[validate_image_size])

    stat_events = models.PositiveIntegerField(default=0, help_text="Events completed")
    stat_years = models.PositiveIntegerField(default=0, help_text="Years of experience")
    stat_clients = models.PositiveIntegerField(default=0, help_text="Happy clients")

    class Meta:
        verbose_name_plural = "site settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return "Site settings"


class SlugModel(models.Model):
    slug = models.SlugField(max_length=140, unique=True, blank=True)

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name)[:120] or "item"
            slug, n = base, 2
            while type(self).objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug, n = f"{base}-{n}", n + 1
            self.slug = slug
        super().save(*args, **kwargs)


class Service(SlugModel, SeoFields, TimeStampedModel):
    name = models.CharField(max_length=120)
    category = models.CharField(max_length=20, choices=EventType.choices)
    short_description = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    highlights = models.JSONField(default=list, blank=True, help_text="List of short bullet points")
    cover_image = models.ImageField(upload_to="services/", blank=True, validators=[validate_image_size])
    starting_price = models.DecimalField(max_digits=10, decimal_places=0, null=True, blank=True)
    is_featured = models.BooleanField(default=False)
    is_published = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "name"]

    def __str__(self):
        return self.name


class Package(SlugModel, TimeStampedModel):
    name = models.CharField(max_length=120)
    tagline = models.CharField(max_length=160, blank=True)
    event_type = models.CharField(max_length=20, choices=EventType.choices, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=0)
    price_note = models.CharField(max_length=80, blank=True, help_text='e.g. "starting from", "per event"')
    inclusions = models.JSONField(default=list, blank=True)
    is_popular = models.BooleanField(default=False)
    is_published = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "price"]

    def __str__(self):
        return self.name


class GalleryCategory(TimeStampedModel):
    """Admin-managed gallery groups (Wedding, Haldi & Mehendi…). Deleting one leaves its
    images Uncategorised (gallery_category = NULL) rather than deleting them."""

    RESERVED_NAMES = ("uncategorised", "uncategorized", "all categories")

    name = models.CharField(max_length=60, unique=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]
        verbose_name_plural = "gallery categories"

    def __str__(self):
        return self.name


class GalleryImage(TimeStampedModel):
    image = models.ImageField(upload_to="gallery/", validators=[validate_image_size])
    gallery_category = models.ForeignKey(
        GalleryCategory, null=True, blank=True, on_delete=models.SET_NULL, related_name="images", help_text="Empty = Uncategorised"
    )
    # Links a photo to its service page ("Recent wedding work"). Photos uploaded from the
    # Gallery page don't set it.
    category = models.CharField(max_length=20, choices=EventType.choices, blank=True)
    caption = models.CharField(max_length=160, blank=True)
    alt_text = models.CharField(max_length=160, blank=True)
    is_featured = models.BooleanField(default=False, help_text="Show on the home page")
    is_published = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "-created_at"]

    def __str__(self):
        return self.caption or f"Gallery image {self.pk}"


class Testimonial(TimeStampedModel):
    client_name = models.CharField(max_length=120)
    event_type = models.CharField(max_length=20, choices=EventType.choices, blank=True)
    event_location = models.CharField(max_length=120, blank=True)
    quote = models.TextField()
    rating = models.PositiveSmallIntegerField(default=5, validators=[MinValueValidator(1), MaxValueValidator(5)])
    photo = models.ImageField(upload_to="testimonials/", blank=True, validators=[validate_image_size])
    is_featured = models.BooleanField(default=False)
    is_published = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "-created_at"]

    def __str__(self):
        return f"{self.client_name} ({self.get_event_type_display()})"


# --- Cost estimator -------------------------------------------------------


class EstimatorEventType(models.Model):
    event_type = models.CharField(max_length=20, choices=EventType.choices, unique=True)
    description = models.CharField(max_length=160, blank=True)
    base_price = models.DecimalField(max_digits=10, decimal_places=0)
    per_guest_rate = models.DecimalField(max_digits=8, decimal_places=0, default=0)
    min_guests = models.PositiveIntegerField(default=50)
    max_guests = models.PositiveIntegerField(default=1500)
    is_active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "event_type"]

    def __str__(self):
        return self.get_event_type_display()


class EstimatorTier(models.Model):
    """Decor level, e.g. Classic ×1.0, Premium ×1.4, Luxury ×1.9."""

    name = models.CharField(max_length=60)
    description = models.CharField(max_length=160, blank=True)
    multiplier = models.DecimalField(max_digits=4, decimal_places=2, validators=[MinValueValidator(0.1)])
    is_active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "multiplier"]

    def __str__(self):
        return f"{self.name} ×{self.multiplier}"


class EstimatorAddon(models.Model):
    class Pricing(models.TextChoices):
        FLAT = "FLAT", "Flat price"
        PER_GUEST = "PER_GUEST", "Per guest"

    name = models.CharField(max_length=80)
    description = models.CharField(max_length=160, blank=True)
    pricing = models.CharField(max_length=10, choices=Pricing.choices, default=Pricing.FLAT)
    price = models.DecimalField(max_digits=10, decimal_places=0)
    is_active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "name"]

    def __str__(self):
        return self.name
