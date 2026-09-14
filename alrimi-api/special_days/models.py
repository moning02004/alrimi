from django.conf import settings
from django.db import models

from .palette import COLORS


class Kind(models.TextChoices):
    """
    달력에 찍히는 표시의 갈래. 공공데이터포털 **특일 정보 API** 의 엔드포인트와
    같은 갈래라, n8n 은 받아온 곳에 맞는 `kind` 로 넘기기만 하면 된다.

        holiday   공휴일   getRestDeInfo        쉬는 날
        term      절기     get24DivisionsInfo   입춘·추분 …

    쉬지 않는 기념일(식목일·스승의날)은 담지 않는다. 한 해에 수십 개인데 쉬는 날도
    아니라 달력이 이름으로 덮이기만 하고, 대부분은 찾지 않는다.

    값은 영문이고 이름은 한글이다. 화면에 적히는 것은 `label` 이지만, 그 값이 곧
    DB 와 URL 에 들어가면 나중에 이름 한 글자만 다듬어도 저장된 자료가 어긋난다.
    """

    HOLIDAY = "holiday", "공휴일"
    TERM = "term", "절기"


#  종류 사이의 서열. 한 날에 둘이 겹칠 때(추분이 공휴일과 겹치는 해가 있다) 날짜
#  숫자를 무슨 색으로 칠할지, 좁은 칸에 어느 이름을 적을지가 이 순서로 정해진다.
#  공휴일이 앞인 것은 그것만이 "쉬는 날" 이라는, 하루의 쓰임을 바꾸는 정보라서다.
KIND_ORDER = [Kind.HOLIDAY, Kind.TERM]


class SpecialDay(models.Model):
    """
    달력에 찍히는 표시 하루. **운영이 넣는 자료이고 사용자는 고치지 못한다.**

    그래서 `Event` 가 아니라 따로 둔다. 일정은 공간(zone)에 매달려 주인이 있고,
    알림·완료·우선순위·보류를 갖는다. 특일은 그 어느 것도 아니다 — 주인이 없고
    (모든 사용자가 같은 날을 본다), 알릴 것도 끝내거나 미룰 것도 없다.

    **연휴도 날마다 한 줄이다.** 설 연휴 사흘은 세 줄로 들어온다 — 특일 정보 API 가
    날짜 하나씩 주고, 달력도 날 단위로 칠하기 때문이다.

    색은 여기 없다. 무슨 색으로 보일지는 보는 사람이 정하고(`MarkStyle`), 이 줄은
    "그 날이 무슨 날인가" 만 말한다. 색을 자료에 박아두면 한 사람이 빨강을 바꾸려고
    모두의 달력을 고치게 된다.
    """

    date = models.DateField(help_text="이 표시가 찍히는 날")
    kind = models.CharField(max_length=16, choices=Kind.choices, help_text="공휴일·절기")
    name = models.CharField(max_length=40, help_text='달력에 적히는 이름. "설날" · "추분"')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["date", "kind"]
        constraints = [
            #  열쇠는 날짜가 아니라 **날짜 + 종류** 다. 한 날이 공휴일이면서
            #  절기일 수 있다(추분이 추석과 겹치는 해가 있다). 날짜만 유일하게
            #  잡으면 둘 중 나중에 동기화한 쪽이 앞의 것을 덮어쓴다.
            models.UniqueConstraint(fields=["date", "kind"], name="uniq_special_day_per_kind"),
        ]
        indexes = [models.Index(fields=["date"])]

    def __str__(self) -> str:
        return f"{self.date} [{self.get_kind_display()}] {self.name}"


#  아무것도 안 고른 사람이 보는 색. 공휴일은 빨강, 절기는 파랑 — 종이 달력의
#  관습이라 처음 여는 사람이 따로 배울 것이 없다.
DEFAULT_COLOR = {
    Kind.HOLIDAY: "#DC2626",
    Kind.TERM: "#2563EB",
}


class MarkStyle(models.Model):
    """
    **한 사람이** 한 종류를 무슨 색으로 볼지.

    사람마다 다르다 — 빨강이 잘 안 갈리는 눈이 있다. 그래서 `SpecialDay` 에 색을
    박지 않고 이쪽에 둔다.

    **줄이 없으면 `DEFAULT_COLOR` 다.** 가입할 때 줄을 미리 만들어두지 않는 것은,
    그러면 나중에 종류를 하나 더하는 순간 기존 사용자 전원에게 그 줄을 만들어 넣는
    마이그레이션이 필요해지기 때문이다. 없는 것을 기본값으로 읽으면 종류를 더해도
    아무 일도 일어나지 않는다.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="mark_styles"
    )
    kind = models.CharField(max_length=16, choices=Kind.choices)
    color = models.CharField(max_length=7, help_text="팔레트 안의 값만 (`palette.py`)")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["kind"]
        constraints = [
            models.UniqueConstraint(fields=["user", "kind"], name="uniq_mark_style_per_kind"),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} {self.kind} {self.color}"

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.color not in COLORS:
            raise ValidationError({"color": "고를 수 있는 색이 아니에요."})


def styles_for(user) -> list[dict]:
    """
    그 사람의 색 설정 전부. 저장된 줄이 없는 종류는 기본값으로 채워 **항상 종류
    수만큼** 준다 — 받는 쪽이 "없으면 기본값" 규칙을 다시 적지 않도록.

    순서는 `KIND_ORDER` 다. 설정 화면의 줄 순서이자, 한 날에 둘이 겹쳤을 때
    달력이 고르는 순서이기도 하다.
    """
    saved = {style.kind: style.color for style in MarkStyle.objects.filter(user=user)}

    return [
        {
            "kind": kind.value,
            "label": kind.label,
            "color": saved.get(kind.value, DEFAULT_COLOR[kind]),
        }
        for kind in KIND_ORDER
    ]
