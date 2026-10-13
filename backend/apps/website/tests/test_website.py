import datetime
import io
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.core.choices import EventType
from apps.crm.models import Lead
from apps.website import models as website_models
from apps.website.models import (
    EstimatorAddon,
    EstimatorEventType,
    EstimatorTier,
    Package,
    Service,
)


@pytest.fixture(autouse=True)
def media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def estimator(db):
    EstimatorEventType.objects.create(
        event_type=EventType.WEDDING, base_price=90000, per_guest_rate=120, min_guests=100, max_guests=2000
    )
    tier = EstimatorTier.objects.create(name="Premium", multiplier=Decimal("1.40"))
    flat = EstimatorAddon.objects.create(name="Arch", pricing="FLAT", price=8000)
    per_guest = EstimatorAddon.objects.create(name="Gifts", pricing="PER_GUEST", price=120)
    return tier, flat, per_guest


def login_as(client, role):
    user = User.objects.create_user(email=f"{role.lower()}@t.local", password="x-Pass-12345", full_name=role, role=role)
    client.force_authenticate(user)
    return user


def enquiry(**extra):
    data = {"name": "Kavya", "phone": "98765 43210", "event_type": "BIRTHDAY", "message": "Hi"}
    data.update(extra)
    return data


@pytest.mark.django_db
class TestPublicContent:
    def test_unpublished_services_are_hidden(self, client):
        Service.objects.create(name="Live", category="WEDDING", short_description="x")
        Service.objects.create(name="Draft", category="WEDDING", short_description="x", is_published=False)
        res = client.get("/api/v1/website/services/")
        assert [s["name"] for s in res.data] == ["Live"]
        assert client.get("/api/v1/website/services/draft/").status_code == 404

    def test_service_slug_is_generated_and_unique(self):
        a = Service.objects.create(name="Wedding Decor", category="WEDDING", short_description="x")
        b = Service.objects.create(name="Wedding Decor", category="WEDDING", short_description="x")
        assert (a.slug, b.slug) == ("wedding-decor", "wedding-decor-2")

    def test_service_detail_by_slug(self, client):
        Service.objects.create(name="Corporate Events", category="CORPORATE", short_description="x")
        res = client.get("/api/v1/website/services/corporate-events/")
        assert res.status_code == 200
        assert res.data["category_label"] == "Corporate event"

    def test_public_endpoints_ignore_bad_auth_header(self, client):
        client.credentials(HTTP_AUTHORIZATION="Bearer expired.or.garbage")
        assert client.get("/api/v1/website/settings/").status_code == 200

    def test_image_urls_are_relative(self, client):
        buf = io.BytesIO()
        Image.new("RGB", (10, 10)).save(buf, "JPEG")
        s = Service.objects.create(name="Pic", category="WEDDING", short_description="x")
        s.cover_image.save("a.jpg", SimpleUploadedFile("a.jpg", buf.getvalue()))
        res = client.get("/api/v1/website/services/pic/")
        assert res.data["cover_image"].startswith("/media/services/")


@pytest.mark.django_db
class TestEstimator:
    def test_formula(self, client, estimator):
        tier, flat, per_guest = estimator
        res = client.post(
            "/api/v1/website/estimate/",
            {"event_type": "WEDDING", "guests": 300, "tier": tier.pk, "addons": [flat.pk, per_guest.pk]},
            format="json",
        )
        assert res.status_code == 200, res.data
        # base 90000 + 120*300 = 126000; ×1.4 = 176400; + 8000 + 36000 = 220400
        assert res.data["total"] == 220400
        assert (res.data["low"], res.data["high"]) == (198000, 253000)
        assert sum(line["amount"] for line in res.data["lines"]) == 220400

    def test_guest_bounds(self, client, estimator):
        tier, *_ = estimator
        res = client.post("/api/v1/website/estimate/", {"event_type": "WEDDING", "guests": 10, "tier": tier.pk}, format="json")
        assert res.status_code == 400 and "guests" in res.data

    def test_inactive_addon_rejected(self, client, estimator):
        tier, flat, _ = estimator
        flat.is_active = False
        flat.save()
        res = client.post(
            "/api/v1/website/estimate/",
            {"event_type": "WEDDING", "guests": 200, "tier": tier.pk, "addons": [flat.pk]},
            format="json",
        )
        assert res.status_code == 400

    def test_unconfigured_event_type(self, client, estimator):
        tier, *_ = estimator
        res = client.post("/api/v1/website/estimate/", {"event_type": "CORPORATE", "guests": 200, "tier": tier.pk}, format="json")
        assert res.status_code == 400 and "event_type" in res.data


