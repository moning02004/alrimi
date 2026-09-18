"""
사람이 방금 한 일을 **다른 사람에게** 알린다. 예약된 알림(`due_alerts`)과 다른 길이다 —
그쪽은 시각이 되어 나가는 것이고, 이쪽은 함께 보는 사람이 방금 생긴 일정을 알아야 하는 것이다.
"""

import logging
import threading

from django.conf import settings
from django.db import close_old_connections

from zones.models import recipients

from .models import Priority
from .ntfy import NtfyError, publish
from .webpush import send_to_user

logger = logging.getLogger(__name__)


def compose_new_event(event, actor) -> tuple[str, str]:
    """
    ```
    [어린이집] 새 일정
    아빠님이 어린이집에 일정을 추가했어요
    가을 소풍
    ```

    제목이 어느 공간인지 말하고, 본문 첫 줄이 누가 넣었는지, 둘째 줄이 무엇인지 말한다.
    일정 제목을 문장 안에 넣지 않는 것은 조사 때문이다 — "소풍을" 과 "체육복을" 은 다르고,
    받침으로 가르면 "(를)" 같은 자국이 남는다. 줄을 나누면 그 문제가 없다.
    """
    who = actor.name or actor.username
    return (
        f"[{event.zone.name}] 새 일정",
        f"{who}님이 {event.zone.name}에 일정을 추가했어요\n{event.title}",
    )


def new_event(event, actor) -> None:
    """
    함께 보는 사람들에게 새 일정을 알린다. **만든 사람 본인과 알림을 꺼둔 사람은 뺀다**
    (`zones.models.recipients`).

    보낼 데가 없으면 아무 일도 하지 않는다 — 혼자 쓰는 공간이 대부분이라 여기서 거의 끝난다.
    보낼 데가 있으면 저장을 기다리게 하지 않으려고 뒤에서 보낸다(`_send_later`).
    """
    zone = event.zone
    if not zone.shared:
        return
    people = recipients(zone, exclude=actor)
    if not people:
        return

    title, message = compose_new_event(event, actor)
    _send_later(people, title, message, f"new-event-{event.pk}", f"/events/{event.pk}")


def _send_later(people, title: str, message: str, tag: str, path: str) -> None:
    """
    보내는 동안 저장 응답을 붙잡아두지 않는다. 웹 푸시는 기기마다, ntfy 는 한 번씩 네트워크를
    타므로 사람이 여럿이면 몇 초가 된다 — 일정은 이미 저장됐고 알림은 늦어도 된다.

    테스트는 스레드 없이 그 자리에서 돌린다(`EVENT_NOTICE_INLINE`). 끝났는지 기다릴 방법을
    따로 만들지 않으려는 것이다(google_calendar 의 동기화도 같은 방식이다).
    """
    if settings.EVENT_NOTICE_INLINE:
        _send(people, title, message, tag, path)
        return
    threading.Thread(
        target=_send, args=(people, title, message, tag, path), name="event-notice", daemon=True
    ).start()


def _send(people, title: str, message: str, tag: str, path: str) -> None:
    """
    사람마다 웹 푸시 → 못 닿으면 ntfy. 예약 알림과 같은 순서다(둘 다 보내면 두 번 온다).

    **어디까지 갔는지 남긴다.** 이 길은 화면이 없어서, 안 왔을 때 웹 푸시가 0 이었는지 ntfy 가
    거절했는지를 로그 말고는 알 방법이 없다(`manage.py notice_check` 가 같은 길을 밟아본다).

    다른 스레드에서 도는 동안 DB 연결이 끊겨 있을 수 있다(CONN_MAX_AGE·재시작). 앞뒤로 정리한다.
    """
    close_old_connections()
    try:
        for person in people:
            try:
                reached = send_to_user(
                    person, title=title, message=message, priority=Priority.NORMAL, tag=tag, path=path
                )
                if reached:
                    logger.info("new event notice: user=%s webpush=%d", person.pk, reached)
                    continue
                publish(person.ntfy_topic, title=title, message=message, priority=Priority.NORMAL)
                logger.info("new event notice: user=%s ntfy=ok", person.pk)
            except NtfyError as exc:
                # 알림 하나 못 간 것으로 일정 저장을 되돌리지 않는다. 까닭만 남긴다.
                logger.warning("new event notice failed: user=%s %s", person.pk, exc)
            except Exception:
                logger.exception("new event notice error: user=%s", person.pk)
    finally:
        close_old_connections()
