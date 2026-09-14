from django.urls import path

from .views import (
    MarkStyleDetailView,
    MarkStyleListView,
    PaletteView,
    SpecialDayListView,
    sync_special_days,
)

#  특일은 일정이 아니라 따로 선 자료다(`models.py`). 그래서 경로도 `/events` 아래가
#  아니라 나란히 둔다 — 아래에 두면 일정의 한 종류로 읽힌다.
#
#  고정된 이름들이 `<str:kind>` 보다 먼저 와야 "palette"·"styles"·"sync" 가
#  종류 이름으로 읽히지 않는다.
urlpatterns = [
    path("special-days/sync", sync_special_days, name="special-day-sync"),
    path("special-days/palette", PaletteView.as_view(), name="special-day-palette"),
    path("special-days/styles", MarkStyleListView.as_view(), name="mark-style-list"),
    path(
        "special-days/styles/<str:kind>",
        MarkStyleDetailView.as_view(),
        name="mark-style-detail",
    ),
    path("special-days", SpecialDayListView.as_view(), name="special-day-list"),
]
