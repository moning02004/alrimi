import datetime as dt

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from zones.models import Zone

CODE_HELP = '알림 시점 코드. "D-1 20:00" 처럼 일 오프셋과 정각 시각으로 적는다.'


class Priority(models.IntegerChoices):
    """
    값이 2·3·5 로 띄엄띄엄한 것은 ntfy 우선순위(1~5)를 그대로 쓰기 때문이다.
    웹도 이 숫자를 그대로 주고받으므로 다시 매기지 않는다.
    """

    LOW = 2, "낮음"
    NORMAL = 3, "보통"
    URGENT = 5, "긴급"


def parse_code(code: str) -> tuple[int, int]:
    """'D-1 20:00' → (1, 20). 형식이 어긋나면 ValidationError."""
    try:
        day, time = code.strip().split(" ")
        offset = 0 if day == "D" else int(day[2:])
        hour, minute = (int(part) for part in time.split(":"))
    except (ValueError, IndexError) as exc:
        raise ValidationError(f"알림 코드 형식이 올바르지 않습니다: {code!r}") from exc

    if not day.startswith("D") or offset < 0 or not (0 <= hour <= 23) or minute != 0:
        raise ValidationError(f"알림 코드 형식이 올바르지 않습니다: {code!r}")
    return offset, hour


def due_at_for(event_date: dt.date, code: str) -> dt.datetime:
    """일정 날짜와 코드로 실제 발송 시각을 만든다. 기준 시간대는 settings.TIME_ZONE."""
    offset, hour = parse_code(code)
    naive = dt.datetime.combine(event_date - dt.timedelta(days=offset), dt.time(hour=hour))
    return timezone.make_aware(naive, timezone.get_default_timezone())


class Notice(models.Model):
    """알려야 할 일정 하나."""

    zone = models.ForeignKey(Zone, on_delete=models.CASCADE, related_name="notices")
    event_date = models.DateField()
    title = models.CharField(max_length=80)
    content = models.CharField(max_length=200, blank=True, default="")
    priority = models.IntegerField(choices=Priority.choices, default=Priority.NORMAL)
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="완료 표시한 시각. 완료하면 목록·달력 점에서 빠지고 남은 알림도 나가지 않는다.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["event_date", "id"]
        indexes = [models.Index(fields=["zone", "event_date"])]

    def __str__(self) -> str:
        return f"{self.event_date} {self.title}"

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
        return f"{self.notice_id} {self.code}"

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
