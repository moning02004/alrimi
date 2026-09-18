from django.urls import path

from .views import (
    PaletteView,
    ZoneMuteView,
    ReceivedSharingDetailView,
    ReceivedSharingListView,
    SharingDetailView,
    SharingListView,
    ZoneDetailView,
    ZoneListCreateView,
)

urlpatterns = [
    path("zones", ZoneListCreateView.as_view(), name="zone-list"),
    # 고정 경로가 먼저 와야 <int:zone_id> 에 먹히지 않는다
    path("zones/palette", PaletteView.as_view(), name="zone-palette"),
    path("zones/<int:zone_id>", ZoneDetailView.as_view(), name="zone-detail"),
    # 이 공간의 알림 받기/끄기. 받는 사람마다 따로다
    path("zones/<int:zone_id>/mute", ZoneMuteView.as_view(), name="zone-mute"),
    # 함께 보는 사람. 사람마다 한 번 정하고, 공간은 `shared` 로 켜고 끈다(`zones.models.Sharing`)
    path("sharing", SharingListView.as_view(), name="sharing"),
    path("sharing/received", ReceivedSharingListView.as_view(), name="sharing-received"),
    path("sharing/received/<int:owner_id>", ReceivedSharingDetailView.as_view(), name="sharing-received-detail"),
    path("sharing/<int:user_id>", SharingDetailView.as_view(), name="sharing-detail"),
]
