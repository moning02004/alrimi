"""
로그인을 잇달아 틀렸을 때 잠그는 자리.

**성공하는 길에 쓰기를 더하지 않는다.** 로그인 한 번에 조회 한 번(잠겼나)이고, 실패했을
때만 줄을 쓴다. 로그인은 하루에 몇 번뿐이라 이 정도면 표가 느려질 일이 없다.
"""

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import Throttled

from .models import LoginThrottle


def keys_for(request, username: str) -> list[str]:
    """아이디와 IP 를 함께 센다 — 한쪽만 세면 다른 쪽으로 돌아갈 수 있다."""
    keys = [f"user:{username.strip().lower()[:150]}"]
    ip = client_ip(request)
    if ip:
        keys.append(f"ip:{ip}")
    return keys


def client_ip(request) -> str | None:
    """
    프록시 뒤에서는 `X-Forwarded-For` 의 **맨 앞**이 사람이다. 뒤쪽은 거쳐온 프록시들이고,
    앞쪽은 보낸 쪽이 지어낼 수 있으므로 잠그는 기준으로만 쓴다(권한을 주는 데는 안 쓴다).
    """
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45] or None
    return request.META.get("REMOTE_ADDR")


def check(keys: list[str]) -> None:
    """잠겨 있으면 여기서 끊는다. 잠긴 줄이 없으면 조회 한 번으로 끝난다."""
    now = timezone.now()
    locked = (
        LoginThrottle.objects.filter(key__in=keys, locked_until__gt=now)
        .order_by("-locked_until")
        .first()
    )
    if locked is None:
        return
    seconds = int((locked.locked_until - now).total_seconds()) + 1
    # DRF 가 detail 을 그대로 본문에 싣는다. 웹은 `firstError` 로 이 말을 그대로 보여준다.
    raise Throttled(
        wait=seconds, detail=f"로그인을 여러 번 실패했어요. {seconds // 60 + 1}분 뒤에 다시 해주세요."
    )


def record_failure(keys: list[str]) -> None:
    """
    실패를 센다. 창(`WINDOW`)이 지났으면 처음부터 다시 센다 — 어제 두 번 틀린 것이 오늘까지
    따라오면, 가끔 틀리는 사람이 어느 날 갑자기 잠긴다.
    """
    now = timezone.now()
    for key in keys:
        with transaction.atomic():
            row, created = LoginThrottle.objects.select_for_update().get_or_create(
                key=key, defaults={"failures": 1, "first_failed_at": now}
            )
            if created:
                continue

            if now - row.first_failed_at > LoginThrottle.WINDOW:
                row.failures = 1
                row.first_failed_at = now
                row.locked_until = None
            else:
                row.failures = F("failures") + 1
            row.save(update_fields=["failures", "first_failed_at", "locked_until"])

            row.refresh_from_db(fields=["failures"])
            if row.failures >= LoginThrottle.MAX_FAILURES:
                row.locked_until = now + LoginThrottle.LOCK
                row.save(update_fields=["locked_until"])


def clear(keys: list[str]) -> None:
    """들어왔으면 센 것을 지운다. 남길 이유가 없고, 표도 알아서 비어 간다."""
    LoginThrottle.objects.filter(key__in=keys).delete()
