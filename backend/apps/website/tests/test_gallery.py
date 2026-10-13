import io
import os

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.core.choices import EventType
from apps.website.models import GalleryCategory, GalleryImage

CATEGORIES = "/api/v1/cms/gallery-categories/"
IMAGES = "/api/v1/cms/gallery/"


@pytest.fixture(autouse=True)
def media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


def jpeg(name="IMG_2041.jpg"):
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), "purple").save(buf, "JPEG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/jpeg")


def client_for(role):
    c = APIClient()
    c.force_authenticate(User.objects.create_user(email=f"{role.lower()}@t.local", password="x-Pass-12345", full_name=role, role=role))
    return c


@pytest.fixture
def manager(db):
    return client_for(Role.MANAGER)


def upload(c, category, **extra):
    return c.post(IMAGES, {"image": jpeg(), "gallery_category": category.pk if category else "", **extra}, format="multipart")


@pytest.mark.django_db
class TestCategories:
    def test_starter_categories_exist(self, manager):
        names = [c["name"] for c in manager.get(CATEGORIES).data]
        assert names[:5] == ["Wedding", "Engagement", "Haldi & Mehendi", "Birthday", "Corporate"]

    def test_add_goes_last_and_rename(self, manager):
        res = manager.post(CATEGORIES, {"name": "  Baby   shower "}, format="json")
        assert res.status_code == 201 and res.data["name"] == "Baby shower"
        assert manager.get(CATEGORIES).data[-1]["name"] == "Baby shower"
        res = manager.patch(f"{CATEGORIES}{res.data['id']}/", {"name": "Seemantham"}, format="json")
        assert res.status_code == 200 and res.data["name"] == "Seemantham"

    @pytest.mark.parametrize(
        "name, message",
        [
            ("", "Enter a category name."),
            ("   ", "Enter a category name."),
            ("wedding", "already exists"),
            ("Uncategorised", "reserved"),
            ("uncategorized", "reserved"),
            ("All Categories", "reserved"),
        ],
    )
    def test_rejected_names(self, manager, name, message):
        res = manager.post(CATEGORIES, {"name": name}, format="json")
        assert res.status_code == 400 and message in str(res.data["name"])

    def test_renaming_to_own_name_in_other_case_is_allowed(self, manager):
        wedding = GalleryCategory.objects.get(name="Wedding")
        assert manager.patch(f"{CATEGORIES}{wedding.pk}/", {"name": "WEDDING"}, format="json").status_code == 200

    def test_delete_moves_images_to_uncategorised(self, manager):
        wedding = GalleryCategory.objects.get(name="Wedding")
        upload(manager, wedding)
        upload(manager, wedding)
        assert manager.get(CATEGORIES).data[0]["image_count"] == 2
        assert manager.delete(f"{CATEGORIES}{wedding.pk}/").status_code == 204
        assert GalleryImage.objects.count() == 2
        assert not GalleryImage.objects.filter(gallery_category__isnull=False).exists()


@pytest.mark.django_db
class TestImages:
    def test_upload_named_after_file_and_not_featured(self, manager):
        cat = GalleryCategory.objects.get(name="Birthday")
        res = upload(manager, cat)
        assert res.status_code == 201, res.data
        assert res.data["caption"] == "IMG_2041" and res.data["alt_text"] == "IMG_2041"
        assert res.data["is_featured"] is False and res.data["gallery_category_name"] == "Birthday"
        assert res.data["category"] == ""  # no event type, so it doesn't show on service pages

    def test_upload_needs_a_category(self, manager):
        res = upload(manager, None)
        assert res.status_code == 400 and "Choose a category" in str(res.data["gallery_category"])

    def test_rejects_non_images(self, manager):
        bad = SimpleUploadedFile("notes.jpg", b"not an image", content_type="image/jpeg")
        res = manager.post(IMAGES, {"image": bad, "gallery_category": GalleryCategory.objects.first().pk}, format="multipart")
        assert res.status_code == 400

    def test_featured_toggle_and_featured_first(self, manager):
        cat = GalleryCategory.objects.get(name="Corporate")
        first = upload(manager, cat).data
        second = upload(manager, cat).data
        assert manager.patch(f"{IMAGES}{first['id']}/", {"is_featured": True}, format="json").data["is_featured"] is True
        ids = [i["id"] for i in manager.get(IMAGES).data]
        assert ids.index(first["id"]) < ids.index(second["id"])

    def test_delete_removes_file(self, manager, tmp_path):
        img = upload(manager, GalleryCategory.objects.first()).data
        path = GalleryImage.objects.get(pk=img["id"]).image.path
        assert manager.delete(f"{IMAGES}{img['id']}/").status_code == 204
        assert not GalleryImage.objects.exists()
        assert not os.path.exists(path)

    def test_staff_and_accountant_cannot_manage(self, db):
        for role in (Role.STAFF, Role.ACCOUNTANT):
            c = client_for(role)
            assert c.get(CATEGORIES).status_code == 403
            assert c.post(CATEGORIES, {"name": "x"}, format="json").status_code == 403


