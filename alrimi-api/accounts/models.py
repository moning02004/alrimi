import datetime as dt
import secrets

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


# Create your models here.
class User(AbstractUser):
    first_name = None

    name = models.CharField(max_length=255, null=True, blank=True)
    ntfy_topic = models.CharField(max_length=255, null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.ntfy_topic:
            self.ntfy_topic = f"alrimi-{secrets.token_hex(8)}"
        super().save(*args, **kwargs)


def invite_token() -> str:
    """
    초대 링크의 열쇠. 24바이트(192비트)라 찍어서 맞히는 길은 없다.

    사람이 옮겨 적는 값이 아니라 링크에 실려 가는 값이므로, 읽기 좋은 글자를 고르는 대신
    길게 간다 — 이것이 짧은 임시 비밀번호와 갈리는 지점이다.
    """
    return secrets.token_urlsafe(24)


class Invite(models.Model):
    """
    새로 만든 계정에 처음 들어가는 길. **사람마다 많아야 하나**다.

    예전에는 관리자가 임시 비밀번호를 만들어 불러주고, 받은 사람이 그것을 옮겨 적은 뒤 첫
    로그인에서 다시 바꿨다. 열 자를 옮겨 적는 것도, 들어오자마자 또 바꾸는 것도 번거로웠다.
    지금은 관리자가 링크 하나를 보내고, 받은 사람은 그것을 눌러 **자기 비밀번호를 정하면서**
    곧장 로그인한다. 옮겨 적을 값이 없고, 서버가 아는 비밀번호도 없다.

    **다 쓰면 줄이 사라진다.** 지워지는 것이 곧 "썼다" 는 표시라 따로 `used_at` 을 두지
    않고, 표가 쌓이지도 않는다. 새로 만들면 앞의 것을 덮으므로 링크는 늘 마지막 것 하나만
    살아 있다.

    만료된 줄은 다음 초대가 덮거나 하루 한 번 청소가 지운다(`alrimi_api.housekeeping`).
    """

    #  사흘. 카톡으로 보내놓고 저녁에 여는 정도는 넉넉히 살아 있어야 하고, 대화방에 남은
    #  링크가 몇 달 뒤까지 계정을 여는 열쇠로 남아 있어서는 안 된다.
    TTL = dt.timedelta(days=3)

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="invite")
    token = models.CharField(max_length=64, unique=True, default=invite_token)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        indexes = [models.Index(fields=["expires_at"])]

    def __str__(self) -> str:
        return f"{self.user_id} ~{self.expires_at:%Y-%m-%d}"

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + self.TTL
        super().save(*args, **kwargs)

    @property
    def alive(self) -> bool:
        return self.expires_at > timezone.now()


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


class LoginThrottle(models.Model):
    """
    로그인을 잇달아 틀린 자리. 아이디 하나와 IP 하나마다 한 줄이다.

    **실패했을 때만 쓴다.** 성공한 로그인은 읽기 한 번으로 끝나고(잠겼는지 보는 조회),
    줄이 있을 때만 지운다 — 평소에 쓰기가 늘지 않아야 로그인이 느려지지 않는다.

    캐시가 아니라 표에 둔 까닭: 운영은 워커가 여럿이고 캐시는 프로세스마다 따로라, 캐시로
    세면 다섯 번이 열다섯 번이 된다. 표는 워커가 몇이든 같은 곳을 본다.

    아이디와 IP 를 함께 세는 까닭: 아이디만 세면 아이디를 바꿔가며 같은 비밀번호를 던지는
    쪽을 못 막고, IP 만 세면 같은 공유기 뒤의 가족이 서로를 막는다.
    """

    #  다섯 번 틀리면 잠근다. 손으로 치다 틀리는 횟수로는 넉넉하고, 자동으로 던지는 쪽에는
    #  충분히 성가시다.
    MAX_FAILURES = 5
    #  이 시간 안의 실패만 센다. 어제 두 번 틀린 것이 오늘까지 따라오지 않게.
    WINDOW = dt.timedelta(minutes=10)
    #  잠기는 시간. 사람이 기다릴 만하면서, 자동 시도에는 초당 수천 번이 분당 다섯 번이 된다.
    LOCK = dt.timedelta(minutes=5)

    key = models.CharField(max_length=190, unique=True, help_text='"user:hoon" · "ip:1.2.3.4"')
    failures = models.PositiveSmallIntegerField(default=0)
    first_failed_at = models.DateTimeField()
    locked_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["locked_until"])]

    def __str__(self) -> str:
        return f"{self.key} {self.failures}회"
