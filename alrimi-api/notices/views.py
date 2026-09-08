import datetime as dt
import re
from collections import defaultdict
from datetime import timedelta

from django.db.models import F, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date as parse_date_string
from rest_framework import generics, status
from rest_framework.authentication import TokenAuthentication, SessionAuthentication
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import HasAPIKey

from .filters import FILTERS, filter_q, ordering_for
from .models import Alert, Notice
from .ntfy import NtfyError, send_alert
from .serializers import (
    AlertItemSerializer,
    NoticeDetailSerializer,
    NoticeListSerializer,
    NoticeWriteSerializer,
)


def owned_notices(user):
    return Notice.objects.filter(zone__owner=user).select_related("zone").prefetch_related("alerts")


def zone_filter(request) -> Q:
    """?zone={id} 는 목록을 좁히는 선택 필터다. 없으면 전체 공간."""
    raw = request.query_params.get("zone")
    if not raw:
        return Q()
    try:
        return Q(zone_id=int(raw))
    except ValueError:
        raise ValidationError({"zone": "공간 id는 정수여야 합니다."}) from None


def parse_date(raw: str, field: str) -> dt.date:
    parsed = parse_date_string(raw)
    if parsed is None:
        raise ValidationError({field: "YYYY-MM-DD 형식이어야 합니다."})
    return parsed


# 같은 날 안에서 시각 순. 시각을 안 정한 것이 앞이다.
HOUR_ORDER = F("event_hour").asc(nulls_first=True)


#  범위를 열어두면 실수 한 번에 몇 년치를 긁는다
MAX_RANGE_DAYS = 400


def parse_range(params, *, require_end: bool = True) -> tuple[dt.date, dt.date | None]:
    """
    from/to 를 함께 읽는다. 목록과 달력이 같은 규칙을 쓰도록 한곳에 둔다.

    목록은 `to` 없이도 부른다 — 웹이 "이 날부터 앞으로 전부"를 한 번에 받아
    화면에서 기간과 그 이후로 나눠 그린다. 달력 점은 그릴 칸이 정해져 있으므로
    항상 양끝을 요구한다.
    """
    if not params.get("from"):
        raise ValidationError({"detail": "from 이 필요합니다."})
    start = parse_date(params["from"], "from")

    raw_end = params.get("to")
    if not raw_end:
        if require_end:
            raise ValidationError({"detail": "to 가 필요합니다."})
        return start, None

    end = parse_date(raw_end, "to")
    if end < start:
        raise ValidationError({"detail": "to 는 from 보다 앞설 수 없습니다."})
    if (end - start).days > MAX_RANGE_DAYS:
        raise ValidationError({"detail": f"범위는 최대 {MAX_RANGE_DAYS}일입니다."})
    return start, end


class NoticeListCreateView(generics.ListCreateAPIView):
    """
    GET  /notices?from=&to=&zone={id}          — 임의 기간. 주간 스트립이 쓴다
    GET  /notices?date=2026-08-19&zone={id}    — 하루치
    GET  /notices?filter=upcoming|later|past&zone={id}
    POST /notices                              — 공간은 본문의 zone

    셋이 겹치면 date > from/to > filter 순으로 이긴다. 화면마다 창이 하나뿐이라
    섞이면 목록이 어느 창을 그린 건지 알 수 없어진다.
    """

    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_serializer_class(self):
        return NoticeWriteSerializer if self.request.method == "POST" else NoticeListSerializer

    def rows(self, condition, ordering, *, hide_completed: bool = True):
        """
        완료한 일정은 **앞으로의** 목록에서만 뺀다 — 아침에 훑는 것은
        "아직 남은 것"이라서다.

        지난 일정은 기록이다. 끝낸 것을 지워버리면 그 날 무엇이 있었는지가
        틀리게 남으므로 그대로 두고 웹이 흐리게 그린다.
        하루 보기(`?date=`)도 같은 이유로 전부 돌려준다.
        """
        queryset = Notice.objects.filter(zone__owner=self.request.user)
        if hide_completed:
            # 끝난 날짜가 기준이다 — 오늘까지 이어지는 여행을 완료로 덮었다면
            # 마지막 날까지는 앞으로의 목록에서 빠져야 한다.
            queryset = queryset.exclude(
                completed_at__isnull=False, end_date__gte=timezone.localdate()
            )
        return (
            queryset.filter(zone_filter(self.request), condition)
            .select_related("zone")
            .prefetch_related("alerts")
            .order_by(*ordering)
        )

    def get_queryset(self):
        params = self.request.query_params

        # 달력을 펼치면 하루만 본다. 여기서는 완료한 것도 보여준다 —
        # 이 화면이 완료를 되돌리는 유일한 길이다.
        if params.get("date"):
            day = parse_date(params["date"], "date")
            # 그 날 시작하는 것만이 아니라 그 날에 걸치는 것 전부.
            # 여행 둘째 날 아침에 열었을 때 비어 있으면 안 된다.
            return self.rows(
                Q(event_date__lte=day, end_date__gte=day),
                ["completed_at", HOUR_ORDER, "zone_id", "id"],
                hide_completed=False,
            )

        # 주간 스트립은 앞뒤로 넘길 수 있어서 창이 오늘에 고정되지 않는다.
        # 스트립이 그린 기간을 그대로 받아 목록이 같은 창을 보게 한다.
        if params.get("from") or params.get("to"):
            start, end = parse_range(params, require_end=False)
            # 창과 겹치는 것 전부. 지난주에 떠난 여행이 이번 주까지 이어지면
            # 이번 주 목록에도 있어야 한다.
            window = Q(end_date__gte=start)
            if end is not None:
                window &= Q(event_date__lte=end)
            return self.rows(
                window, ["event_date", "completed_at", HOUR_ORDER, "zone_id", "id"], hide_completed=False
            )

        name = params.get("filter", "upcoming")
        if name not in FILTERS:
            name = "upcoming"
        return self.rows(filter_q(name, timezone.localdate()), ordering_for(name))


