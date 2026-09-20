from django.apps import AppConfig


class GoogleCalendarConfig(AppConfig):
    name = "google_calendar"

    def ready(self):
        # 일정이 어디서 바뀌든(API·관리자·공간 삭제로 딸려 지워지는 것까지) 구글에
        # 닿게 하려고 뷰가 아니라 모델 신호에 건다.
        from . import signals  # noqa: F401

        # 재시작 전에 줄 서 있던 일을 집어 들 일꾼을 세운다(`sync.SyncJob`). 서버로 뜰 때만이다 —
        # migrate·테스트 같은 명령에서 스레드를 띄우면 명령이 끝나도 뒤에서 무언가 돌고 있게 된다.
        if _serving():
            from . import sync

            sync.start_worker()


def _serving() -> bool:
    """지금 뜨는 것이 웹 서버인가. `runserver` 는 리로더의 자식 프로세스에서만 센다."""
    import os
    import sys

    argv = " ".join(sys.argv)
    if "gunicorn" in argv or "uvicorn" in argv:
        return True
    return "runserver" in argv and os.environ.get("RUN_MAIN") == "true"
