import datetime as dt

from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from zones.models import Zone

CODE_HELP = (
    '알림 시점 코드. "D-1 20:00"(하루 전) · "D 07:00"(당일) · "D+3 20:00"(사흘 뒤) '
    "처럼 일 오프셋과 정각 시각으로 적는다."
)

#  앞뒤로 이만큼까지. 두 달을 넘겨 잡을 일은 없고, 오타 한 번에 엉뚱한 날로
#  예약이 잡히는 것을 여기서 막는다.
MAX_ALERT_OFFSET_DAYS = 60


class Priority(models.IntegerChoices):
    """
    값이 2·3·5 로 띄엄띄엄한 것은 ntfy 우선순위(1~5)를 그대로 쓰기 때문이다.
    웹도 이 숫자를 그대로 주고받으므로 다시 매기지 않는다.
    """

    LOW = 2, "조용히"
    NORMAL = 4, "일반"
    URGENT = 5, "긴급"


def parse_code(code: str) -> tuple[int, int]:
    """
    'D-1 20:00' → (1, 20) · 'D 07:00' → (0, 7) · 'D+3 20:00' → (-3, 20).
    형식이 어긋나면 ValidationError.

    돌려주는 offset 은 **며칠 전** 이다. 일정이 지난 뒤로 잡은 알림(D+n)은 음수로
    나오고, 그래야 `due_at_for` 가 시작일에서 빼는 계산 하나로 양쪽을 다 맞춘다.
    """
    try:
        day, time = code.strip().split(" ")
        # 부호를 그대로 읽고 뒤집는다: "D-1" → -(-1) = 1(전), "D+3" → -(+3) = -3(후)
        offset = 0 if day == "D" else -int(day[1:])
        hour, minute = (int(part) for part in time.split(":"))
    except (ValueError, IndexError) as exc:
        raise ValidationError(f"알림 코드 형식이 올바르지 않습니다: {code!r}") from exc

    if (
        not day.startswith("D")
        # 부호 없는 "D1" 은 받지 않는다. 앞인지 뒤인지가 코드에 드러나야 한다.
        or (len(day) > 1 and day[1] not in "+-")
        or abs(offset) > MAX_ALERT_OFFSET_DAYS
        or not (0 <= hour <= 23)
        or minute != 0
    ):
        raise ValidationError(f"알림 코드 형식이 올바르지 않습니다: {code!r}")
    return offset, hour


def due_at_for(event_date: dt.date, code: str) -> dt.datetime:
    """
    일정 날짜와 코드로 실제 발송 시각을 만든다. 기준 시간대는 settings.TIME_ZONE.

    기준은 늘 시작일이다 — 여러 날에 걸치는 일정도 마지막 날이 아니라 시작일에서
    센다. "1일 전" 이 돌아오기 전날이 되면 짐 싸라는 알림이 여행 끝에 온다.
    """
    offset, hour = parse_code(code)
    naive = dt.datetime.combine(event_date - dt.timedelta(days=offset), dt.time(hour=hour))
    return timezone.make_aware(naive, timezone.get_default_timezone())


#  하루짜리도 여기까지는 걸칠 수 있다. 여행이 두 달을 넘는 일은 드물고, 연도를
#  잘못 골라 몇 년치 달력이 통째로 칠해지는 사고는 이 선에서 걸린다.
MAX_SPAN_DAYS = 60