class CalendarView(APIView):
    """
    GET /calendar?from=&to=&zone={id}
      → {"2026-08-19": [{"zone": 3, "color": "#2F7A63"}, ...]}

    달력 표시만 필요하므로 일정 본문을 실어 보내지 않는다.
    주를 넘길 때마다 목록을 다시 받지 않아도 되게 하는 것이 목적이다.

    **색만 주지 않는다.** 색약이면 점 색으로는 어느 공간인지 알 수 없어서, 웹이
    공간 이름의 머리글자를 함께 그린다. 그러려면 어느 공간인지 알아야 한다.
    이름까지 싣지 않는 것은 웹이 공간 목록을 이미 들고 있기 때문이다.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        start, end = parse_range(request.query_params)

        rows = (
            Notice.objects.filter(
                zone_filter(request),
                zone__owner=request.user,
                # 창에 걸치기만 하면 된다. 창 밖에서 시작한 여행도 창 안의 날들에는
                # 점이 찍혀야 한다.
                event_date__lte=end,
                end_date__gte=start,
            )
            # 목록에서 뺀 것은 점도 찍지 않는다. 점은 있는데 눌러도 아래에 없는
            # 날을 만들지 않으려는 것이다. 지난 날은 목록에 남으므로 점도 남긴다.
            .exclude(completed_at__isnull=False, end_date__gte=timezone.localdate())
            .values_list("event_date", "end_date", "zone_id", "zone__color")
            .order_by("event_date", "zone_id")
        )

        # 여러 날짜리는 걸치는 날마다 찍는다. 같은 날 같은 공간은 한 번만 —
        # 점은 개수가 아니라 "어느 공간 일이 있는가" 를 말하기 때문이다.
        seen: set[tuple[str, int]] = set()
        calendar: dict[str, list[dict]] = defaultdict(list)
        for event_date, last_date, zone_id, color in rows:
            day = max(event_date, start)
            while day <= min(last_date, end):
                key = (day.isoformat(), zone_id)
                if key not in seen:
                    seen.add(key)
                    calendar[key[0]].append({"zone": zone_id, "color": color})
                day += dt.timedelta(days=1)

        # 하루 안에서는 공간 순. 긴 일정이 먼저 펼쳐지는 바람에 날마다 점 순서가
        # 달라지면, 같은 공간의 점이 날짜마다 다른 자리에 찍혀 눈이 못 따라간다.
        return Response(
            {day: sorted(items, key=lambda item: item["zone"]) for day, items in calendar.items()}
        )


class NoticeDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /notices/{id}"""

    permission_classes = [IsAuthenticated]
    lookup_url_kwarg = "notice_id"
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_serializer_class(self):
        return NoticeWriteSerializer if self.request.method == "PATCH" else NoticeDetailSerializer

    def get_queryset(self):
        return owned_notices(self.request.user)


