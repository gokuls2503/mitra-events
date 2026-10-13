"""Publish gallery images that were saved hidden by mistake.

Uploads from the admin Gallery page were stored with is_published=False (a missing boolean in
multipart form data reads as False). That page has no hide option, so an unpublished image
could never be shown again; publish them all.
"""

from django.db import migrations


def forwards(apps, schema_editor):
    apps.get_model("website", "GalleryImage").objects.filter(is_published=False).update(is_published=True)


class Migration(migrations.Migration):
    dependencies = [("website", "0006_real_contact_details")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