class Notice(models.Model):
    """알려야 할 일정 하나. 하루짜리도 있고 여행처럼 며칠에 걸치는 것도 있다."""

    zone = models.ForeignKey(Zone, on_delete=models.CASCADE, related_name="notices")
    event_date = models.DateField(help_text="시작하는 날. 알림 시점(D-1 …)도 이 날을 기준으로 잰다.")
    end_date = models.DateField(
        blank=True,
        help_text=(
            "마지막 날. 하루짜리는 event_date 와 같은 값이 들어간다 — 비워두면 save() 가 채운다. "
            "비워둘 수 있게(null) 두지 않는 것은 '이 날에 걸치는가'를 묻는 조회가 목록·달력·"
            "필터·주간 정리까지 예닐곱 군데라, 매번 COALESCE 를 씌우면 언젠가 한 곳을 빠뜨리기 때문이다."
        ),
    )
    title = models.CharField(max_length=80)
    content = models.CharField(max_length=200, blank=True, default="")
    event_hour = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(23)],
        help_text=(
            "몇 시 일인지. 비워두면 시각을 정하지 않은 것으로 본다 "
            "분은 받지 않는다 — 어린이집 준비물처럼 '오전 중' 이면 되는 일이 대부분이라 "
            "분까지 물으면 없는 정확도를 지어내게 된다."
        ),
    )
    priority = models.IntegerField(choices=Priority.choices, default=Priority.NORMAL)
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="완료 표시한 시각. 완료하면 목록·달력 점에서 빠지고 남은 알림도 나가지 않는다.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # 날짜가 먼저, 그 안에서 시각 순. 시각을 안 정한 것이 그 날 맨 앞이다
        # — 달력들이 쓰는 관례이고, "오전 중" 같은 일이 몇 시 일보다 먼저 눈에 든다.
        ordering = ["event_date", models.F("event_hour").asc(nulls_first=True), "id"]
        indexes = [
            models.Index(fields=["zone", "event_date"]),
            # 겹침 조회가 event_date <= 창끝 AND end_date >= 창시작 이라 뒤쪽도 짚어야 한다
            models.Index(fields=["end_date"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_date__gte=models.F("event_date")),
                name="notice_end_not_before_start",
            ),
        ]

    def __str__(self) -> str:
        span = "" if self.end_date == self.event_date else f"~{self.end_date}"
        return f"{self.event_date}{span} {self.title}"

    @property
    def span_days(self) -> int:
        """걸치는 날 수. 하루짜리는 1이다."""
        return (self.end_date - self.event_date).days + 1

    def days(self, start: dt.date | None = None, end: dt.date | None = None):
        """
        이 일정이 걸치는 날들. `start`·`end` 를 주면 그 창 안으로 잘라서 준다.

        달력 점과 주간 정리가 "이 일정은 이 날에도 있다"를 그리는 데 쓴다 —
        여행 둘째 날 아침에 목록을 열었을 때 비어 있으면 안 되기 때문이다.
        """
        first = max(self.event_date, start) if start else self.event_date
        last = min(self.end_date, end) if end else self.end_date
        while first <= last:
            yield first
            first += dt.timedelta(days=1)

    def save(self, *args, **kwargs):
        # 하루짜리도 end_date 를 채운다. 이 값이 비어 있으면 겹침 조회가 통째로 어긋난다.
        if self.end_date is None:
            self.end_date = self.event_date
        super().save(*args, **kwargs)

    def set_completed(self, completed: bool) -> None:
        """
        오늘 일정이라도 이미 끝난 것이 있다. 지우면 기록이 사라지므로 지우지 않고
        완료로 덮는다 — 목록에서 빠지고, 아직 안 나간 알림도 발송 대상에서 제외된다.
        알림 자체는 남겨둔다. 완료를 취소하면 예약이 그대로 살아나야 한다.
        """
        self.completed_at = timezone.now() if completed else None
        self.save(update_fields=["completed_at", "updated_at"])

    def sync_alerts(self, codes: list[str]) -> None:
        """
        코드 목록을 통째로 받아 Alert를 맞춘다.
        이미 발송된 Alert는 기록이므로 코드에서 빠졌더라도 남긴다.
        """
        wanted = list(dict.fromkeys(codes))
        existing = {alert.code: alert for alert in self.alerts.all()}

        for code in wanted:
            alert = existing.get(code)
            if alert is None:
                Alert.objects.create(notice=self, code=code, due_at=due_at_for(self.event_date, code))
                continue

            # 날짜가 바뀌었으면 아직 안 나간 알림의 발송 시각만 다시 계산한다
            if alert.sent_at is None:
                due_at = due_at_for(self.event_date, code)
                if alert.due_at != due_at:
                    alert.due_at = due_at
                    alert.save(update_fields=["due_at"])

        stale = [
            alert.pk
            for code, alert in existing.items()
            if code not in wanted and alert.sent_at is None
        ]
        if stale:
            Alert.objects.filter(pk__in=stale).delete()


class Alert(models.Model):
    """일정 하나에 걸린 발송 예약."""

    class Status(models.TextChoices):
        PENDING = "", "예약"
        SENT = "sent", "발송됨"
        FAILED = "fail", "발송 실패"

    notice = models.ForeignKey(Notice, on_delete=models.CASCADE, related_name="alerts")
    code = models.CharField(max_length=16, help_text=CODE_HELP)
    due_at = models.DateTimeField()
    # 실제로 나간 시각. 상세 화면이 "07:00 발송"을 이 값으로 적는다.
    sent_at = models.DateTimeField(null=True, blank=True)
    # 나갔는지 여부는 이쪽이 기준이다. sent_at 은 언제인지만 말한다.
    status = models.CharField(
        max_length=4, blank=True, default=Status.PENDING, choices=Status.choices
    )

    class Meta:
        ordering = ["due_at", "id"]
        constraints = [
            models.UniqueConstraint(fields=["notice", "code"], name="uniq_alert_code_per_notice"),
        ]
        indexes = [models.Index(fields=["sent_at", "due_at"])]

    def __str__(self) -> str:
        return f"{self.notice_id} {self.code} {self.due_at.strftime('%Y-%m-%d %H:%M')}"

    def mark_sent(self) -> None:
        self.sent_at = timezone.now()
        self.status = self.Status.SENT
        self.save(update_fields=["sent_at", "status"])

    def mark_failed(self) -> None:
        """
        보내려다 실패했다. `sent_at` 은 건드리지 않는다 — 그 값은 "실제로 나간 때"라서,
        채워두면 목록의 발송 점이 나간 것으로 센다.
        """
        self.status = self.Status.FAILED
        self.save(update_fields=["status"])
