"""
일정을 구글 캘린더에 옮겨 담는다. **한쪽 방향이다** — 알리미가 원본이고 구글은 사본이다.

구글에서 고친 것은 돌아오지 않는다. 다음에 알리미에서 그 일정을 고치거나 "다시
맞추기" 를 누르면 알리미 쪽 내용으로 덮인다. 양쪽을 다 원본으로 두면 둘이 어긋났을
때 어느 쪽이 맞는지 정할 규칙이 필요한데, 알림 예약은 알리미에만 있어서 구글에서
날짜를 옮긴 일정의 알림을 어떻게 할지부터 답이 없다.

**무엇이 담기나**

- 보류하지 않은 일정 전부. 완료한 것·지난 것도 남긴다 — 알리미에서도 기록으로 남는다.
- 보류한 일정은 뺀다. "그 날 없던 일" 이라 날짜 위에 두면 틀린 말이 된다.
- 알림(reminders)은 **끈다.** 알리미가 이미 웹 푸시·ntfy 로 알리는데 구글까지 울리면
  같은 일로 알림을 두 번 받는다.

**구글 쪽 id 는 우리 pk 에서 만든다**(`alrimi{pk}`). 따로 저장해 두지 않아도 되고,
저장이 한 번 실패해서 짝을 잃는 일도 없다.

**요청 안에서 부르지 않는다.** 구글이 느리거나 막혔다고 일정 저장이 늦거나 실패하면
안 된다. 커밋된 뒤 프로세스 안의 일꾼 스레드 하나가 차례로 처리한다. 스레드가 하나인
것은 같은 일정을 연달아 고쳤을 때 앞선 PUT 이 뒤늦게 도착해 새 내용을 덮지 않게 하려는
것이다. 일꾼은 매번 DB 에서 **지금** 모습을 읽어 보내므로 순서만 지키면 된다.

프로세스가 죽으면 줄 서 있던 일은 사라진다. 그때는 설정 화면의 "다시 맞추기" 가
전체를 맞춘다.
"""

import datetime as dt
import logging
import queue
import threading

from django.conf import settings
from django.db import close_old_connections, transaction
from django.utils import timezone

from notices.models import Event

from . import client
from .models import GoogleCalendarLink

logger = logging.getLogger(__name__)

CALENDAR_NAME = "일정 알리미"
CALENDAR_DESCRIPTION = (
    "일정 알리미가 옮겨 담는 캘린더예요. 여기서 고친 내용은 알리미로 돌아가지 않고, "
    "알리미에서 그 일정을 고치면 덮어써져요."
)

#  만료 직전 토큰으로 보내다 401 을 받지 않도록 조금 일찍 새로 받는다
EXPIRY_MARGIN = dt.timedelta(minutes=2)


def google_event_id(event_pk: int) -> str:
    # 구글 일정 id 는 base32hex(0-9, a-v) 글자만 받는다. "alrimi" 는 전부 그 안에 있다.
    return f"alrimi{event_pk}"


def event_body(event: Event) -> dict:
    """
    하루짜리에 시각이 있으면 그 시각부터 한 시간, 나머지는 종일 일정이다.

    여러 날짜리는 시각이 있어도 종일로 둔다. "9시에 떠나는 사흘 여행" 을 9시부터
    사흘 뒤 10시까지로 그리면 달력에서 사흘 내내 그 시간대를 막은 것처럼 보인다.
    """
    if event.event_hour is not None and event.event_date == event.end_date:
        start = timezone.make_aware(
            dt.datetime.combine(event.event_date, dt.time(hour=event.event_hour)),
            timezone.get_default_timezone(),
        )
        end = start + dt.timedelta(hours=1)
        when = {
            "start": {"dateTime": start.isoformat(), "timeZone": settings.TIME_ZONE},
            "end": {"dateTime": end.isoformat(), "timeZone": settings.TIME_ZONE},
        }
    else:
        # 종일 일정의 end 는 **다음 날**이다(구글 규격이 끝을 포함하지 않는다)
        when = {
            "start": {"date": event.event_date.isoformat()},
            "end": {"date": (event.end_date + dt.timedelta(days=1)).isoformat()},
        }

    return {
        "id": google_event_id(event.pk),
        # 캘린더 하나에 모든 공간이 섞이므로 알림 제목과 같이 [공간] 을 붙인다
        "summary": f"[{event.zone.name}] {event.title}",
        "description": event.content,
        **when,
        # 구글에서 지워진 일정을 PUT 으로 되살릴 때 필요하다
        "status": "confirmed",
        "reminders": {"useDefault": False, "overrides": []},
        "source": {"title": CALENDAR_NAME, "url": f"{settings.WEB_ORIGIN}/events/{event.pk}"},
    }


