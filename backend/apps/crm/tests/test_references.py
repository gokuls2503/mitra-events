import datetime
import io
from decimal import Decimal as D

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.crm import references, services
from apps.crm.models import LeadImage, LeadItem, MaterialCatalog
from apps.operations.models import EventAssignment


def user(role, name=None):
    name = name or role.lower()
    return User.objects.create_user(email=f"{name}@t.local", password="x-Pass-12345", full_name=name.title(), role=role)


def api(u):
    c = APIClient()
    c.force_authenticate(u)
    return c


def png(w=2400, h=1200, color="purple", fmt="PNG", name="photo.png", ctype="image/png"):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, fmt)
    return SimpleUploadedFile(name, buf.getvalue(), content_type=ctype)


@pytest.fixture(autouse=True)
def media(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


@pytest.fixture
def team(db):
    return {
        "manager": user(Role.MANAGER),
        "staff": user(Role.STAFF),
        "staff2": user(Role.STAFF, "staff2"),
        "accountant": user(Role.ACCOUNTANT),
    }


@pytest.fixture
def lead(team):
    return services.create_lead(name="Kavya", phone="+919876543210", event_type="WEDDING", assigned_to=team["staff"])


def upload(c, lead, **extra):
    data = {"image": png(), "section": "design", "source": "client", "caption": "Pastel backdrop"}
    data.update(extra)
    return c.post(f"/api/v1/crm/leads/{lead.pk}/images/", data, format="multipart")


# --- Images ------------------------------------------------------------------------------


@pytest.mark.django_db
class TestImageUpload:
    def test_upload_is_resized_and_thumbnailed(self, team, lead):
        res = upload(api(team["staff"]), lead)
        assert res.status_code == 201, res.data
        assert res.data["source"] == "client" and res.data["caption"] == "Pastel backdrop"
        assert res.data["image"].startswith("/media/leads/") and res.data["thumbnail"]
        img = LeadImage.objects.get()
        with Image.open(img.image) as full, Image.open(img.thumbnail) as thumb:
            assert max(full.size) == references.MAX_SIDE and full.format == "JPEG"
            assert max(thumb.size) == references.THUMB_SIDE

    def test_rejects_non_image(self, team, lead):
        fake = SimpleUploadedFile("evil.jpg", b"<?php system($_GET['x']); ?>", content_type="image/jpeg")
        res = upload(api(team["manager"]), lead, image=fake)
        assert res.status_code == 400 and "image" in res.data
        assert not LeadImage.objects.exists()

    def test_rejects_unsupported_format(self, team, lead):
        res = upload(api(team["manager"]), lead, image=png(fmt="GIF", name="a.gif", ctype="image/gif"))
        assert res.status_code == 400

    def test_rejects_oversized_file(self, team, lead, monkeypatch):
        monkeypatch.setattr(references, "MAX_UPLOAD_MB", 0.001)
        res = upload(api(team["manager"]), lead)
        assert res.status_code == 400 and "MB" in str(res.data)

    def test_stage_images_ignore_source(self, team, lead):
        res = upload(api(team["manager"]), lead, section="stage", source="client")
        assert res.data["source"] == "ours"

    def test_section_limit(self, team, lead, monkeypatch):
        monkeypatch.setattr(references, "MAX_IMAGES_PER_SECTION", 1)
        c = api(team["manager"])
        assert upload(c, lead).status_code == 201
        assert upload(c, lead).status_code == 400
        assert upload(c, lead, section="stage").status_code == 201  # limit is per section

    def test_move_to_stage_edit_caption_and_delete(self, team, lead):
        c = api(team["manager"])
        img_id = upload(c, lead).data["id"]
        res = c.patch(f"/api/v1/crm/lead-images/{img_id}/", {"section": "stage", "caption": "Empty hall"}, format="json")
        assert res.status_code == 200 and res.data["section"] == "stage" and res.data["source"] == "ours"
        assert c.get(f"/api/v1/crm/leads/{lead.pk}/images/?section=stage").data[0]["caption"] == "Empty hall"
        assert c.delete(f"/api/v1/crm/lead-images/{img_id}/").status_code == 204
        assert not LeadImage.objects.exists()


# --- Items ----------------------------------------------------------------------------------


@pytest.mark.django_db
class TestItems:
    def test_amounts_and_total(self, team, lead):
        jasmine = MaterialCatalog.objects.create(name="Malli poo (jasmine)", default_unit="muzham", default_rate=D("60"))
        c = api(team["staff"])
        # The unit is locked to the material's; a different one sent by the client is ignored.
        res = c.post(f"/api/v1/crm/leads/{lead.pk}/items/", {"catalog_item": jasmine.pk, "unit": "kg", "qty": "20", "rate": "60"}, format="json")
        assert res.status_code == 201, res.data
        assert res.data["name"] == "Malli poo (jasmine)" and res.data["unit"] == "muzham" and res.data["is_custom"] is False
        assert res.data["amount"] == "1200.00"
        c.post(f"/api/v1/crm/leads/{lead.pk}/items/", {"name": "Couple name board (acrylic)", "unit": "nos", "qty": "1", "rate": "1800"}, format="json")
        c.post(f"/api/v1/crm/leads/{lead.pk}/items/", {"name": "Rose petals", "unit": "kg", "qty": "2.5", "rate": "350.50"}, format="json")
        data = c.get(f"/api/v1/crm/leads/{lead.pk}/items/").data
        assert data["count"] == 3
        assert data["total"] == D("1200") + D("1800") + D("876.25")
        assert [i["is_custom"] for i in data["items"]] == [False, True, True]

    def test_edit_qty_updates_amount(self, team, lead):
        item = LeadItem.objects.create(lead=lead, name="Drape cloth", unit="metre", qty=D("10"), rate=D("120"))
        res = api(team["manager"]).patch(f"/api/v1/crm/lead-items/{item.pk}/", {"qty": "12.5"}, format="json")
        assert res.status_code == 200 and res.data["amount"] == "1500.00"

    def test_catalog_rate_change_does_not_rewrite_lead_items(self, team, lead):
        m = MaterialCatalog.objects.create(name="Backdrop frame", default_unit="nos", default_rate=D("2500"))
        api(team["manager"]).post(f"/api/v1/crm/leads/{lead.pk}/items/", {"catalog_item": m.pk, "qty": "1", "rate": "2500"}, format="json")
        m.default_rate = D("3000")
        m.save()
        assert LeadItem.objects.get().rate == D("2500")

    def test_catalog_rename_does_not_rename_lead_items(self, team, lead):
        m = MaterialCatalog.objects.create(name="Drape cloth", default_unit="metre")
        api(team["manager"]).post(f"/api/v1/crm/leads/{lead.pk}/items/", {"catalog_item": m.pk, "qty": "10", "rate": "90"}, format="json")
        assert api(team["manager"]).patch(f"/api/v1/crm/materials/{m.pk}/", {"name": "Satin drape"}, format="json").status_code == 200
        assert LeadItem.objects.get().name == "Drape cloth"

    def test_unit_of_material_item_cannot_be_changed(self, team, lead):
        m = MaterialCatalog.objects.create(name="Rose petals", default_unit="kg")
        item = LeadItem.objects.create(lead=lead, catalog_item=m, name=m.name, unit="kg", qty=D("2"), rate=D("350"))
        assert api(team["manager"]).patch(f"/api/v1/crm/lead-items/{item.pk}/", {"unit": "g"}, format="json").status_code == 400

    @pytest.mark.parametrize(
        "body",
        [
            {"qty": "0", "rate": "10", "name": "x", "unit": "nos"},
            {"qty": "1", "rate": "-1", "name": "x", "unit": "nos"},
            {"qty": "1", "rate": "10", "unit": "nos"},  # no name
            {"qty": "1", "rate": "10", "name": "Plates"},  # custom item without a unit
            {"qty": "1", "rate": "10", "name": "Plates", "unit": "2kg"},  # unit not in the list
        ],
    )
    def test_invalid_items_rejected(self, team, lead, body):
        assert api(team["manager"]).post(f"/api/v1/crm/leads/{lead.pk}/items/", body, format="json").status_code == 400

    def test_inactive_catalog_item_rejected(self, team, lead):
        m = MaterialCatalog.objects.create(name="Old item", is_active=False)
        res = api(team["manager"]).post(f"/api/v1/crm/leads/{lead.pk}/items/", {"catalog_item": m.pk, "qty": "1", "rate": "1"}, format="json")
        assert res.status_code == 400


# --- Access ----------------------------------------------------------------------------------


@pytest.mark.django_db
class TestAccess:
    def test_staff_cannot_reach_other_leads(self, team, lead):
        c = api(team["staff2"])
        assert c.get(f"/api/v1/crm/leads/{lead.pk}/images/").status_code == 404
        assert upload(c, lead).status_code == 404
        assert c.get(f"/api/v1/crm/leads/{lead.pk}/items/").status_code == 404

    def test_accountant_read_only(self, team, lead):
        c = api(team["accountant"])
        assert c.get(f"/api/v1/crm/leads/{lead.pk}/items/").status_code == 200
        assert upload(c, lead).status_code == 403
        assert c.post(f"/api/v1/crm/leads/{lead.pk}/items/", {"name": "x", "qty": "1", "rate": "1"}, format="json").status_code == 403

    def test_references_stay_with_converted_booking(self, team, lead):
        c = api(team["manager"])
        upload(c, lead, section="stage")
        c.post(f"/api/v1/crm/leads/{lead.pk}/items/", {"name": "Banana tree", "unit": "pair", "qty": "2", "rate": "400"}, format="json")
        booking = services.convert_to_booking(
            lead, title="Kavya wedding", event_type="WEDDING", event_date=timezone.localdate() + datetime.timedelta(days=30), venue="Hall"
        )
        assert booking.lead.images.count() == 1 and booking.lead.items.count() == 1
        # The decor team assigned to the event (not the lead owner) can see and add references.
        EventAssignment.objects.create(booking=booking, staff=team["staff2"], role="Decor")
        c2 = api(team["staff2"])
        assert c2.get(f"/api/v1/crm/leads/{lead.pk}/items/").data["total"] == D("800")
        assert upload(c2, lead, section="stage").status_code == 201


# --- Materials catalog -------------------------------------------------------------------------


def add_material(c, **body):
    return c.post("/api/v1/crm/materials/", {"category": "flowers", "default_unit": "kg", **body}, format="json")


@pytest.mark.django_db
class TestCatalog:
    def test_starts_empty_and_lists_choices(self, team):
        c = api(team["staff"])
        assert c.get("/api/v1/crm/materials/").data == []
        choices = c.get("/api/v1/crm/materials/choices/").data
        assert choices["units"][:3] == ["nos", "kg", "g"] and {"value": "fabric", "label": "Fabric"} in choices["categories"]

    def test_manager_adds_with_optional_rate(self, team):
        res = add_material(api(team["manager"]), name="  Marigold   garland ", default_unit="muzham")
        assert res.status_code == 201, res.data
        assert res.data["name"] == "Marigold garland" and res.data["category_label"] == "Flowers" and res.data["default_rate"] is None

    @pytest.mark.parametrize("body", [{"default_unit": "2kg"}, {"default_unit": ""}, {"category": "food"}])
    def test_unit_and_category_must_come_from_the_lists(self, team, body):
        assert add_material(api(team["manager"]), name="Rose petals", **body).status_code == 400

    def test_duplicate_names_rejected_case_insensitively(self, team):
        c = api(team["manager"])
        add_material(c, name="Drape cloth")
        res = add_material(c, name="drape CLOTH")
        assert res.status_code == 400 and "already exists" in str(res.data["name"])

    def test_staff_can_read_not_write(self, team):
        c = api(team["staff"])
        assert c.get("/api/v1/crm/materials/").status_code == 200
        assert add_material(c, name="x").status_code == 403

    def test_rate_edit_and_deactivate_but_never_delete(self, team, lead):
        c = api(team["manager"])
        m = add_material(c, name="LED fairy lights", default_unit="nos").data
        assert c.patch(f"/api/v1/crm/materials/{m['id']}/", {"default_rate": "150"}, format="json").data["default_rate"] == "150.00"
        assert c.patch(f"/api/v1/crm/materials/{m['id']}/", {"is_active": False}, format="json").status_code == 200
        assert c.get("/api/v1/crm/materials/?is_active=true").data == []
        assert c.delete(f"/api/v1/crm/materials/{m['id']}/").status_code == 405

    def test_older_free_text_unit_survives_other_edits(self, team):
        m = MaterialCatalog.objects.create(name="Old", default_unit="piece")
        res = api(team["manager"]).patch(f"/api/v1/crm/materials/{m.pk}/", {"name": "Old", "default_unit": "piece", "default_rate": "10"}, format="json")
        assert res.status_code == 200


@pytest.mark.django_db
class TestSaveToMaterials:
    def url(self, item):
        return f"/api/v1/crm/lead-items/{item.pk}/save-to-materials/"

    def test_creates_material_and_links_item(self, team, lead):
        item = LeadItem.objects.create(lead=lead, name="Plates", unit="nos", qty=D("100"), rate=D("15"))
        res = api(team["manager"]).post(self.url(item), {"category": "other", "default_rate": "15"}, format="json")
        assert res.status_code == 200, res.data
        assert res.data["created"] is True and res.data["item"]["is_custom"] is False
        m = MaterialCatalog.objects.get()
        assert (m.name, m.category, m.default_unit, m.default_rate) == ("Plates", "other", "nos", D("15"))

    def test_links_to_existing_material_with_same_name(self, team, lead):
        existing = MaterialCatalog.objects.create(name="Rose petals", default_unit="kg")
        item = LeadItem.objects.create(lead=lead, name="rose petals", unit="kg", qty=D("2"), rate=D("300"))
        res = api(team["manager"]).post(self.url(item), {"category": "flowers"}, format="json")
        assert res.data["created"] is False and MaterialCatalog.objects.count() == 1
        item.refresh_from_db()
        assert item.catalog_item == existing and item.rate == D("300")

    def test_needs_a_listed_unit(self, team, lead):
        item = LeadItem.objects.create(lead=lead, name="Malli poo", unit="1kg", qty=D("5"), rate=D("50"))
        c = api(team["manager"])
        assert c.post(self.url(item), {"category": "flowers"}, format="json").status_code == 400
        assert c.post(self.url(item), {"category": "flowers", "unit": "kg"}, format="json").status_code == 200

    def test_staff_cannot_change_materials(self, team, lead):
        item = LeadItem.objects.create(lead=lead, name="Plates", unit="nos", qty=D("1"), rate=D("1"))
        assert api(team["staff"]).post(self.url(item), {"category": "other"}, format="json").status_code == 403
        assert not MaterialCatalog.objects.exists()
