from django.conf import settings
from django.contrib.auth.models import update_last_login
from rest_framework import generics, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.permissions import IsOwner

from .models import Role, User
from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    MeSerializer,
    UserMiniSerializer,
    UserSerializer,
)


def _set_refresh_cookie(response, refresh_token):
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        str(refresh_token),
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
        path=settings.REFRESH_COOKIE_PATH,
    )


def _clear_refresh_cookie(response):
    response.delete_cookie(settings.REFRESH_COOKIE_NAME, path=settings.REFRESH_COOKIE_PATH)


class LoginView(APIView):
    """Returns a short-lived access token; the refresh token is set as an httpOnly cookie."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        refresh = RefreshToken.for_user(user)
        update_last_login(None, user)

        response = Response({"access": str(refresh.access_token), "user": MeSerializer(user).data})
        _set_refresh_cookie(response, refresh)
        return response


class RefreshView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if not raw:
            return Response({"detail": "Not logged in."}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            old = RefreshToken(raw)
            user = User.objects.get(pk=old["user_id"], is_active=True)
            old.blacklist()
        except (TokenError, User.DoesNotExist, KeyError):
            response = Response({"detail": "Session expired."}, status=status.HTTP_401_UNAUTHORIZED)
            _clear_refresh_cookie(response)
            return response

        refresh = RefreshToken.for_user(user)
        response = Response({"access": str(refresh.access_token), "user": MeSerializer(user).data})
        _set_refresh_cookie(response, refresh)
        return response


class LogoutView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if raw:
            try:
                RefreshToken(raw).blacklist()
            except TokenError:
                pass
        response = Response(status=status.HTTP_204_NO_CONTENT)
        _clear_refresh_cookie(response)
        return response


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = MeSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserViewSet(viewsets.ModelViewSet):
    """Staff account management — Owner only. Users are deactivated, never deleted."""

    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsOwner]
    filterset_fields = ["role", "is_active"]
    search_fields = ["full_name", "email", "phone"]
    ordering_fields = ["full_name", "date_joined", "role"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def perform_update(self, serializer):
        user = serializer.instance
        # Stop the owner from locking themselves out.
        if user == self.request.user and (
            serializer.validated_data.get("is_active") is False
            or serializer.validated_data.get("role", user.role) != user.role
        ):
            raise ValidationError("You cannot deactivate yourself or change your own role.")
        serializer.save()


class TeamView(generics.ListAPIView):
    """Active people who can own leads or coordinate events — for assignment dropdowns."""

    permission_classes = [IsAuthenticated]
    pagination_class = None
    serializer_class = UserMiniSerializer

    def get_queryset(self):
        return User.objects.filter(is_active=True, role__in=[Role.OWNER, Role.MANAGER, Role.STAFF]).order_by("full_name")