@pytest.mark.django_db
class TestEnquiry:
    def test_creates_lead_with_normalised_phone(self, client):
        res = client.post("/api/v1/website/enquiry/", enquiry(), format="json")
        assert res.status_code == 201, res.data
        lead = Lead.objects.get()
        assert lead.phone == "+919876543210"
        assert (lead.status, lead.source) == (Lead.Status.NEW, Lead.Source.WEBSITE)

    @pytest.mark.parametrize("phone", ["12345", "5876543210", "98765432101"])
    def test_rejects_bad_phone(self, client, phone):
        res = client.post("/api/v1/website/enquiry/", enquiry(phone=phone), format="json")
        assert res.status_code == 400 and "phone" in res.data

    def test_honeypot_pretends_success_but_saves_nothing(self, client):
        res = client.post("/api/v1/website/enquiry/", enquiry(website="http://spam"), format="json")
        assert res.status_code == 201
        assert not Lead.objects.exists()

    def test_past_event_date_rejected(self, client):
        past = (timezone.localdate() - datetime.timedelta(days=1)).isoformat()
        res = client.post("/api/v1/website/enquiry/", enquiry(event_date=past), format="json")
        assert res.status_code == 400

    def test_rate_limited_after_20_per_hour(self, client):
        for _ in range(20):
            assert client.post("/api/v1/website/enquiry/", enquiry(), format="json").status_code == 201
        assert client.post("/api/v1/website/enquiry/", enquiry(), format="json").status_code == 429

    def test_links_package_by_slug(self, client):
        Package.objects.create(name="Signature", price=55000)
        res = client.post("/api/v1/website/enquiry/", enquiry(package="signature"), format="json")
        assert res.status_code == 201
        assert Lead.objects.get().package.name == "Signature"

    def test_estimate_snapshot_is_computed_server_side(self, client, estimator):
        tier, flat, _ = estimator
        data = enquiry(event_type="", estimate_input={"event_type": "WEDDING", "guests": 300, "tier": tier.pk, "addons": [flat.pk]})
        data.pop("event_type")
        res = client.post("/api/v1/website/enquiry/", data, format="json")
        assert res.status_code == 201, res.data
        lead = Lead.objects.get()
        assert lead.source == Lead.Source.ESTIMATOR
        assert lead.estimate["total"] == 176400 + 8000
        assert (lead.event_type, lead.guest_count) == ("WEDDING", 300)

    def test_invalid_estimate_does_not_lose_the_lead(self, client, estimator):
        tier, *_ = estimator
        res = client.post(
            "/api/v1/website/enquiry/",
            enquiry(estimate_input={"event_type": "WEDDING", "guests": 1, "tier": tier.pk}),
            format="json",
        )
        assert res.status_code == 201
        lead = Lead.objects.get()
        assert lead.estimate is None and lead.source == Lead.Source.WEBSITE


@pytest.mark.django_db
class TestCmsPermissions:
    def test_anonymous_blocked(self, client):
        assert client.get("/api/v1/cms/services/").status_code == 401

    @pytest.mark.parametrize("role", [Role.STAFF, Role.ACCOUNTANT])
    def test_other_roles_blocked(self, client, role):
        login_as(client, role)
        assert client.get("/api/v1/cms/services/").status_code == 403
        assert client.patch("/api/v1/cms/settings/", {"tagline": "x"}, format="json").status_code == 403

    @pytest.mark.parametrize("role", [Role.OWNER, Role.MANAGER])
    def test_content_roles_can_edit(self, client, role):
        login_as(client, role)
        res = client.post(
            "/api/v1/cms/packages/",
            {"name": "Gold", "price": 30000, "inclusions": ["Stage", "  ", "Lights"]},
            format="json",
        )
        assert res.status_code == 201, res.data
        assert res.data["inclusions"] == ["Stage", "Lights"]
        assert client.patch("/api/v1/cms/settings/", {"tagline": "New"}, format="json").data["tagline"] == "New"

    def test_cms_sees_unpublished(self, client):
        login_as(client, Role.MANAGER)
        website_models.Testimonial.objects.create(client_name="Hidden", quote="q", is_published=False)
        assert len(client.get("/api/v1/cms/testimonials/").data) == 1

    def test_image_upload_and_clear(self, client):
        login_as(client, Role.MANAGER)
        svc = Service.objects.create(name="S", category="WEDDING", short_description="x")
        buf = io.BytesIO()
        Image.new("RGB", (20, 20), "purple").save(buf, "PNG")
        res = client.patch(
            f"/api/v1/cms/services/{svc.pk}/",
            {"cover_image": SimpleUploadedFile("c.png", buf.getvalue(), content_type="image/png")},
            format="multipart",
        )
        assert res.status_code == 200 and res.data["cover_image"].startswith("/media/")
        res = client.patch(f"/api/v1/cms/services/{svc.pk}/", {"cover_image": None}, format="json")
        assert res.status_code == 200 and res.data["cover_image"] is None

    def test_non_image_upload_rejected(self, client):
        login_as(client, Role.MANAGER)
        svc = Service.objects.create(name="S", category="WEDDING", short_description="x")
        res = client.patch(
            f"/api/v1/cms/services/{svc.pk}/",
            {"cover_image": SimpleUploadedFile("evil.png", b"<?php echo 1; ?>", content_type="image/png")},
            format="multipart",
        )
        assert res.status_code == 400
