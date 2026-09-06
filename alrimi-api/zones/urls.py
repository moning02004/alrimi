from django.urls import path

from .views import PaletteView, ZoneDetailView, ZoneListCreateView

urlpatterns = [
    path("zones", ZoneListCreateView.as_view(), name="zone-list"),
    # 고정 경로가 먼저 와야 <int:zone_id> 에 먹히지 않는다
    path("zones/palette", PaletteView.as_view(), name="zone-palette"),
    path("zones/<int:zone_id>", ZoneDetailView.as_view(), name="zone-detail"),
]
