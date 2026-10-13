"""Starter list of materials. Rates are left empty for the client to fill in.

Safe to run again: only adds names that aren't there yet and never changes existing materials.
"""

from django.core.management.base import BaseCommand

from apps.crm.models import MaterialCatalog

C = MaterialCatalog.Category
MATERIALS = [
    ("Malli poo (jasmine)", C.FLOWERS, "muzham"),
    ("Rose petals", C.FLOWERS, "kg"),
    ("Marigold garland", C.FLOWERS, "muzham"),
    ("Banana tree", C.DECOR, "pair"),
    ("Backdrop frame", C.DECOR, "nos"),
    ("Brass lamp (kuthuvilakku)", C.DECOR, "nos"),
    ("LED fairy lights", C.LIGHTING, "nos"),
    ("Drape cloth", C.FABRIC, "metre"),
    ("Rose water", C.OTHER, "litre"),
]


class Command(BaseCommand):
    help = "Add the starter materials (without rates). Existing materials are left untouched."

    def handle(self, *args, **options):
        added = 0
        for name, category, unit in MATERIALS:
            if not MaterialCatalog.objects.filter(name__iexact=name).exists():
                MaterialCatalog.objects.create(name=name, category=category, default_unit=unit)
                added += 1
        self.stdout.write(self.style.SUCCESS(f"Added {added} material(s); {len(MATERIALS) - added} already existed."))
