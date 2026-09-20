from django.conf import settings
from django.db import models


class GoogleCalendarLink(models.Model):
    """
    이 사람의 구글 캘린더 연결. 사람마다 하나다.

    **구글에 만든 전용 캘린더 하나에만 쓴다**(`calendar_id`). 권한도
    `calendar.app.created` 만 받는다 — 이 앱이 만든 캘린더 말고는 읽지도 쓰지도
    못한다. 기본 캘린더에 섞어 넣으면 연결을 끊을 때 무엇이 우리 것인지 가려 지울
    길이 없고, 사람이 구글에서 켜고 끄기로 한꺼번에 가릴 수도 없다.

    `refresh_token` 은 그 자체가 열쇠다. 로그·응답·관리자 화면에 싣지 않는다.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="google_calendar"
    )
    # 어느 구글 계정에 붙었는지. 설정 화면이 "○○@gmail.com 에 연결됨" 을 적는다.
    email = models.CharField(max_length=255, blank=True, default="")
    refresh_token = models.CharField(max_length=512)
    # 한 시간짜리. 일정 하나 고칠 때마다 재발급하지 않도록 들고 있는다.
    access_token = models.CharField(max_length=2048, blank=True, default="")
    access_expires_at = models.DateTimeField(null=True, blank=True)
    # 비어 있으면 아직 못 만든 것이다. 연결 직후의 전체 맞추기(`sync.resync`)가 만든다.
    calendar_id = models.CharField(max_length=255, blank=True, default="")
    broken_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=(
            "구글이 열쇠를 거절한 때. 사람이 구글 계정에서 권한을 거뒀거나 비밀번호를 "
            "바꿨을 때다. 줄을 지우지 않는 것은 설정 화면이 '끊겼어요, 다시 연결하세요' "
            "를 말해야 해서다 — 지우면 연결한 적 없는 것과 구별되지 않는다."
        ),
    )
    # 마지막 실패의 까닭. 사람이 읽는 말이다. 성공하면 비운다.
    last_error = models.CharField(max_length=255, blank=True, default="")
    last_synced_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.user_id} {self.email}"


class SyncJob(models.Model):
    """
    구글에 보낼 일 하나. 줄은 **DB 에 남는다** — 프로세스 안의 큐에만 두면 배포나 재시작 때
    줄 서 있던 일이 통째로 사라졌고, 그러면 설정 화면에서 "다시 맞추기" 를 누를 때까지
    구글 쪽이 어긋난 채로 남았다.

    같은 대상이 여러 번 밀려도 줄은 하나다(`uniq_sync_job`). 한 일정을 연달아 고치면
    보낼 것은 결국 마지막 모습 하나뿐이고, 보낼 때 DB 를 다시 읽으므로 중간 상태를 굳이
    한 번씩 보낼 까닭이 없다. 저장이 잦아도 구글로 나가는 요청은 늘지 않는다.
    """

    class Kind(models.TextChoices):
        EVENT = "event", "일정 하나"
        ZONE = "zone", "공간 이름"
        RESYNC = "resync", "전체 다시 맞추기"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="google_sync_jobs"
    )
    kind = models.CharField(max_length=8, choices=Kind.choices)
    # 무엇을 보낼지. 전체 다시 맞추기는 대상이 없어 0 이다.
    target_pk = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "kind", "target_pk"], name="uniq_sync_job"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} {self.kind} {self.target_pk}"
