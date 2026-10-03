import datetime as dt

from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone
from korean_lunar_calendar import KoreanLunarCalendar

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
    알림을 보낼 때의 등급. 값이 2·4·5 로 띄엄띄엄한 것은 ntfy 우선순위(1~5)를 그대로
    쓰기 때문이다. 웹 푸시는 이 값을 Urgency 헤더로 옮긴다(`notices.webpush.URGENCY`).

    일정마다 고르던 칸은 없앴다 — 조용히·긴급을 거의 쓰지 않았다. 지금 매시 발송은
    모두 NORMAL 로 나간다.
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


#  반복은 규칙으로 두고, 실제 일정(`Event`)은 가까운 날 것만 만들어 둔다. 알림 예약이
#  일정마다 행으로 있어야 크론이 시각을 찾을 수 있는데, 알림은 길어야 60일 앞이다
#  (`MAX_ALERT_OFFSET_DAYS`). 하루 한 번 채우므로(`notices.series.fill_due`) 여유를 이틀 둔다.
FILL_AHEAD_DAYS = MAX_ALERT_OFFSET_DAYS + 2


class EventSeries(models.Model):
    """
    반복 일정의 규칙과 본보기.

    **날마다 미리 만들어 두지 않는다.** 예전에는 끝나는 날까지(최대 5년) 일정을 전부
    만들어 두었는데, 부모님 생신 같은 매년 반복은 끝이 없고, 매일 반복은 몇 해만 둬도
    행이 수천 개다. 그래서 셋으로 나눈다:

    - **가까운 날**(`FILL_AHEAD_DAYS`)은 실제 일정으로 만든다(`notices.series.fill`).
      알림·완료·보류·하루만 고치기가 일정 한 건을 단위로 해서, 그 날이 오기 전에는
      행이 있어야 한다.
    - **그 뒤**는 조회할 때 규칙으로 펼쳐 내보낸다. id 는 음수다(`notices.series.virtual_id`)
      — 웹은 그 id 를 여느 일정처럼 다루고, 서버가 받아서 풀어 읽는다.
    - 먼 날을 **열거나 고치면** 그 날 하나만 그 자리에서 만든다(`notices.series.materialize`).

    본보기(공간·제목·내용·시각·길이·알림 시점)는 새로 만들 일정의 모양이다. "이후 모두
    고치기" 가 이것도 함께 고쳐서, 아직 안 만든 날에도 이어진다.
    """

    class Freq(models.TextChoices):
        DAILY = "daily", "매일"
        WEEKLY = "weekly", "매주"
        MONTHLY = "monthly", "매월"
        YEARLY = "yearly", "매년"

    freq = models.CharField(max_length=8, choices=Freq.choices)
    weekdays = models.CharField(
        max_length=13,
        blank=True,
        default="",
        help_text="매주일 때 요일들. 월=0 … 일=6 을 쉼표로 (\"0,2,4\"). 다른 규칙은 비운다.",
    )
    lunar = models.BooleanField(
        default=False,
        help_text="매년일 때 음력 날짜로 되풀이한다(부모님 생신처럼). 다른 규칙은 늘 거짓.",
    )
    start = models.DateField(help_text="첫날. 매월·매년은 이 날의 일(음력이면 음력 월·일)을 되풀이한다.")
    until = models.DateField(
        null=True, blank=True, help_text="마지막으로 반복할 수 있는 날 (포함). 비우면 끝이 없다."
    )

    # 본보기. 새로 만들 일정이 이 모양이다
    zone = models.ForeignKey(Zone, on_delete=models.CASCADE, related_name="series")
    title = models.CharField(max_length=80)
    content = models.CharField(max_length=200, blank=True, default="")
    event_hour = models.PositiveSmallIntegerField(null=True, blank=True)
    span_days = models.PositiveSmallIntegerField(default=1, help_text="며칠짜리인가. 하루짜리는 1.")
    alert_codes = models.JSONField(default=list, blank=True, help_text='알림 시점 코드들. ["D-1 20:00"]')

    skipped = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            "지운 날들(YYYY-MM-DD). 규칙으로 펼칠 때 건너뛴다 — 안 그러면 '이 일정만 지우기' "
            "한 먼 날이 다음 조회에 되살아난다."
        ),
    )
    filled_until = models.DateField(
        help_text="여기까지는 실제 일정으로 만들었다. 이 뒤만 규칙으로 펼친다.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        lunar = " 음력" if self.lunar else ""
        return f"{self.get_freq_display()}{lunar} {self.title} {self.start}~{self.until or ''}"

    @property
    def weekday_list(self) -> list[int]:
        return [int(day) for day in self.weekdays.split(",") if day != ""]

    def dates_between(self, lo: dt.date, hi: dt.date):
        """`lo`~`hi`(둘 다 포함) 안에서 이 규칙이 되풀이하는 날. 지운 날은 빠진다."""
        if self.until is not None:
            hi = min(hi, self.until)
        skipped = set(self.skipped)
        for day in rule_dates(self.start, self.freq, self.weekday_list, self.lunar, lo, hi):
            if day.isoformat() not in skipped:
                yield day

    def skip(self, day: dt.date) -> None:
        """이 날은 다시 펼치지 않는다."""
        iso = day.isoformat()
        if iso not in self.skipped:
            self.skipped = [*self.skipped, iso]
            self.save(update_fields=["skipped"])


def _add_months(year: int, month: int, months: int) -> tuple[int, int]:
    index = year * 12 + (month - 1) + months
    return index // 12, index % 12 + 1


def _lunar_yearly(start: dt.date, lo: dt.date, hi: dt.date):
    """
    매년 음력. 첫날의 음력 월·일을 해마다 양력으로 옮긴다.

    - **음력 30일이 없는 해(작은달)는 29일로 당긴다.** 양력 2월 29일처럼 건너뛰면
      음력 30일 생신은 두 해에 한 번꼴로 사라진다. 음력은 양력 날짜가 해마다 달라
      "날이 틀렸다" 고 읽힐 일도 없다 — 그믐에 챙기는 것이 관습이기도 하다.
    - **윤달에 시작했으면 이듬해부터는 평달이다.** 윤달은 몇 해에 한 번이라 그 달을
      기다리면 몇 해씩 비고, 윤달 생일도 평달에 챙긴다.
    - 표(한국천문연구원, 2050년까지)가 닿지 않는 해에서 멈춘다.
    """
    calendar = KoreanLunarCalendar()
    if not calendar.setSolarDate(start.year, start.month, start.day):
        return
    year, month, day = calendar.lunarYear, calendar.lunarMonth, calendar.lunarDay

    if lo <= start <= hi:
        yield start
    # 음력 해는 양력 해와 한 해 안쪽으로 어긋난다. 창보다 한 해 앞에서부터 센다
    year = max(year + 1, lo.year - 1)
    while True:
        calendar = KoreanLunarCalendar()
        if not calendar.setLunarDate(year, month, day, False):
            # 작은달이면 그믐으로. 그래도 안 되면 표 밖이다
            if day != 30 or not calendar.setLunarDate(year, month, 29, False):
                return
        solar = dt.date(calendar.solarYear, calendar.solarMonth, calendar.solarDay)
        if solar > hi:
            return
        if solar >= lo:
            yield solar
        year += 1


def rule_dates(start: dt.date, freq: str, weekdays: list[int], lunar: bool, lo: dt.date, hi: dt.date):
    """
    `start` 에서 시작하는 규칙이 `lo`~`hi`(둘 다 포함) 안에서 되풀이하는 날.

    - 매주는 고른 요일에 해당하는 날만이다. 시작일의 요일을 안 골랐으면 시작일도 빠진다.
    - **매월 31일·매년 2월 29일은 그 날이 없는 달·해를 건너뛴다.** 말일로 당기면
      "31일" 이라고 적어둔 일이 30일에 오고, 사람은 규칙이 틀렸다고 읽는다.
    - 매년 음력은 `_lunar_yearly` 가 센다.

    창이 첫날에서 멀어도 첫날부터 세지 않고 창 근처에서 시작한다 — 끝 없는 매일 반복을
    몇 해 뒤 달력에서 펼칠 때 그 사이를 하루씩 밟지 않으려는 것이다.
    """
    lo = max(lo, start)
    if hi < lo:
        return

    if freq in (EventSeries.Freq.DAILY, EventSeries.Freq.WEEKLY):
        wanted = set(weekdays) if freq == EventSeries.Freq.WEEKLY else None
        day = lo
        while day <= hi:
            if wanted is None or day.weekday() in wanted:
                yield day
            day += dt.timedelta(days=1)
        return

    if freq == EventSeries.Freq.YEARLY and lunar:
        yield from _lunar_yearly(start, lo, hi)
        return

    step = 12 if freq == EventSeries.Freq.YEARLY else 1
    # 창이 시작하는 달에서 가장 가까운, 규칙에 맞는 달부터
    gap = (lo.year - start.year) * 12 + (lo.month - start.month)
    months = max(0, gap - gap % step)
    while True:
        year, month = _add_months(start.year, start.month, months)
        months += step
        if dt.date(year, month, 1) > hi:
            return
        try:
            day = dt.date(year, month, start.day)
        except ValueError:
            # 그 달에 그 날이 없다(31일·2월 29일). 건너뛴다.
            continue
        if day > hi:
            return
        if day >= lo:
            yield day


def repeat_dates(
    start: dt.date,
    freq: str,
    until: dt.date,
    weekdays: list[int] | None = None,
    lunar: bool = False,
) -> list[dt.date]:
    """`start` 부터 `until` 까지(둘 다 포함) 규칙이 되풀이하는 날 전부."""
    return list(rule_dates(start, freq, weekdays or [], lunar, start, until))


#  하루짜리도 여기까지는 걸칠 수 있다. 여행이 두 달을 넘는 일은 드물고, 연도를
#  잘못 골라 몇 년치 달력이 통째로 칠해지는 사고는 이 선에서 걸린다.
MAX_SPAN_DAYS = 60


#  끝났거나 취소된 일정. 앞으로의 목록에서 빠지고 알림도 나가지 않는 자리는 늘 둘을 함께
#  묻는다 — 갈리는 것은 화면에 어떻게 그리느냐뿐이다(완료는 체크, 취소는 취소선).
FINISHED = models.Q(completed_at__isnull=False) | models.Q(canceled_at__isnull=False)


class Event(models.Model):
    """
    알려야 할 일정 하나. 하루짜리도 있고 여행처럼 며칠에 걸치는 것도 있다.

    며칠에 걸쳐도 **한 건**이다 — 날마다 따로 만들지 않는다. 그래서 알림도 시작일
    하나를 기준으로만 잡히고, 중간이나 마지막 날에는 예약이 생기지 않는다.
    같은 일을 두고 알림이 며칠 내리 오면 어느 것이 진짜인지 알 수 없다.
    """

    zone = models.ForeignKey(Zone, on_delete=models.CASCADE, related_name="events")
    series = models.ForeignKey(
        EventSeries,
        null=True,
        blank=True,
        # 규칙이 사라져도 이미 만든 일정은 남는다 — 그 날들은 따로 떨어진 일정이 된다
        on_delete=models.SET_NULL,
        related_name="events",
        help_text="반복으로 만든 일정이면 그 규칙. '이후 모두 고치기·지우기' 가 이것으로 형제를 찾는다.",
    )
    series_date = models.DateField(
        null=True,
        blank=True,
        help_text=(
            "반복의 몇 번째 날인가 — 규칙이 이 일정을 낸 날. 날짜를 옮기거나 보류해도 그대로다. "
            "규칙으로 펼칠 때 이 날이 이미 일정으로 있으면 다시 내지 않는다."
        ),
    )
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
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="완료 표시한 시각. 완료하면 목록·달력에서 빠지고 남은 알림도 나가지 않는다.",
    )
    canceled_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=(
            "취소한 시각. **날짜에 그대로 남는다** — 완료와 같은 자리에 흐리게, 취소선을 긋고 "
            "남는다. 지우지 않는 까닭이 이것이다: 몇 주 뒤에 달력을 보다가 '이 날 뭐가 "
            "있었는데 뭐였지' 하는 순간, 지워버렸으면 답할 길이 없고 남아 있으면 '아, 취소했지' "
            "로 끝난다. 보류와 갈리는 지점이기도 하다 — 보류는 다시 잡을 일이라 날짜를 떠나 "
            "보류함으로 가고, 취소는 다시 잡지 않을 일이라 그 날에 눌러앉는다."
        ),
    )
    starred_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=(
            "즐겨찾기에 넣은 시각. 등록 폼이 제목 칸 아래에 내놓는 목록이 이것이다 — 고르면 "
            "제목·내용·공간·시각·알림 시점이 한 번에 채워지고 날짜만 빈다.\n\n"
            "**쓴 횟수로 세지 않고 사람이 정한다.** 예전에는 지난 기록에서 자주 쓴 것을 뽑아 "
            "줬는데, 많이 적은 것과 다시 쓰고 싶은 것은 같지 않았다 — 병원은 자주 갔지만 다시 "
            "적을 일은 아니고, 1년에 두 번인 학부모 상담은 매번 그대로 다시 적는다.\n\n"
            "시각을 남기는 것은 최근에 넣은 것이 위에 서게 하려는 것이다(불리언이면 줄 세울 "
            "것이 없다). 완료·취소·보류가 모두 같은 방식이다."
        ),
    )
    held_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=(
            "보류한 시각. 취소됐지만 다시 잡힐 수 있는 일정을 지우는 대신 여기로 치운다 "
            "— 지우면 제목·내용·알림 시점을 다음에 처음부터 다시 적어야 한다. "
            "보류하면 날짜를 축으로 삼는 모든 화면(목록·달력·주간 정리)과 발송에서 빠지고 "
            "보류함(?filter=held)에만 남는다. event_date 는 마지막으로 잡혔던 날 그대로 두는데, "
            "보류함이 '9월 14일에 있던 일정' 이라고 적어줘야 무엇을 미룬 것인지 알아볼 수 있어서다."
        ),
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
                name="event_end_not_before_start",
            ),
            # 같은 날이 두 번 만들어지지 않게. 채우기는 워커마다 돌 수 있다
            models.UniqueConstraint(
                fields=["series", "series_date"],
                condition=models.Q(series__isnull=False, series_date__isnull=False),
                name="uniq_event_per_series_date",
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

        주간 정리가 "이 일정은 이 날에도 있다"를 적는 데 쓴다 —
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
        완료로 덮는다 — 앞으로의 목록에서 빠지고, 아직 안 나간 알림도 발송 대상에서
        제외된다. 알림 자체는 남겨둔다. 완료를 풀면 예약이 그대로 살아나야 한다.
        """
        self.completed_at = timezone.now() if completed else None
        if completed:
            # 한 일정이 끝나기도 하고 취소되기도 할 수는 없다
            self.canceled_at = None
        self.save(update_fields=["completed_at", "canceled_at", "updated_at"])

    def set_starred(self, starred: bool) -> None:
        """
        즐겨찾기에 넣거나 뺀다. 일정의 다른 무엇도 건드리지 않는다 — 끝난 일정을 즐겨찾기에
        두는 것도 뜻이 있다(지난달 학부모 상담을 본보기로 삼아 다음 것을 적는다).
        """
        self.starred_at = timezone.now() if starred else None
        self.save(update_fields=["starred_at", "updated_at"])

    def set_canceled(self, canceled: bool) -> None:
        """
        취소. 보이는 자리와 알림은 완료와 똑같이 다루고, 화면에 그리는 모양만 다르다.
        """
        self.canceled_at = timezone.now() if canceled else None
        if canceled:
            self.completed_at = None
        self.save(update_fields=["completed_at", "canceled_at", "updated_at"])

    def revive_alerts(self) -> None:
        """
        보류했다 다시 잡을 때. **이미 나간 예약까지 되살린다.**

        `sync_alerts` 는 나간 예약의 발송 시각을 건드리지 않는다 — 그것은 기록이라
        날짜를 고쳤다고 없던 일이 되면 안 되기 때문이다. 그런데 보류는 다르다:
        지난번 날짜에 "1일 전" 이 이미 나갔다면, 새 날짜를 잡아도 그 예약은
        발송됨으로 남아 다시는 나가지 않는다. 다시 잡은 일정이 아무 알림 없이
        당일을 맞는 것이 이 기능이 막으려던 바로 그 일이다.

        되살리는 것은 **날짜에 딸린 사실**(언제 나가나·나갔나)뿐이고 코드는 그대로다.
        """
        alerts = list(self.alerts.all())
        for alert in alerts:
            alert.due_at = due_at_for(self.event_date, alert.code)
            alert.sent_at = None
            alert.status = EventAlert.Status.PENDING
        if alerts:
            EventAlert.objects.bulk_update(alerts, ["due_at", "sent_at", "status"])

    def sync_alerts(self, codes: list[str]) -> None:
        """
        코드 목록을 통째로 받아 EventAlert 를 맞춘다.
        이미 발송된 예약은 기록이므로 코드에서 빠졌더라도 남긴다.
        """
        wanted = list(dict.fromkeys(codes))
        existing = {alert.code: alert for alert in self.alerts.all()}

        for code in wanted:
            alert = existing.get(code)
            if alert is None:
                EventAlert.objects.create(event=self, code=code, due_at=due_at_for(self.event_date, code))
                continue

            # 날짜가 바뀌었으면 아직 안 나간 알림의 발송 시각만 다시 계산한다
            if alert.sent_at is None:
                due_at = due_at_for(self.event_date, code)
                if alert.due_at != due_at:
                    alert.due_at = due_at
                    alert.save(update_fields=["due_at"])

        # 이미 나간 것은 기록이라 코드에서 빠져도 남긴다 — 알림 시점을 통째로 지워도
        # ("없음") 그 날 무엇이 나갔는지는 그대로 남아야 한다. 실패한 예약은 나간 적이
        # 없으므로 함께 지운다.
        stale = [
            alert.pk
            for code, alert in existing.items()
            if code not in wanted and alert.sent_at is None
        ]
        if stale:
            EventAlert.objects.filter(pk__in=stale).delete()


class EventAlert(models.Model):
    """일정 하나에 걸린 발송 예약."""

    class Status(models.TextChoices):
        PENDING = "", "예약"
        SENT = "sent", "발송됨"
        FAILED = "fail", "발송 실패"

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="alerts")
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
            models.UniqueConstraint(fields=["event", "code"], name="uniq_alert_code_per_event"),
        ]
        indexes = [models.Index(fields=["sent_at", "due_at"])]

    def __str__(self) -> str:
        return f"{self.event_id} {self.code} {self.due_at.strftime('%Y-%m-%d %H:%M')}"

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
