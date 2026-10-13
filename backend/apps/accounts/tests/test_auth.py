import pytest
from django.conf import settings
from rest_framework.test import APIClient

from apps.accounts.models import Role, User

PASSWORD = "S3cure-pass-123"
COOKIE = settings.REFRESH_COOKIE_NAME


@pytest.fixture
def client():
    return APIClient()


def make_user(role=Role.STAFF, email=None, **extra):
    return User.objects.create_user(
        email=email or f"{role.lower()}@test.local", password=PASSWORD, full_name=role.title(), role=role, **extra
    )


def login(client, user):
    res = client.post("/api/v1/auth/login/", {"email": user.email, "password": PASSWORD}, format="json")
    assert res.status_code == 200, res.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
    return res


@pytest.mark.django_db
class TestAuthFlow:
    def test_login_returns_access_and_sets_httponly_refresh_cookie(self, client):
        user = make_user()
        res = login(client, user)
        assert res.data["user"]["role"] == Role.STAFF
        assert "refresh" not in res.data
        assert res.cookies[COOKIE]["httponly"]

    def test_login_is_case_insensitive_on_email(self, client):
        user = make_user()
        res = client.post("/api/v1/auth/login/", {"email": user.email.upper(), "password": PASSWORD}, format="json")
        assert res.status_code == 200

    def test_wrong_password_rejected(self, client):
        user = make_user()
        res = client.post("/api/v1/auth/login/", {"email": user.email, "password": "nope"}, format="json")
        assert res.status_code == 400

    def test_inactive_user_cannot_login(self, client):
        user = make_user(is_active=False)
        res = client.post("/api/v1/auth/login/", {"email": user.email, "password": PASSWORD}, format="json")
        assert res.status_code == 400

    def test_me_requires_auth(self, client):
        assert client.get("/api/v1/auth/me/").status_code == 401

    def test_me_returns_current_user(self, client):
        user = make_user(Role.MANAGER)
        login(client, user)
        res = client.get("/api/v1/auth/me/")
        assert res.data["email"] == user.email

    def test_me_cannot_change_own_role(self, client):
        user = make_user(Role.STAFF)
        login(client, user)
        client.patch("/api/v1/auth/me/", {"role": Role.OWNER}, format="json")
        user.refresh_from_db()
        assert user.role == Role.STAFF

    def test_refresh_rotates_and_old_token_is_rejected(self, client):
        user = make_user()
        old = login(client, user).cookies[COOKIE].value

        res = client.post("/api/v1/auth/refresh/")
        assert res.status_code == 200 and res.data["access"]
        assert res.cookies[COOKIE].value != old

        replay = APIClient()
        replay.cookies[COOKIE] = old
        assert replay.post("/api/v1/auth/refresh/").status_code == 401

    def test_refresh_without_cookie_is_401(self, client):
        assert client.post("/api/v1/auth/refresh/").status_code == 401

    def test_logout_blacklists_refresh(self, client):
        user = make_user()
        token = login(client, user).cookies[COOKIE].value
        assert client.post("/api/v1/auth/logout/").status_code == 204

        replay = APIClient()
        replay.cookies[COOKIE] = token
        assert replay.post("/api/v1/auth/refresh/").status_code == 401

    def test_refresh_fails_for_deactivated_user(self, client):
        user = make_user()
        login(client, user)
        User.objects.filter(pk=user.pk).update(is_active=False)
        assert client.post("/api/v1/auth/refresh/").status_code == 401

    def test_change_password(self, client):
        user = make_user()
        login(client, user)
        res = client.post(
            "/api/v1/auth/change-password/",
            {"current_password": PASSWORD, "new_password": "An0ther-good-pass"},
            format="json",
        )
        assert res.status_code == 204
        user.refresh_from_db()
        assert user.check_password("An0ther-good-pass")


@pytest.mark.django_db
class TestUserManagement:
    @pytest.mark.parametrize("role", [Role.MANAGER, Role.STAFF, Role.ACCOUNTANT])
    def test_non_owner_cannot_list_users(self, client, role):
        login(client, make_user(role))
        assert client.get("/api/v1/users/").status_code == 403

    def test_owner_can_create_user(self, client):
        login(client, make_user(Role.OWNER))
        res = client.post(
            "/api/v1/users/",
            {"email": "New@Test.local", "full_name": "New", "role": Role.ACCOUNTANT, "password": "Good-pass-987"},
            format="json",
        )
        assert res.status_code == 201, res.data
        assert "password" not in res.data
        assert User.objects.get(email="new@test.local").check_password("Good-pass-987")

    def test_create_requires_password(self, client):
        login(client, make_user(Role.OWNER))
        res = client.post("/api/v1/users/", {"email": "x@test.local", "full_name": "X"}, format="json")
        assert res.status_code == 400

    def test_users_cannot_be_deleted(self, client):
        owner = make_user(Role.OWNER)
        staff = make_user(Role.STAFF)
        login(client, owner)
        assert client.delete(f"/api/v1/users/{staff.pk}/").status_code == 405

    def test_owner_cannot_deactivate_self(self, client):
        owner = make_user(Role.OWNER)
        login(client, owner)
        res = client.patch(f"/api/v1/users/{owner.pk}/", {"is_active": False}, format="json")
        assert res.status_code == 400

    def test_owner_can_deactivate_other_user(self, client):
        login(client, make_user(Role.OWNER))
        staff = make_user(Role.STAFF)
        res = client.patch(f"/api/v1/users/{staff.pk}/", {"is_active": False}, format="json")
        assert res.status_code == 200
        staff.refresh_from_db()
        assert not staff.is_active
