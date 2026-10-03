"""
반복 일정을 펼치고 채운다. 규칙과 본보기는 `models.EventSeries` 에 있다.

    가까운 날 ── 실제 일정(`fill`) ── 알림·완료·보류가 여느 일정처럼 돈다
    먼 날     ── 조회할 때 펼친다(`virtual_events`) ── id 가 음수다
    먼 날을 열거나 고치면 ── 그 날 하나만 만든다(`materialize`)
"""

import datetime as dt
import logging

from django.db import IntegrityError, transaction
from django.db.models import F, Q
from django.utils import timezone

from .models import FILL_AHEAD_DAYS, Event, EventSeries

logger = logging.getLogger(__name__)

#  펼친 날의 id. 음수로 (규칙 id, 날짜) 를 한 숫자에 담는다:
#
#      -(규칙 id × 100000 + 2000-01-01 부터 센 날 수)
#
#  웹은 이 id 를 여느 일정 id 처럼 쓴다 — 카드 열기·완료·지우기가 모두 이 숫자 하나로
#  돈다. 받은 서버가 풀어 읽고 그 날을 그 자리에서 만든다(`EventDetailView`). 웹이 "아직 없는
#  일정" 을 따로 다루게 하면 카드·달력·고르기·상세가 모두 두 갈래가 된다.
#
#  날 수는 다섯 자리로 2273년까지 담긴다. 음력 표가 2050년에서 끝나므로 충분하다.
VIRTUAL_DAYS = 100_000
EPOCH = dt.date(2000, 1, 1)


def virtual_id(series_id: int, day: dt.date) -> int:
    return -(series_id * VIRTUAL_DAYS + (day - EPOCH).days)


def parse_virtual_id(event_id: int) -> tuple[int, dt.date]:
    """음수 id → (규칙 id, 날짜)."""
    n = -event_id
    return n // VIRTUAL_DAYS, EPOCH + dt.timedelta(days=n % VIRTUAL_DAYS)


def build(series: EventSeries, day: dt.date) -> Event:
    """
    규칙이 이 날 낼 일정. **저장하지 않는다** — 목록에 실어 보낼 모양이다.

    알림은 행이 없으므로 코드만 붙여 둔다(`virtual_codes`). 목록 카드는 개수만 센다.
    """
    event = Event(
        id=virtual_id(series.id, day),
        zone=series.zone,
        series=series,
        series_date=day,
        event_date=day,
        end_date=day + dt.timedelta(days=series.span_days - 1),
        title=series.title,
        content=series.content,
        event_hour=series.event_hour,
    )
    event.virtual_codes = list(series.alert_codes)
    return event


def materialize(series: EventSeries, day: dt.date) -> Event:
    """
    그 날 하나를 실제 일정으로 만든다. 이미 있으면 그것을 돌려준다.

    **새 일정 알림(`notify.new_event`)은 보내지 않는다.** 규칙을 만들 때 한 번 알렸고,
    몇 달 뒤 날이 채워질 때마다 "새 일정" 이 오면 그게 더 성가시다.
    """
    existing = Event.objects.filter(series=series, series_date=day).first()
    if existing is not None:
        return existing
    try:
        with transaction.atomic():
            event = Event.objects.create(
                zone_id=series.zone_id,
                series=series,
                series_date=day,
                event_date=day,
                end_date=day + dt.timedelta(days=series.span_days - 1),
                title=series.title,
                content=series.content,
                event_hour=series.event_hour,
            )
            event.sync_alerts(series.alert_codes)
    except IntegrityError:
        # 다른 워커가 방금 같은 날을 만들었다
        return Event.objects.get(series=series, series_date=day)
    return event


def horizon(today: dt.date | None = None) -> dt.date:
    """여기까지는 실제 일정으로 있어야 한다."""
    return (today or timezone.localdate()) + dt.timedelta(days=FILL_AHEAD_DAYS)


def fill(series: EventSeries, through: dt.date | None = None) -> int:
    """`through`(기본 `horizon`)까지의 날을 실제 일정으로 만든다. 만든 개수를 돌려준다."""
    through = through or horizon()
    if series.until is not None:
        through = min(through, series.until)
    if through <= series.filled_until:
        return 0

    made = 0
    for day in series.dates_between(series.filled_until + dt.timedelta(days=1), through):
        materialize(series, day)
        made += 1
    series.filled_until = through
    series.save(update_fields=["filled_until"])
    return made


def fill_due() -> int:
    """
    채울 때가 된 규칙을 전부 채운다. 하루 한 번 일꾼이(`alrimi_api.housekeeping`), 매시
    알림 크론이(`list_due_alerts`) 부른다 — 둘 중 하나만 돌아도 알림이 빠지지 않게.
    """
    limit = horizon()
    pending = EventSeries.objects.filter(filled_until__lt=limit).filter(
        Q(until__isnull=True) | Q(until__gt=F("filled_until"))
    )
    made = 0
    for series in pending:
        made += fill(series, limit)
    if made:
        logger.info("series: filled %d events", made)
    return made