class SendAlertView(APIView):
    """
    POST /notices/{notice_id}/alerts/{alert_id}/send — 이 예약을 지금 보낸다.

    상세 화면의 "보내기" 버튼이 쓴다. 시간이 되기 전에 손으로 한 번 밀어보거나,
    실패한 것을 다시 밀 때다.

    보낸 것으로 기록되므로 나중에 예약 시각이 와도 다시 나가지 않는다 —
    같은 알림을 두 번 받는 것이 안 오는 것보다 성가시다.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, notice_id, alert_id):
        alert = get_object_or_404(
            Alert.objects.select_related("notice__zone__owner"),
            pk=alert_id,
            notice_id=notice_id,
            notice__zone__owner=request.user,
        )

        try:
            send_alert(alert)
        except NtfyError as exc:
            # 실패도 Alert 에 남는다(status="fail"). 화면이 그 자리에서 까닭을
            # 보여줄 수 있도록 이유를 그대로 싣는다.
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(AlertItemSerializer(alert).data)


def next_week() -> tuple[dt.date, dt.date]:
    """
    다음 주 월요일과 일요일. 화면의 주간과 같은 경계다 (web: lib/date.ts startOfMonday).

    "오늘부터 며칠" 로 세면 크론이 도는 요일이 하루만 밀려도 담기는 기간이 통째로
    달라진다. 요일에 붙여두면 토요일에 돌든 일요일에 돌든 같은 주가 나온다.
    """
    today = timezone.localdate()
    # weekday(): 월=0 … 일=6. 이번 주 월요일에서 7일 뒤가 다음 주 월요일이다.
    next_monday = today - dt.timedelta(days=today.weekday()) + dt.timedelta(days=7)
    return next_monday, next_monday + dt.timedelta(days=6)


# 일요일마다 다음주 일정을 정리해서 알림을 보낸다.
@api_view(["GET"])
@authentication_classes([])
# @permission_classes([HasAPIKey])
@permission_classes([])
def list_weekly(request):
    """
    GET /notices/weekly → ntfy 로 보낼 묶음 목록

    다음 주 월~일에 걸린 일정을 사용자(ntfy 토픽)별로 하나씩 묶는다.
    화면의 주간도 월~일이라 "다음 주" 가 양쪽에서 같은 기간을 뜻한다.
    """

    start_date, end_date = next_week()
    rows = (
        Notice.objects.select_related("zone", "zone__owner").prefetch_related("alerts")
        # 이 주에 걸치기만 하면 담는다. 지난주에 떠나 이번 주에 돌아오는 여행도
        # 이번 주에 있는 일이다.
        .filter(event_date__lte=end_date,
                end_date__gte=start_date,
                completed_at__isnull=True)
        .order_by("event_date", "event_hour", "zone_id", "id")
    )

    weekly: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for notice in rows:
        zone_name = notice.zone.name
        title = notice.title
        event_hour = f"{str(notice.event_hour).zfill(2)}시 " if notice.event_hour else ""
        span = notice.span_days
        # 여러 날짜리는 걸치는 날마다 적는다. 여행 둘째 날 줄에 아무것도 없으면
        # 그 날은 비어 있는 것으로 읽힌다.
        for day in notice.days(start_date, end_date):
            # 며칠째인지는 창이 아니라 일정의 시작일부터 센다
            nth = (day - notice.event_date).days + 1
            mark = f" ({nth}/{span}일차)" if span > 1 else ""
            weekly[notice.zone.owner.ntfy_topic][day.strftime("%Y-%m-%d")].append(
                f"{event_hour}[{zone_name}] {title}{mark}"
            )

    body = defaultdict(list)
    for ntfy_topic, event_data in weekly.items():
        # 긴 일정이 먼저 펼쳐지면서 날짜 순서가 흐트러진다. 날짜별 묶음이라
        # 날짜가 뒤죽박죽이면 읽는 순서가 사라진다.
        for event_date in sorted(event_data):
            content = event_data[event_date]
            last_index = len(content) - 1
            content = [f" {'└' if index == last_index else '┌' if index == 0 else '├'} {x}"
                       for index, x in enumerate(content)]

            body[ntfy_topic].append(event_date)
            body[ntfy_topic] += content
            body[ntfy_topic].append("\n")

    start_label = start_date.strftime("%Y-%m-%d")
    end_label = end_date.strftime("%Y-%m-%d")
    ntfy_data = list()
    for topic, content in body.items():
        ntfy_data.append({
            "topic": topic,
            "title": f"[{start_label} - {end_label}] 일정",
            "message": re.sub("\n\n", "\n", "\n".join(content)),
            "priority": 3,
        })
    return Response(ntfy_data)


# 일요일마다 다음주 일정을 정리해서 알림을 보낸다.
@api_view(["GET"])
@authentication_classes([])
@permission_classes([HasAPIKey])
def alert_notices(request):
    end_date = timezone.now()
    start_date = end_date - timedelta(hours=6)
    alerts = (
        Alert.objects.select_related("notice", "notice__zone", "notice__zone__owner")
        .filter(notice__completed_at__isnull=True,
                due_at__gte=start_date,
                due_at__lt=end_date).exclude(status="sent")
        .order_by("notice__event_date", "id")
    )

    ready_data = defaultdict(list)
    ids = list()
    for alert in alerts:
        zone_name = alert.notice.zone.name
        title = alert.notice.title
        content = alert.notice.content
        priority = alert.notice.priority
        event_hour = f"{str(alert.notice.event_hour).zfill(2)}시 " if alert.notice.event_hour else ""
        ids.append(alert.id)

        ready_data[alert.notice.zone.owner.ntfy_topic].append({
            "title": f"{event_hour}[{zone_name}] {title}",
            "message": content,
            "priority": priority,
        })

    ntfy_data = list()
    for topic, bodies in ready_data.items():
        for body in bodies:
            ntfy_data.append({
                "topic": topic,
                "title": body["title"],
                "message": body["message"],
                "priority": body["priority"],
            })
    return Response({"data": ntfy_data, "ids": ids})


# 일요일마다 다음주 일정을 정리해서 알림을 보낸다.
@api_view(["PATCH"])
@authentication_classes([])
@permission_classes([HasAPIKey])
def update_alert(request):
    ids = request.data.get("ids")
    if ids:
        Alert.objects.filter(id__in=ids).update(
            status="sent",
            sent_at=timezone.now())
    return Response({"detail": f"{len(ids)} alerts updated."})