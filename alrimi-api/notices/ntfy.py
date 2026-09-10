"""
ntfy 발송.

토픽은 **사용자마다 하나**다(`accounts.User.ntfy_topic`). 공간이 여럿이어도 알림은
그 사람의 토픽 하나로 모인다 — 폰에서 구독을 공간 수만큼 늘리지 않으려는 것이다.
어느 공간 일인지는 제목의 `[공간]` 이 말한다.

보내는 단위는 EventAlert 다. 같은 일정이라도 "전날 저녁"과 "당일 아침"은 각각 한 번씩
나가야 하고, 나갔는지도 EventAlert 마다 따로 남는다.

**본문은 JSON 으로 보낸다.** 헤더 방식(`X-Title`)은 값이 ASCII 여야 해서 한글 제목이
깨진다. JSON publishing 은 UTF-8 을 그대로 받는다.
"""

import json
import logging
from base64 import b64encode
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings
from django.utils import formats

logger = logging.getLogger(__name__)


class NtfyError(Exception):
    """보내지 못했다. 메시지는 사람이 읽을 것이므로 그대로 화면에 띄워도 된다."""


def _auth_header() -> dict[str, str]:
    """
    ACL 을 건 서버는 로그인해야 발행할 수 있다. 계정을 안 넣으면 열린 서버로 본다
    (ntfy.sh 기본값이 그렇다).
    """
    if not settings.NTFY_USER:
        return {}
    credentials = f"{settings.NTFY_USER}:{settings.NTFY_PASSWORD}".encode()
    return {"Authorization": "Basic " + b64encode(credentials).decode()}


def publish(topic: str, *, title: str, message: str, priority: int) -> None:
    """한 건 보낸다. 실패하면 NtfyError."""
    if not topic:
        raise NtfyError("구독 토픽이 없습니다.")

    # ensure_ascii=False 로 한글을 그대로 싣는다. \uXXXX 로도 ntfy 는 알아듣지만
    # 서버 로그나 tcpdump 로 들여다볼 때 읽을 수 있는 편이 낫다.
    body = json.dumps(
        {
            "topic": topic,
            "title": title,
            "message": message,
            "priority": priority,
            "actions": [
                {
                    "action": "view",
                    "label": "웹에서 확인",
                    "url": "https://alrimi.jeonghoon.dev"
                }
            ]
        },
        ensure_ascii=False,
    ).encode()
    request = Request(
        settings.NTFY_BASE_URL,
        data=body,
        headers={"Content-Type": "application/json", **_auth_header()},
        method="POST",
    )

    try:
        with urlopen(request, timeout=settings.NTFY_TIMEOUT_SECONDS):
            pass
    except HTTPError as exc:
        # 401/403 은 대개 계정 문제다. 어느 쪽인지 로그에는 남기고 화면에는 줄여서 보낸다.
        logger.warning("ntfy publish failed: %s %s", exc.code, exc.reason)
        raise NtfyError(f"ntfy 가 요청을 거절했어요 ({exc.code}).") from exc
    except (URLError, TimeoutError, OSError) as exc:
        logger.warning("ntfy unreachable: %s", exc)
        raise NtfyError("ntfy 서버에 닿지 못했어요.") from exc


def compose(event) -> tuple[str, str]:
    """
    알림에 실어 보낼 제목과 본문.

    받는 사람은 잠금화면에서 이것만 본다 — 어느 공간 일인지, 언제 일인지가
    한 줄에 다 있어야 앱을 열지 않고도 판단이 된다.
    """
    title = f"[{event.zone.name}] {event.title}"

    lines = [formats.date_format(event.event_date, "n월 j일 (D)")]
    if event.content:
        lines.append(event.content)
    return title, "\n".join(lines)


def send_alert(alert) -> None:
    """
    이 예약을 지금 보낸다. 결과는 EventAlert 에 남는다 — 성공이면 `sent`,
    실패면 `fail`(보낸 적이 없으므로 `sent_at` 은 비운다).
    """
    event = alert.event
    title, message = compose(event)

    try:
        publish(
            event.zone.owner.ntfy_topic,
            title=title,
            message=message,
            priority=event.priority,
        )
    except NtfyError:
        alert.mark_failed()
        raise

    alert.mark_sent()
