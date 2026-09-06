"""
목록 필터의 경계를 한곳에 모아둔다.
웹의 주간 스트립이 "오늘부터 UPCOMING_DAYS일"을 그대로 보여주므로,
이 상수를 바꾸면 스트립 칸 수도 같이 맞춰야 한다 (web: lib/date.ts UPCOMING_DAYS).
"""

import datetime as dt

from django.db.models import Q

FILTERS = ("upcoming", "later", "past")

# 창 하나가 덮는 날 수 (시작일 포함). 웹의 주간 스트립이 이만큼을 칸으로 그리고,
# 앞뒤로 넘길 때도 이 폭만큼 통째로 움직여서 창이 겹치거나 벌어지지 않는다.
UPCOMING_DAYS = 7


def window_end(start: dt.date) -> dt.date:
    """시작일 포함 UPCOMING_DAYS일짜리 창의 마지막 날."""
    return start + dt.timedelta(days=UPCOMING_DAYS - 1)


def upcoming_end(today: dt.date) -> dt.date:
    """'upcoming'은 오늘에서 시작하는 창이다."""
    return window_end(today)


def filter_q(name: str, today: dt.date) -> Q:
    if name == "past":
        return Q(event_date__lt=today)
    if name == "later":
        return Q(event_date__gt=upcoming_end(today))
    return Q(event_date__gte=today, event_date__lte=upcoming_end(today))


def ordering_for(name: str) -> list[str]:
    """
    같은 날 안에서는 공간끼리 모이도록 zone_id로 묶는다.
    지난 일정만 최근 것부터 — 오래된 것부터 쌓으면 방금 지난 일정을 찾으려고
    끝까지 스크롤해야 한다.
    """
    date_order = "-event_date" if name == "past" else "event_date"
    return [date_order, "zone_id", "id"]
