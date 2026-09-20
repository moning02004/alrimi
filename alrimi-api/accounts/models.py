import datetime as dt
import secrets
import string

from django.contrib.auth.models import AbstractUser
from django.db import models

#  임시 비밀번호에 쓰는 글자. 눈으로 옮겨 적는 값이라 헷갈리는 것(0·O·1·l·I)은 뺀다.
TEMPORARY_ALPHABET = "".join(
    c for c in string.ascii_lowercase + string.digits if c not in "0o1li"
)
TEMPORARY_LENGTH = 10


def temporary_password() -> str:
    """
    관리자가 사용자를 추가할 때 만들어 **한 번만 보여주는** 비밀번호.

    예전에는 모두가 아는 `0000` 이었다. 아이디를 아는 사람이 본인보다 먼저 들어가 비밀번호를
    정하면 계정을 가져갈 수 있었다 — 첫 로그인 강제 변경이 오히려 가져간 쪽을 도왔다.

    받은 사람은 첫 로그인에서 바꾸게 되고(`User.must_change_password`), 그 뒤로는 만든
    사람도 모른다. 잊었으면 최고 관리자가 새로 발급한다(`POST /users/{id}/password/reset`).
    """
    return "".join(secrets.choice(TEMPORARY_ALPHABET) for _ in range(TEMPORARY_LENGTH))


# Create your models here.
class User(AbstractUser):
    first_name = None

    name = models.CharField(max_length=255, null=True, blank=True)
    ntfy_topic = models.CharField(max_length=255, null=True, blank=True)
    must_change_password = models.BooleanField(
        default=False,
        help_text=(
            "처음 받은 비밀번호(0000)를 아직 안 바꿨다. 켜져 있으면 내 정보 조회와 비밀번호 "
            "변경 말고는 API 가 전부 403 으로 막힌다(`accounts.authentication`). 화면의 "
            "'사용자 추가' 로 만든 계정만 켜진다 — createsuperuser 나 관리자 사이트로 만든 "
            "계정은 비밀번호를 직접 정했으므로 끈 채로 둔다."
        ),
    )

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
