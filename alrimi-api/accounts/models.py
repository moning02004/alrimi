import secrets

from django.contrib.auth.models import AbstractUser
from django.db import models


# Create your models here.
class User(AbstractUser):
    first_name = None

    name = models.CharField(max_length=255, null=True, blank=True)
    ntfy_topic = models.CharField(max_length=255, null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.ntfy_topic:
            self.ntfy_topic = f"alrimi-{secrets.token_hex(8)}"
        super().save(*args, **kwargs)


class PushSubscription(models.Model):
    """
    웹 푸시를 받을 기기 하나. 브라우저가 만들어 준 구독 정보를 그대로 담는다.

    ntfy 토픽이 사람마다 하나인 것과 달리 이쪽은 **기기마다 하나**다. 브라우저가
    기기·프로필별로 따로 발급하고, 같은 사람이 폰과 PC 에서 각각 켜면 둘 다에
    보내야 하기 때문이다.

    `endpoint` 가 곧 주소이자 열쇠다 — 이 값만 있으면 누구든 그 기기로 알림을
    밀어넣을 수 있으므로, 로그나 응답에 그대로 싣지 않는다.

    구독은 우리가 지우지 않아도 죽는다(브라우저 재설치·권한 취소·기기 초기화).
    죽은 구독에 보내면 푸시 서비스가 404/410 을 주고, 그때 지운다
    (`notices.webpush.send_to_user`).
    """

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="push_subscriptions")
    # 푸시 서비스(FCM·Mozilla·Apple)가 주는 주소. 기기를 가리키는 값이라 유일하다 —
    # 같은 기기가 다시 구독하면 대개 새 endpoint 를 받고, 옛것은 죽은 채 남는다.
    endpoint = models.URLField(max_length=500, unique=True)
    # 본문을 암호화할 때 쓰는 기기 공개키와 인증 비밀. 브라우저가 준 값 그대로다.
    p256dh = models.CharField(max_length=255)
    auth = models.CharField(max_length=255)
    # "어느 기기에서 켰는지"를 사람이 알아볼 수 있게. 목록에서 지울 때 필요하다.
    user_agent = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    # 마지막으로 실제 발송이 성공한 때. 오래 조용한 구독을 걸러낼 때 쓴다.
    last_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user"])]

    def __str__(self) -> str:
        return f"{self.user_id} {self.endpoint[:40]}…"

    @property
    def info(self) -> dict:
        """pywebpush 가 받는 모양. 브라우저의 `subscription.toJSON()` 과 같다."""
        return {"endpoint": self.endpoint, "keys": {"p256dh": self.p256dh, "auth": self.auth}}
