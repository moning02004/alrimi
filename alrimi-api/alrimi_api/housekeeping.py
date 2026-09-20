"""
쌓이기만 하는 것을 하루에 한 번 치운다.

**크론이 없다.** 알림은 n8n 이 불러 가지만 그건 알림 얘기고, 표를 비우는 일까지 밖에 맡기면
잊히거나 배포 자리마다 달라진다. 그래서 이미 떠 있는 일꾼 스레드
(`google_calendar.sync`)가 지나가는 길에 한 번씩 들른다 — 새로 띄울 것이 없다.

하루에 한 번, 워커마다 한 번이다. 워커가 셋이면 하루에 세 번 도는데, 지우는 쿼리 두 개라
그 정도는 세 번이어도 표에 티가 나지 않는다.
"""

import logging
import threading

from django.utils import timezone

logger = logging.getLogger(__name__)

EVERY = timezone.timedelta(days=1)

_last_run: float | None = None
_lock = threading.Lock()


def run_if_due(now=None) -> bool:
    """치울 때가 됐으면 치운다. 실제로 돌았으면 True."""
    global _last_run
    now = now or timezone.now()

    with _lock:
        if _last_run is not None and now.timestamp() - _last_run < EVERY.total_seconds():
            return False
        _last_run = now.timestamp()

    sweep(now)
    return True


def sweep(now=None) -> None:
    """
    지난 것들을 지운다. 실패해도 삼킨다 — 청소가 안 됐다고 일꾼이 멈추면 정작 보낼 일이 멈춘다.

    - **폐기된 refresh 토큰**: 회전할 때마다 한 줄씩 쌓인다(`ROTATE_REFRESH_TOKENS`). 수명이
      지난 것은 이미 아무 힘이 없으므로 남길 까닭이 없다. `manage.py flushexpiredtokens` 와
      같은 일이다.
    - **로그인 실패 기록**: 창(10분)이 한참 지난 줄은 세는 데 쓰이지 않는다.
    - **만료된 초대**: 사흘이 지난 링크는 열리지 않는다. 대개는 쓰이면서 사라지지만,
      보내놓고 아무도 누르지 않은 것이 남는다.
    """
    from accounts.models import Invite, LoginThrottle
    from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

    now = now or timezone.now()
    try:
        tokens, _ = OutstandingToken.objects.filter(expires_at__lt=now).delete()
        # 창의 몇 배가 지난 줄만 지운다 — 잠금이 아직 살아 있는 줄을 건드리지 않으려는 것이다
        throttles, _ = LoginThrottle.objects.filter(
            first_failed_at__lt=now - LoginThrottle.WINDOW * 6
        ).delete()
        invites, _ = Invite.objects.filter(expires_at__lt=now).delete()
        if tokens or throttles or invites:
            logger.info(
                "housekeeping: tokens=%d throttles=%d invites=%d", tokens, throttles, invites
            )
    except Exception:  # noqa: BLE001 — 청소가 실패해도 보낼 일은 계속 가야 한다
        logger.exception("housekeeping failed")
