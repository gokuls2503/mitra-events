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


def centred_only(original, stored):
    """The middle of the photo changed; its corners didn't. A one-off name, not a pattern."""
    a, b = Image.open(io.BytesIO(original)).convert("RGB"), Image.open(io.BytesIO(stored)).convert("RGB")
    assert a.size == b.size
    box = ImageChops.difference(a, b).point(lambda v: 255 if v > 24 else 0).getbbox()
    assert box, "nothing was stamped"
    left, top, right, bottom = box
    return left > a.width * 0.2 and right < a.width * 0.8 and top > a.height * 0.3 and bottom < a.height * 0.7


def test_upload_gets_one_centred_name_and_only_once():
    c, original = manager(), photo_bytes()
    category = GalleryCategory.objects.create(name="Watermark test")
    res = c.post(
        "/api/v1/cms/gallery/",
        {"gallery_category": category.pk, "image": SimpleUploadedFile("stage.jpg", original, content_type="image/jpeg")},
        format="multipart",
    )
    assert res.status_code == 201, res.data
    item = GalleryImage.objects.get()
    assert item.is_watermarked and item.image.name.endswith(".jpg")
    assert centred_only(original, stored_bytes(item))

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
    assert old.is_watermarked and (backups / "old.jpg").read_bytes() == original
    assert centred_only(original, stored_bytes(old))

    stamped = stored_bytes(old)
    call_command("watermark_gallery", backup_dir=str(backups))
    old.refresh_from_db()
    assert stored_bytes(old) == stamped and (backups / "old.jpg").read_bytes() == original
