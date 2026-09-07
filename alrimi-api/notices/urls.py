from django.urls import path

from .views import (
    CalendarView,
    NoticeDetailView,
    NoticeListCreateView,
    SendAlertView,
    list_weekly, alert_notices,
)

urlpatterns = [
    # 목록의 축은 날짜다. 공간은 ?zone= 으로 좁히는 선택 필터일 뿐이다.
    path("notices", NoticeListCreateView.as_view(), name="notice-list"),
    path("notices/<int:notice_id>", NoticeDetailView.as_view(), name="notice-detail"),
    # 알림은 일정에 딸린 것이라 경로도 그 아래에 둔다. 발송 단위는 Alert 하나다.
    path(
        "notices/<int:notice_id>/alerts/<int:alert_id>/send",
        SendAlertView.as_view(),
        name="alert-send",
    ),
    path("calendar", CalendarView.as_view(), name="calendar"),

    # 주간 일정 리스트
    path("notices/weekly", list_weekly, name="weekly-notices"),
    # 매시 일정 확인
    path("notices/alerts", alert_notices, name="alert-notices"),
    path("notices/alerts/status", update_alert, name="alert-notices"),
]
