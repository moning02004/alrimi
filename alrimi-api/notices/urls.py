from django.urls import path

from .views import (
    CalendarView,
    EventDetailView,
    EventListCreateView,
    SendEventAlertView,
    list_due_alerts,
    push_due_alerts,
    list_weekly,
    update_alert,
)

#  경로가 `/events` 다. 예전 이름은 `/notices` 였는데, 그때는 하루짜리 알림 하나가
#  단위여서 "알려야 할 것" 이라는 뜻이 맞았다. 지금은 며칠에 걸치는 일정이 한 건으로
#  담기므로 경로도 그것이 **사건 하나** 임을 말해야 한다.
#
#  옛 경로는 남기지 않는다. 부르는 곳이 이 저장소의 웹과 n8n 크론뿐이라 둘을 같이
#  옮기면 끝나고, 두 벌을 열어두면 어느 쪽이 진짜인지 다음 사람이 알 수 없다.
urlpatterns = [
    # 목록의 축은 날짜다. 공간은 ?zone= 으로 좁히는 선택 필터일 뿐이다.
    path("events", EventListCreateView.as_view(), name="event-list"),

    # 크론이 부르는 두 자리. `<int:event_id>` 보다 먼저 와야 "weekly"·"alerts" 가
    # 일정 id 로 읽히지 않는다.
    path("events/weekly", list_weekly, name="weekly-events"),
    path("events/alerts", list_due_alerts, name="due-alerts"),
    path("events/alerts/status", update_alert, name="due-alerts-status"),
    # 웹 푸시는 본문을 서버가 암호화해야 해서 크론이 대신 쏘지 못한다. 받아간
    # ids 를 되돌려주면 이 서버가 그 묶음을 그대로 웹 푸시로 보낸다.
    path("events/alerts/push", push_due_alerts, name="due-alerts-push"),

    path("events/<int:event_id>", EventDetailView.as_view(), name="event-detail"),
    # 알림은 일정에 딸린 것이라 경로도 그 아래에 둔다. 발송 단위는 EventAlert 하나다.
    path(
        "events/<int:event_id>/alerts/<int:event_alert_id>/send",
        SendEventAlertView.as_view(),
        name="alert-send",
    ),

    path("calendar", CalendarView.as_view(), name="calendar"),
]
