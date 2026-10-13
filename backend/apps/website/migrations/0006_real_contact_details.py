"""Replace the placeholder contact details with the ones on the client's visiting card.

Only values still equal to the old placeholders are changed, so anything the admin has
already edited in Website content › Settings is left alone.
"""

from urllib.parse import quote_plus

from django.db import migrations

ADDRESS = "Door no – 268-1, KSP Complex,\nPollachi Main Rd, Sundrapuram,\nCoimbatore – 641024"

# field: (old placeholder, new value)
CHANGES = {
    "phone": ("+91 90000 00000", "+91 98946 06292"),
    "phone_2": ("", "+91 94457 42696"),
    "whatsapp": ("919000000000", "919894606292"),
    "email": ("hello@example.com", "mitraeventmanagement@gmail.com"),
    "address": ("Placeholder address, Coimbatore, Tamil Nadu", ADDRESS),
    "map_embed_url": (
        "https://www.google.com/maps?q=Coimbatore&output=embed",
        "https://www.google.com/maps?q=" + quote_plus(ADDRESS.replace("\n", " ").replace(" – ", " ")) + "&output=embed",
    ),
    # Hours weren't on the card; hide the made-up ones until the client confirms.
    "business_hours": ("Mon–Sun, 9:00 AM – 8:00 PM", ""),
}


def forwards(apps, schema_editor):
    site = apps.get_model("website", "SiteSettings").objects.filter(pk=1).first()
    if site is None:
        return
    changed = []
    for field, (old, new) in CHANGES.items():
        if getattr(site, field) == old:
            setattr(site, field, new)
            changed.append(field)
    if changed:
        site.save(update_fields=changed)


class Migration(migrations.Migration):
    dependencies = [("website", "0005_site_phone_2")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