# ── 부르는 쪽(신호)이 쓰는 자리 ────────────────────────────────────────


def linked(user_id: int) -> bool:
    """이 사람 것을 보낼 데가 있나. 없으면 일꾼을 깨우지도 않는다."""
    if not client.configured():
        return False
    return GoogleCalendarLink.objects.filter(user_id=user_id, broken_at__isnull=True).exists()


def schedule(fn, user_id: int, *args) -> None:
    """커밋된 뒤에 일꾼에게 넘긴다. 저장이 되돌려지면 아무것도 나가지 않는다."""
    transaction.on_commit(lambda: _enqueue(fn, user_id, *args))


# ── 일꾼 ──────────────────────────────────────────────────────────────

_jobs: "queue.Queue[tuple]" = queue.Queue()
_worker: threading.Thread | None = None
_worker_lock = threading.Lock()


def _enqueue(fn, user_id: int, *args) -> None:
    # 테스트는 스레드 없이 그 자리에서 돌린다. 끝났는지 기다릴 방법을 따로 만들지 않으려는 것이다.
    if settings.GOOGLE_CALENDAR_SYNC_INLINE:
        _run(fn, user_id, *args)
        return

    global _worker
    with _worker_lock:
        if _worker is None or not _worker.is_alive():
            _worker = threading.Thread(target=_work, name="google-calendar", daemon=True)
            _worker.start()
    _jobs.put((fn, user_id, args))


def _work() -> None:
    while True:
        fn, user_id, args = _jobs.get()
        # 오래 사는 스레드라 DB 연결이 끊겨 있을 수 있다(CONN_MAX_AGE·재시작)
        close_old_connections()
        try:
            _run(fn, user_id, *args)
        finally:
            close_old_connections()


def _run(fn, user_id: int, *args) -> None:
    """실패는 여기서 삼킨다. 일꾼이 죽으면 그 뒤로 줄 선 일이 전부 멈춘다."""
    try:
        fn(user_id, *args)
    except client.TokenRevoked:
        pass  # `_token` 이 이미 끊김으로 적었다
    except client.GoogleError as exc:
        logger.warning("google calendar sync failed: user=%s status=%s", user_id, exc.status)
        message = (
            "구글에 닿지 못했어요."
            if exc.status == 0
            else f"구글이 요청을 거절했어요 ({exc.status})."
        )
        GoogleCalendarLink.objects.filter(user_id=user_id).update(last_error=message)
    except Exception:
        logger.exception("google calendar sync error: user=%s", user_id)


# ── 일 ────────────────────────────────────────────────────────────────


def _link(user_id: int) -> GoogleCalendarLink | None:
    return GoogleCalendarLink.objects.filter(user_id=user_id, broken_at__isnull=True).first()


def _token(link: GoogleCalendarLink) -> str:
    if (
        link.access_token
        and link.access_expires_at
        and link.access_expires_at > timezone.now() + EXPIRY_MARGIN
    ):
        return link.access_token

    try:
        tokens = client.refresh(link.refresh_token)
    except client.TokenRevoked:
        link.broken_at = timezone.now()
        link.access_token = ""
        link.last_error = "구글에서 연결이 끊겼어요. 다시 연결해 주세요."
        link.save(update_fields=["broken_at", "access_token", "last_error"])
        raise

    link.access_token = tokens["access_token"]
    link.access_expires_at = timezone.now() + dt.timedelta(seconds=int(tokens.get("expires_in", 3600)))
    link.save(update_fields=["access_token", "access_expires_at"])
    return link.access_token