def virtual_events(series_list, lo: dt.date, hi: dt.date) -> list[Event]:
    """
    `lo`~`hi` 에 걸치는, 아직 일정으로 없는 날들(`build`).

    채운 곳(`filled_until`)까지는 실제 일정이 이미 있으므로 그 뒤만 펼친다. 그 뒤라도
    누가 열어서 만들어진 날은 빼고 — 그것은 실제 일정으로 목록에 이미 있다.
    """
    series_list = list(series_list)
    if not series_list:
        return []

    candidates: list[tuple[EventSeries, dt.date]] = []
    for series in series_list:
        # 며칠짜리는 창 앞에서 시작해 창 안으로 들어오는 것도 담는다
        first = max(lo - dt.timedelta(days=series.span_days - 1), series.filled_until + dt.timedelta(days=1))
        candidates += [(series, day) for day in series.dates_between(first, hi)]
    if not candidates:
        return []

    made = set(
        Event.objects.filter(
            series_id__in={series.id for series, _ in candidates},
            series_date__gte=min(day for _, day in candidates),
        ).values_list("series_id", "series_date")
    )
    return [build(series, day) for series, day in candidates if (series.id, day) not in made]


def resolve(series: EventSeries, day: dt.date) -> Event | None:
    """
    음수 id 가 가리키는 날. 규칙에 없는 날이거나 지운 날이면 None.

    이미 일정으로 만들어졌으면 그것을, 아니면 저장하지 않은 모양(`build`)을 돌려준다.
    만드는 것은 부르는 쪽이 권한을 본 뒤에 한다(`materialize`).
    """
    existing = Event.objects.filter(series=series, series_date=day).first()
    if existing is not None:
        return existing
    if day not in set(series.dates_between(day, day)):
        return None
    return build(series, day)


def split(
    series: EventSeries, at: Event, moved_by: dt.timedelta, cut: dt.date, rule: dict | None = None
) -> EventSeries:
    """
    "이후 모두" 로 날짜를 옮겼거나 규칙을 바꿨다(매월 → 매주). 규칙을 그 날 앞에서 끊고,
    옮긴 날에서 새 규칙을 세운다. `rule` 이 있으면 새 규칙은 그것이고(`RepeatSerializer`
    가 거른 값), 없으면 옛 규칙을 옮긴 만큼 민다.

    매주 수요일을 목요일로 옮기면 뒤따르는 것도 목요일이어야 하는데, 날짜를 하나씩 미는
    것으로는 아직 안 만든 날(규칙으로만 있는 날)을 옮길 수 없다. 규칙 자체를 새로 세운다.

    뒤따르던 일정은 지우고 새 규칙으로 다시 채운다. **그 날들에 따로 해둔 것(완료·하루만
    고치기)은 사라진다** — "이후 모두" 를 고른 것이 그 날들을 새 모양으로 덮겠다는 뜻이다.

    `at` 은 이미 새 날짜로 고쳐져 들어온다. `moved_by` 는 옮긴 만큼, `cut` 은 `at` 이
    규칙에서 차지하던 날(`series_date`)이다 — 옛 규칙은 그 앞에서 끝난다.
    """
    if rule is not None:
        freq, weekdays, lunar, until = rule["freq"], rule["weekdays"], rule["lunar"], rule["until"]
    else:
        freq, lunar = series.freq, series.lunar
        until = series.until + moved_by if series.until else None
        weekdays = series.weekday_list
        if freq == EventSeries.Freq.WEEKLY:
            weekdays = sorted({(day + moved_by.days) % 7 for day in weekdays})

    Event.objects.filter(series=series).filter(
        Q(series_date__gt=cut) | Q(series_date__isnull=True, event_date__gt=cut)
    ).exclude(pk=at.pk).delete()

    fresh = EventSeries.objects.create(
        freq=freq,
        weekdays=",".join(str(day) for day in weekdays),
        lunar=lunar,
        start=at.event_date,
        until=until,
        zone_id=at.zone_id,
        title=at.title,
        content=at.content,
        event_hour=at.event_hour,
        span_days=at.span_days,
        # 목록에서 받아올 때 미리 읽어둔 알림은 고치기 전 것이다. 새로 읽는다
        alert_codes=sorted(set(at.alerts.values_list("code", flat=True))),
        filled_until=at.event_date,
    )
    series.until = cut - dt.timedelta(days=1)
    series.save(update_fields=["until"])

    at.series = fresh
    at.series_date = at.event_date
    at.save(update_fields=["series", "series_date", "updated_at"])
    fill(fresh)
    return fresh
