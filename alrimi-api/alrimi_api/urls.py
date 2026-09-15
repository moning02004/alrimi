from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health(_request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health", health, name="health"),
    path("", include("accounts.urls")),
    path("", include("zones.urls")),
    path("", include("notices.urls")),
    path("", include("special_days.urls")),
    path("", include("google_calendar.urls")),
]
