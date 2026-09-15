from django.apps import AppConfig


class GoogleCalendarConfig(AppConfig):
    name = "google_calendar"

    def ready(self):
        # 일정이 어디서 바뀌든(API·관리자·공간 삭제로 딸려 지워지는 것까지) 구글에
        # 닿게 하려고 뷰가 아니라 모델 신호에 건다.
        from . import signals  # noqa: F401
