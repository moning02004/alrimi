"""
웹 푸시 발송.

**첫 번째 길이다.** ntfy(`notices/ntfy.py`)는 여기가 아무 기기에도 닿지 못했을 때만
뒤를 받는다 — 나란히 보내면 두 길을 다 켜둔 사람이 같은 알림을 폰에서 두 번 받는다.
ntfy 앱을 깔지 않은 사람에게는 이쪽이 유일한 길이고, 브라우저 알림을 안 켠 사람에게는
저쪽이 유일한 길이다.

보내는 단위와 문구는 ntfy 와 같다. 한쪽이 막혀 다른 쪽으로 넘어갔을 때 받는 말이
달라지면, 어느 길로 왔느냐에 따라 알림이 다른 것이 된다.

ntfy 와 다른 점 셋:

- **받는 곳이 기기마다다.** 토픽 하나가 아니라 그 사람이 켜둔 기기 수만큼 보낸다.
- **본문을 우리가 암호화한다.** 푸시 서비스(FCM·Mozilla·Apple)는 내용을 못 읽는다.
  그래서 n8n 이 대신 쏘지 못하고 이 서버가 직접 보낸다.
- **구독이 말없이 죽는다.** 브라우저를 다시 깔거나 권한을 끄면 그만이다. 404/410 이
  오면 그 자리에서 지운다 — 죽은 구독을 남겨두면 보낼 때마다 실패가 쌓인다.
"""

import json
import logging

from django.conf import settings
from django.utils import timezone
from pywebpush import WebPushException, webpush

from notices.models import Priority

logger = logging.getLogger(__name__)

#  푸시 서비스가 "이 구독은 없다"고 말하는 코드. 이때만 지운다 — 500 이나 타임아웃은
#  저쪽 사정이라, 그걸로 지우면 멀쩡한 기기가 한 번의 장애로 알림을 잃는다.
GONE_STATUSES = {404, 410}

#  우선순위를 Urgency 헤더로 옮긴다. 이 값이 낮으면 배터리를 아끼는 기기가 깨우기를
#  미룰 수 있고, high 면 곧바로 깨운다. ntfy 우선순위와 뜻이 겹치므로 그대로 잇는다.
URGENCY = {
    Priority.LOW: "low",
    Priority.NORMAL: "normal",
    Priority.URGENT: "high",
}


def configured() -> bool:
    """키가 없으면 웹 푸시는 통째로 꺼진 것으로 본다. 없다고 ntfy 까지 막지는 않는다."""
    return bool(settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY)


def _payload(*, title: str, message: str, priority: int, tag: str) -> str:
    """
    서비스 워커(`public/sw.js`)가 그대로 받아 읽는 모양.

    `tag` 는 같은 알림이 두 번 도착했을 때 겹쳐 쌓지 않고 덮어쓰게 하는 이름이다.
    크론이 한 번 걸러 따라잡느라 같은 묶음을 다시 보내는 일이 있어서 필요하다.
    """
    return json.dumps(
        {
            "title": title,
            "body": message,
            "url": settings.WEB_ORIGIN,
            "tag": tag,
            "priority": priority,
        },
        ensure_ascii=False,
    )


def send_to_user(user, *, title: str, message: str, priority: int, tag: str) -> int:
    """
    이 사람이 켜둔 기기 전부에 보낸다. 돌려주는 값은 실제로 닿은 기기 수다.

    한 기기가 실패해도 나머지는 계속 보낸다 — 폰이 죽은 구독이라고 해서 PC 알림까지
    거를 이유가 없다. **전부 실패해도 예외를 올리지 않고 0 을 돌려준다**: 부르는 쪽은
    이 0 을 보고 ntfy 로 넘어간다. 예외로 터뜨리면 그 판단을 부르는 곳마다 try 로
    다시 해야 하고, 한 군데라도 빠뜨리면 알림이 통째로 사라진다.

    0 이 나오는 까닭은 셋인데 구분하지 않는다 — 기기를 안 켰거나, 켠 것이 다 죽었거나,
    서버에 VAPID 키가 없거나. 어느 쪽이든 이 사람에게 웹 푸시로는 못 닿았다는 뜻이고,
    다음에 할 일(ntfy 로 보낸다)은 같다.
    """
    if not configured():
        return 0

    body = _payload(title=title, message=message, priority=priority, tag=tag)
    delivered = 0
    dead = []

    for subscription in user.push_subscriptions.all():
        try:
            webpush(
                subscription_info=subscription.info,
                data=body,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                # `sub` 는 문제가 생겼을 때 푸시 서비스가 연락할 곳이다. 규격이
                # mailto: 또는 https: 를 요구한다.
                vapid_claims={"sub": f"mailto:{settings.VAPID_CLAIM_EMAIL}"},
                ttl=settings.WEBPUSH_TTL_SECONDS,
                timeout=settings.WEBPUSH_TIMEOUT_SECONDS,
                headers={"Urgency": URGENCY.get(priority, "normal")},
            )
        except WebPushException as exc:
            status = getattr(exc.response, "status_code", None)
            if status in GONE_STATUSES:
                dead.append(subscription.pk)
                continue
            # endpoint 는 그 자체가 열쇠라 로그에 싣지 않는다. 어느 구독인지는 pk 로 짚는다.
            logger.warning("web push failed: sub=%s status=%s", subscription.pk, status)
        except Exception:  # 네트워크·암호화 등. 한 기기 때문에 나머지를 멈추지 않는다
            logger.exception("web push error: sub=%s", subscription.pk)
        else:
            delivered += 1

    if dead:
        # 죽은 구독은 지운다. 브라우저가 다시 켜면 새 endpoint 로 등록된다.
        user.push_subscriptions.filter(pk__in=dead).delete()
        logger.info("web push: dropped %d expired subscription(s)", len(dead))

    if delivered:
        # 시각은 한 번에 찍는다. 기기마다 저장하면 보낼 때마다 쿼리가 기기 수만큼 는다.
        user.push_subscriptions.exclude(pk__in=dead).update(last_sent_at=timezone.now())

    return delivered


def send_alert(alert) -> int:
    """
    예약 하나를 웹 푸시로 보낸다. 상세 화면의 "보내기" 가 ntfy 보다 **먼저** 부르고,
    돌려준 값이 0 일 때만 ntfy 로 넘어간다.

    문구는 ntfy 와 같은 곳에서 만든다(`notices.ntfy.compose`) — 어느 길로 나가든
    받는 말이 같아야 한다.
    """
    from .ntfy import compose

    event = alert.event
    title, message = compose(event)
    return send_to_user(
        event.zone.owner,
        title=title,
        message=message,
        priority=event.priority,
        # 같은 예약은 몇 번을 보내도 알림 하나로 덮인다
        tag=f"alert-{alert.pk}",
    )
