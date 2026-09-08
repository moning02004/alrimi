"""
목록 필터의 경계를 한곳에 모아둔다.

`filter=` 전용이다. 웹의 주간 화면은 달력 한 주(월~일)를 `?from=&to=` 로 직접
받아가므로 이 상수를 보지 않는다 — 한쪽을 바꿔도 다른 쪽은 따라오지 않는다.
"""

import datetime as dt

from django.db.models import F, Q

FILTERS = ("upcoming", "later", "past")

# "다가올" 이 덮는 날 수 (오늘 포함). `later` 는 이 창 바로 뒤부터다.
UPCOMING_DAYS = 7


def window_end(start: dt.date) -> dt.date:
    """시작일 포함 UPCOMING_DAYS일짜리 창의 마지막 날."""
    return start + dt.timedelta(days=UPCOMING_DAYS - 1)


def upcoming_end(today: dt.date) -> dt.date:
    """'upcoming'은 오늘에서 시작하는 창이다."""
    return window_end(today)


def filter_q(name: str, today: dt.date) -> Q:
    """
    일정은 하루에 끝나기도 하고 여행처럼 며칠에 걸치기도 한다. 그래서 경계는
    "시작일이 창 안인가"가 아니라 **"창과 겹치는가"** 로 본다 —
    어제 떠난 3일짜리 여행은 오늘도 진행 중이므로 다가올 목록에 있어야 한다.

    `later` 만 시작일로 가른다. 이미 시작한 일정은 `upcoming` 이 데려가므로,
    여기서도 겹침으로 보면 같은 일정이 두 목록에 겹쳐 나온다.
    """
    if name == "past":
        # 다 끝난 것만 지난 일정이다. 오늘까지 이어지는 여행은 아직 지나지 않았다.
        return Q(end_date__lt=today)
    if name == "later":
        return Q(event_date__gt=upcoming_end(today))
    return Q(event_date__lte=upcoming_end(today), end_date__gte=today)


def ordering_for(name: str) -> list[str]:
    """
    같은 날 안에서는 공간끼리 모이도록 zone_id로 묶는다.
    지난 일정만 최근 것부터 — 오래된 것부터 쌓으면 방금 지난 일정을 찾으려고
    끝까지 스크롤해야 한다.
    """
    date_order = "-event_date" if name == "past" else "event_date"
    # 같은 날 안에서는 시각 순. 시각을 안 정한 것이 앞이다.
    hour_order = F("event_hour").desc(nulls_last=True) if name == "past" else F("event_hour").asc(nulls_first=True)
    return [date_order, hour_order, "zone_id", "id"]