def _calendar(link: GoogleCalendarLink, token: str) -> str:
    """전용 캘린더. 아직 없거나 사람이 구글에서 지웠으면 새로 만든다."""
    if link.calendar_id and client.calendar_exists(token, link.calendar_id):
        return link.calendar_id

    created = client.create_calendar(token, summary=CALENDAR_NAME, description=CALENDAR_DESCRIPTION)
    link.calendar_id = created["id"]
    link.save(update_fields=["calendar_id"])
    return link.calendar_id


def _put(token: str, calendar_id: str, event: Event) -> None:
    body = event_body(event)
    try:
        client.update_event(token, calendar_id, body["id"], body)
    except client.GoogleError as exc:
        if exc.status != 404:
            raise
        # 처음 보내는 일정이다
        client.insert_event(token, calendar_id, body)


def _done(link: GoogleCalendarLink) -> None:
    GoogleCalendarLink.objects.filter(pk=link.pk).update(last_synced_at=timezone.now(), last_error="")


def push_event(user_id: int, event_pk: int) -> None:
    """
    일정 하나를 지금 모습대로 맞춘다. 지워졌거나 보류했으면 구글에서도 지운다.

    등록·수정·보류·삭제가 모두 이것 하나로 온다 — 무엇이 바뀌었는지 신호에서 가려
    나누지 않고, 일꾼이 도는 시점의 DB 를 보고 정한다.
    """
    link = _link(user_id)
    # 캘린더가 아직 없으면 연결 직후의 전체 맞추기가 돌고 있는 중이다. 그쪽이 담는다.
    if link is None or not link.calendar_id:
        return

    token = _token(link)
    event = Event.objects.select_related("zone").filter(pk=event_pk, zone__owner_id=user_id).first()

    if event is None or event.held_at is not None:
        client.delete_event(token, link.calendar_id, google_event_id(event_pk))
    else:
        try:
            _put(token, link.calendar_id, event)
        except client.GoogleError as exc:
            if exc.status != 404:
                raise
            # insert 까지 404 면 캘린더가 없다(사람이 구글에서 지웠다). 새로 만들어 통째로 담는다.
            resync(user_id)
            return
    _done(link)


def push_zone(user_id: int, zone_pk: int) -> None:
    """공간 이름이 바뀌면 제목의 [공간] 이 전부 바뀐다."""
    link = _link(user_id)
    if link is None or not link.calendar_id:
        return

    token = _token(link)
    for event in Event.objects.select_related("zone").filter(zone_id=zone_pk, held_at__isnull=True):
        _put(token, link.calendar_id, event)
    _done(link)


def resync(user_id: int) -> None:
    """
    전체를 맞춘다. 연결 직후와 설정 화면의 "다시 맞추기" 가 부른다.

    담겨야 할 것은 전부 다시 보내고, 캘린더에 있는데 담길 것이 아닌 것은 지운다.
    전용 캘린더라 거기 있는 일정은 전부 우리가 넣은 것이다.
    """
    link = _link(user_id)
    if link is None:
        return

    token = _token(link)
    calendar_id = _calendar(link, token)

    events = {
        google_event_id(event.pk): event
        for event in Event.objects.select_related("zone").filter(
            zone__owner_id=user_id, held_at__isnull=True
        )
    }
    for stale in client.list_event_ids(token, calendar_id) - events.keys():
        client.delete_event(token, calendar_id, stale)
    for event in events.values():
        _put(token, calendar_id, event)
    _done(link)


def disconnect(link: GoogleCalendarLink) -> None:
    """
    연결을 끊는다. 구글에 만든 캘린더도 지운다 — 거기 든 것은 전부 사본이고,
    남겨두면 다시 연결했을 때 같은 이름의 캘린더가 둘이 된다.

    구글 쪽 정리는 되는 데까지만 한다. 이미 권한을 거뒀으면 지울 수 없고, 그렇다고
    우리 쪽 연결을 못 끊게 막으면 사람이 할 수 있는 일이 없다.
    """
    if link.broken_at is None and link.calendar_id:
        try:
            client.delete_calendar(_token(link), link.calendar_id)
        except client.GoogleError as exc:
            logger.warning("google calendar delete failed: user=%s status=%s", link.user_id, exc.status)
    try:
        client.revoke(link.refresh_token)
    except client.GoogleError:
        pass
    link.delete()