@pytest.mark.django_db
class TestPublic:
    def test_public_gallery_has_category_name_and_keeps_event_type(self, manager):
        wedding = GalleryCategory.objects.get(name="Wedding")
        GalleryImage.objects.create(image=jpeg(), category=EventType.WEDDING, gallery_category=wedding, caption="Mandap")
        upload(manager, None)  # rejected: never reaches the site
        row = APIClient().get("/api/v1/website/gallery/").data[0]
        assert row["gallery_category_name"] == "Wedding" and row["category"] == "WEDDING"


@pytest.mark.django_db
class TestWebsiteSync:
    """What the admin does shows up on the public API on the next request."""

    def public_ids(self):
        return {(i["id"], i["is_featured"]) for i in APIClient().get("/api/v1/website/gallery/").data}

    def test_upload_is_published_and_featuring_shows_it(self, manager):
        # Regression: multipart uploads used to be saved with is_published=False.
        img = upload(manager, GalleryCategory.objects.get(name="Birthday")).data
        assert img["is_published"] is True
        assert (img["id"], False) in self.public_ids()
        manager.patch(f"{IMAGES}{img['id']}/", {"is_featured": True}, format="json")
        assert (img["id"], True) in self.public_ids()
        manager.patch(f"{IMAGES}{img['id']}/", {"is_featured": False}, format="json")
        assert (img["id"], False) in self.public_ids()
        manager.delete(f"{IMAGES}{img['id']}/")
        assert not any(i == img["id"] for i, _ in self.public_ids())

    def test_explicitly_hidden_upload_stays_hidden(self, manager):
        img = upload(manager, GalleryCategory.objects.first(), is_published="false").data
        assert img["is_published"] is False and not self.public_ids()

    def test_public_categories_include_empty_ones_and_follow_changes(self, manager):
        url = "/api/v1/website/gallery-categories/"
        names = [c["name"] for c in APIClient().get(url).data]
        assert names[:5] == ["Wedding", "Engagement", "Haldi & Mehendi", "Birthday", "Corporate"]
        new = manager.post(CATEGORIES, {"name": "Baby shower"}, format="json").data
        assert "Baby shower" in [c["name"] for c in APIClient().get(url).data]
        manager.patch(f"{CATEGORIES}{new['id']}/", {"name": "Seemantham"}, format="json")
        names = [c["name"] for c in APIClient().get(url).data]
        assert "Seemantham" in names and "Baby shower" not in names
        manager.delete(f"{CATEGORIES}{new['id']}/")
        assert "Seemantham" not in [c["name"] for c in APIClient().get(url).data]

    def test_renamed_category_name_reaches_images(self, manager):
        cat = GalleryCategory.objects.get(name="Corporate")
        upload(manager, cat)
        manager.patch(f"{CATEGORIES}{cat.pk}/", {"name": "Corporate events"}, format="json")
        assert APIClient().get("/api/v1/website/gallery/").data[0]["gallery_category_name"] == "Corporate events"
