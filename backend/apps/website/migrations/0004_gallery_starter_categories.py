"""Starter gallery categories, and existing photos moved into them.

Photos whose event type has no starter category get a category named after that event type,
so nothing becomes Uncategorised unexpectedly. Each photo keeps its event type, which the
service pages use for "Recent … work".
"""

from django.db import migrations

STARTER = ["Wedding", "Engagement", "Haldi & Mehendi", "Birthday", "Corporate"]
FROM_EVENT_TYPE = {"WEDDING": "Wedding", "ENGAGEMENT": "Engagement", "BIRTHDAY": "Birthday", "CORPORATE": "Corporate"}
# Event type labels as they were when this migration was written (apps.core.choices.EventType).
EVENT_TYPE_LABELS = {
    "RECEPTION": "Reception",
    "BABY_SHOWER": "Baby shower / Seemantham",
    "HOUSEWARMING": "Housewarming",
    "TRADITIONAL": "Puja & traditional",
    "OTHER": "Other",
}


def forwards(apps, schema_editor):
    GalleryCategory = apps.get_model("website", "GalleryCategory")
    GalleryImage = apps.get_model("website", "GalleryImage")
    by_name = {}
    for i, name in enumerate(STARTER):
        by_name[name], _ = GalleryCategory.objects.get_or_create(name=name, defaults={"order": i})
    for img in GalleryImage.objects.filter(gallery_category__isnull=True).exclude(category=""):
        name = FROM_EVENT_TYPE.get(img.category) or EVENT_TYPE_LABELS.get(img.category, img.category.title())
        if name not in by_name:
            by_name[name], _ = GalleryCategory.objects.get_or_create(name=name, defaults={"order": len(by_name)})
        img.gallery_category = by_name[name]
        img.save(update_fields=["gallery_category"])


class Migration(migrations.Migration):
    dependencies = [("website", "0003_gallery_categories")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
