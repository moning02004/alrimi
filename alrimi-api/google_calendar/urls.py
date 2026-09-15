from django.urls import path

from .views import (
    GoogleCalendarCallbackView,
    GoogleCalendarConnectView,
    GoogleCalendarSyncView,
    GoogleCalendarView,
)

#  callback 은 구글 콘솔의 "승인된 리디렉션 URI" 에 그대로 적는 주소다. 옮기면 콘솔도 고친다.
urlpatterns = [
    path("google/calendar", GoogleCalendarView.as_view(), name="google-calendar"),
    path("google/calendar/connect", GoogleCalendarConnectView.as_view(), name="google-calendar-connect"),
    path("google/calendar/callback", GoogleCalendarCallbackView.as_view(), name="google-calendar-callback"),
    path("google/calendar/sync", GoogleCalendarSyncView.as_view(), name="google-calendar-sync"),
]
