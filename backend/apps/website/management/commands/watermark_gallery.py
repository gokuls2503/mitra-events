"""Stamps gallery photos uploaded before the watermark or the logo existed. Safe to run again: finished ones are skipped.
A photo that already has the centred name only gets the logo added.

Each original is copied to a folder outside media/ first, so it's kept but no longer public.
"""

from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.website.models import GalleryImage
from apps.website.watermark import watermarked


class Command(BaseCommand):
    help = "Burn the MITRA EVENTS watermark and logo into existing gallery photos."

    def add_arguments(self, parser):
        parser.add_argument("--backup-dir", default=str(settings.BASE_DIR / "gallery_originals"))

    def handle(self, *args, **options):
        backups = Path(options["backup_dir"])
        backups.mkdir(parents=True, exist_ok=True)
        done = skipped = 0
        for item in GalleryImage.objects.filter(has_logo=False):
            storage, name = item.image.storage, item.image.name
            if not storage.exists(name):
                self.stderr.write(f"Skipped, file missing: {name}")
                skipped += 1
                continue
            with storage.open(name) as stored:
                original = stored.read()
                stamped = watermarked(stored, name, centre=not item.is_watermarked)
            backup = backups / Path(name).name
            if not backup.exists():
                backup.write_bytes(original)
            # The same name, so the old unstamped copy is gone and every link to it keeps working.
            storage.delete(name)
            saved = storage.save(str(Path(name).with_name(stamped.name)), stamped)
            GalleryImage.objects.filter(pk=item.pk).update(image=saved, is_watermarked=True, has_logo=True)
            done += 1
        self.stdout.write(self.style.SUCCESS(f"Stamped {done} photo(s); {skipped} skipped. Originals are in {backups}."))
