from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

api_v1 = [
    path("", include("apps.accounts.urls")),
    path("", include("apps.website.urls")),
    path("", include("apps.crm.urls")),
    path("", include("apps.operations.urls")),
    path("", include("apps.accounting.urls")),
    path("", include("apps.analytics.urls")),
]

urlpatterns = [
    # Django's built-in admin is kept for emergency/superuser use only;
    # the business admin lives in the React app under /admin.
    path("django-admin/", admin.site.urls),
    path("api/v1/", include(api_v1)),
]

if settings.DEBUG:
    # The API map lists every admin endpoint, so it is only served in local development.
    urlpatterns += [
        path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
        path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="api-docs"),
    ]
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
