import io
from pathlib import Path

import pytest
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from PIL import Image, ImageChops
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.website.models import GalleryCategory, GalleryImage

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path / "media"


def photo_bytes(kind="JPEG", mode="RGB", size=(800, 600)):
    buf = io.BytesIO()
    Image.new(mode, size, (120, 40, 110) if mode == "RGB" else (120, 40, 110, 0)).save(buf, kind)
    return buf.getvalue()


def manager():
    c = APIClient()
    c.force_authenticate(User.objects.create_user(email="m@t.local", password="x-Pass-12345", full_name="M", role=Role.MANAGER))
    return c


def stored_bytes(item):
    return Path(item.image.path).read_bytes()


def changed(before, after):
    """Which parts of the photo were stamped: the centred name, the top-left logo, and anywhere else."""
    a, b = Image.open(io.BytesIO(before)).convert("RGB"), Image.open(io.BytesIO(after)).convert("RGB")
    assert a.size == b.size
    marks = ImageChops.difference(a, b).convert("L").point(lambda v: 255 if v > 24 else 0)
    w, h = a.size
    centre, logo = (round(w * 0.2), round(h * 0.3), round(w * 0.8), round(h * 0.7)), (0, 0, round(w * 0.2), round(h * 0.25))
    rest = marks.copy()
    for box in (centre, logo):
        rest.paste(0, box)
    return {"centre": bool(marks.crop(centre).getbbox()), "logo": bool(marks.crop(logo).getbbox()), "elsewhere": bool(rest.getbbox())}


BOTH = {"centre": True, "logo": True, "elsewhere": False}


def test_upload_gets_the_centred_name_and_logo_only_once():
    c, original = manager(), photo_bytes()
    category = GalleryCategory.objects.create(name="Watermark test")
    res = c.post(
        "/api/v1/cms/gallery/",
        {"gallery_category": category.pk, "image": SimpleUploadedFile("stage.jpg", original, content_type="image/jpeg")},
        format="multipart",
    )
    assert res.status_code == 201, res.data
    item = GalleryImage.objects.get()
    assert item.is_watermarked and item.has_logo and item.image.name.endswith(".jpg")
    assert changed(original, stored_bytes(item)) == BOTH

    before = stored_bytes(item)
    assert c.patch(f"/api/v1/cms/gallery/{item.pk}/", {"caption": "Stage"}, format="json").status_code == 200
    item.refresh_from_db()
    assert stored_bytes(item) == before  # editing the details doesn't stamp it again


def test_transparent_png_stays_png():
    item = GalleryImage.objects.create(image=SimpleUploadedFile("logo.png", photo_bytes("PNG", "RGBA")))
    assert item.image.name.endswith(".png")
    with Image.open(io.BytesIO(stored_bytes(item))) as img:
        assert img.format == "PNG" and img.mode == "RGBA"


def test_tiny_photo_is_handled():
    assert GalleryImage.objects.create(image=SimpleUploadedFile("t.jpg", photo_bytes(size=(20, 20)))).is_watermarked


def test_command_stamps_old_photos_keeps_originals_and_skips_stamped(tmp_path):
    original = photo_bytes()
    old = GalleryImage(caption="old")
    old.image.save("old.jpg", ContentFile(original), save=False)  # committed already: stored as an old, unstamped upload
    old.save()
    assert not old.is_watermarked
    backups = tmp_path / "originals"

    call_command("watermark_gallery", backup_dir=str(backups))
    old.refresh_from_db()
    assert old.is_watermarked and old.has_logo and (backups / "old.jpg").read_bytes() == original
    assert changed(original, stored_bytes(old)) == BOTH

    stamped = stored_bytes(old)
    call_command("watermark_gallery", backup_dir=str(backups))
    old.refresh_from_db()
    assert stored_bytes(old) == stamped and (backups / "old.jpg").read_bytes() == original


def test_command_adds_only_the_logo_to_photos_that_already_have_the_name(tmp_path):
    named = GalleryImage.objects.create(image=SimpleUploadedFile("named.jpg", photo_bytes()))
    GalleryImage.objects.filter(pk=named.pk).update(has_logo=False)  # stamped before the logo existed
    before = stored_bytes(named)

    call_command("watermark_gallery", backup_dir=str(tmp_path / "originals"))
    named.refresh_from_db()
    assert named.has_logo and changed(before, stored_bytes(named)) == {"centre": False, "logo": True, "elsewhere": False}
