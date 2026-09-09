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
from .models import EventAlert, Event
from .ntfy import NtfyError, send_alert
from .serializers import (
    EventAlertItemSerializer,
    EventDetailSerializer,
    EventListSerializer,
    EventWriteSerializer,
)


def owned_events(user):
    return Event.objects.filter(zone__owner=user).select_related("zone").prefetch_related("alerts")


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
    화면에서 기간과 그 이후로 나눠 그린다. 달력은 그릴 칸이 정해져 있으므로
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


class EventListCreateView(generics.ListCreateAPIView):
    """
    GET  /events?from=&to=&zone={id}          — 임의 기간. 주간 스트립이 쓴다
    GET  /events?date=2026-08-19&zone={id}    — 하루치
    GET  /events?filter=upcoming|later|past&zone={id}
    POST /events                              — 공간은 본문의 zone

    셋이 겹치면 date > from/to > filter 순으로 이긴다. 화면마다 창이 하나뿐이라
    섞이면 목록이 어느 창을 그린 건지 알 수 없어진다.
    """

    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_serializer_class(self):
        return EventWriteSerializer if self.request.method == "POST" else EventListSerializer

    def rows(self, condition, ordering, *, hide_completed: bool = True):
        """
        완료한 일정은 **앞으로의** 목록에서만 뺀다 — 아침에 훑는 것은
        "아직 남은 것"이라서다.

        지난 일정은 기록이다. 끝낸 것을 지워버리면 그 날 무엇이 있었는지가
        틀리게 남으므로 그대로 두고 웹이 흐리게 그린다.
        하루 보기(`?date=`)도 같은 이유로 전부 돌려준다.
        """
        queryset = Event.objects.filter(zone__owner=self.request.user)
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
      → [{"id": 12, "zone": 3, "color": "#2F7A63", "completed": false,
          "event_date": "2026-08-19", "end_date": "2026-08-21", "title": "여행"}, ...]

    **날짜맵이 아니라 일정 목록이다.** 예전에는 날마다 어떤 공간의 점이 찍히는지만
    돌려줬는데, 그러면 사흘짜리 여행이 점 셋으로 흩어져 달력에서 하루짜리 셋과
    구별되지 않는다. 어디서 시작해 어디서 끝나는지를 그대로 주면 웹이 칸을 가로지르는
    띠 하나로 그릴 수 있다.

    본문(내용·알림·우선순위)은 여전히 싣지 않는다. 제목만 얹는 것은 띠에 붙는
    설명(스크린리더가 읽는 이름)이 "일정 1건" 이 아니라 그 일정이어야 하기 때문이다.

    `completed` 도 함께 준다. 여기 담기는 완료 일정은 늘 지난 것이라(아래 exclude),
    이 값이 없으면 웹이 "그냥 지나간 것" 과 "치운 것" 을 같은 흐림으로 그리게 된다.

    **색만 주지 않는다.** 색약이면 색으로는 어느 공간인지 알 수 없어서, 웹이 공간
    목록에서 머리글자를 찾아 붙인다. 그러려면 어느 공간인지 알아야 한다.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        start, end = parse_range(request.query_params)

        rows = (
            Event.objects.filter(
                zone_filter(request),
                zone__owner=request.user,
                # 창에 걸치기만 하면 된다. 창 밖에서 시작한 여행도 창 안의 날들에는
                # 띠가 지나가야 한다.
                event_date__lte=end,
                end_date__gte=start,
            )
            # 목록에서 뺀 것은 달력에도 그리지 않는다. 표시는 있는데 눌러도 아래에
            # 없는 날을 만들지 않으려는 것이다. 지난 날은 목록에 남으므로 함께 남긴다.
            .exclude(completed_at__isnull=False, end_date__gte=timezone.localdate())
            .values_list(
                "id", "event_date", "end_date", "zone_id", "zone__color", "title", "completed_at"
            )
        )

        # 긴 것이 먼저 와야 웹이 띠를 쌓을 때 위 줄부터 채운다. 짧은 것이 위에
        # 앉으면 긴 띠가 그 아래에서 여러 줄로 꺾여 보인다. 날짜끼리 빼는 정렬이라
        # DB 에 맡기지 않고 여기서 한다 — 창 하나치라 길어야 수십 줄이다.
        rows = sorted(
            rows,
            key=lambda row: (row[1], -(row[2] - row[1]).days, row[3], row[0]),
        )

        return Response(
            [
                {
                    "id": event_id,
                    "zone": zone_id,
                    "color": color,
                    "event_date": event_date,
                    "end_date": last_date,
                    "title": title,
                    "completed": completed_at is not None,
                }
                for event_id, event_date, last_date, zone_id, color, title, completed_at in rows
            ]
        )


class EventDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /events/{id}"""

    permission_classes = [IsAuthenticated]
    lookup_url_kwarg = "event_id"
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_serializer_class(self):
        return EventWriteSerializer if self.request.method == "PATCH" else EventDetailSerializer

    def get_queryset(self):
        return owned_events(self.request.user)


class SendEventAlertView(APIView):
    """
    POST /events/{event_id}/alerts/{event_alert_id}/send — 이 예약을 지금 보낸다.

    상세 화면의 "보내기" 버튼이 쓴다. 시간이 되기 전에 손으로 한 번 밀어보거나,
    실패한 것을 다시 밀 때다.

    보낸 것으로 기록되므로 나중에 예약 시각이 와도 다시 나가지 않는다 —
    같은 알림을 두 번 받는 것이 안 오는 것보다 성가시다.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, event_id, event_alert_id):
        alert = get_object_or_404(
            EventAlert.objects.select_related("event__zone__owner"),
            pk=event_alert_id,
            event_id=event_id,
            event__zone__owner=request.user,
        )

        try:
            send_alert(alert)
        except NtfyError as exc:
            # 실패도 EventAlert 에 남는다(status="fail"). 화면이 그 자리에서 까닭을
            # 보여줄 수 있도록 이유를 그대로 싣는다.
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(EventAlertItemSerializer(alert).data)


def next_week() -> tuple[dt.date, dt.date]:
    """
    다음 주 월요일과 일요일. 화면의 주간과 같은 경계다 (web: lib/date.ts startOfMonday).

    "오늘부터 며칠" 로 세면 크론이 도는 요일이 하루만 밀려도 담기는 기간이 통째로
    달라진다. 요일에 붙여두면 토요일에 돌든 일요일에 돌든 같은 주가 나온다.
    """
    today = timezone.localdate()
    # weekday(): 월=0 … 일=6. 이번 주 월요일에서 7일 뒤가 다음 주 월요일이다.
    next_monday = today - dt.timedelta(days=today.weekday()) + dt.timedelta(days=7)
    return today, today + dt.timedelta(days=6)


# 일요일마다 다음 주 일정을 공간별로 정리해 보낸다. 크론이 부른다.
@api_view(["GET"])
@authentication_classes([])
# 열쇠를 빼면 남의 일정 제목과 ntfy 토픽이 그대로 열린다. 로그인으로도 못 들어온다
# — 크론은 사람 계정이 없고, 사람은 이 자리를 볼 일이 없다.
# @permission_classes([HasAPIKey])
@permission_classes([])
def list_weekly(request):
    """
    GET /events/weekly → ntfy 로 보낼 묶음 목록

    **통은 공간마다 하나다.** 한 사람에게 공간이 셋이면 세 통이 간다. 예전에는
    사람마다 한 통으로 몰아 담고 줄마다 `[공간]` 을 붙였는데, 그러면 "어린이집
    것" 하나를 찾으려고 회사 일정까지 다 훑어야 한다. 폰에서는 통 단위로 접히고
    지워지므로, 공간이 통이면 관심 없는 쪽을 통째로 밀어버릴 수 있다.

    토픽은 여전히 사람마다 하나다(`accounts.User.ntfy_topic`). 여러 통이라도
    같은 폰으로 가고, 어느 공간인지는 제목의 `[공간]` 이 말한다.
    """

    start_date, end_date = next_week()
    rows = (
        Event.objects.select_related("zone", "zone__owner").prefetch_related("alerts")
        # 이 주에 걸치기만 하면 담는다. 지난주에 떠나 이번 주에 돌아오는 여행도
        # 이번 주에 있는 일이다.
        .filter(event_date__lte=end_date,
                end_date__gte=start_date,
                completed_at__isnull=True)
        .order_by("event_date", "event_hour", "zone_id", "id")
    )

    # (토픽, 공간) → 날짜 → 그 날 줄들
    weekly: dict[tuple[str, str], dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for event in rows:
        event_hour = f"{str(event.event_hour).zfill(2)}시 " if event.event_hour else ""
        span = event.span_days
        # 여러 날짜리는 걸치는 날마다 적는다. 여행 둘째 날 줄에 아무것도 없으면
        # 그 날은 비어 있는 것으로 읽힌다.
        for day in event.days(start_date, end_date):
            # 며칠째인지는 창이 아니라 일정의 시작일부터 센다
            nth = (day - event.event_date).days + 1
            mark = f" ({nth}/{span}일차)" if span > 1 else ""
            key = (event.zone.owner.ntfy_topic, event.zone.name)
            # 제목이 공간을 말하므로 줄마다 [공간] 을 다시 적지 않는다
            weekly[key][day.strftime("%Y-%m-%d")].append(f"{event_hour}{event.title}{mark}")

    start_label = start_date.strftime("%Y-%m-%d")
    end_label = end_date.strftime("%Y-%m-%d")

    ntfy_data = list()
    # 나가는 순서를 못 박는다. 만난 순서대로 두면 같은 주를 두 번 돌려도 알림이
    # 도착하는 차례가 달라진다.
    for (topic, zone_name), by_date in sorted(weekly.items()):
        content = list()
        # 긴 일정이 먼저 펼쳐지면서 날짜 순서가 흐트러진다. 날짜별 묶음이라
        # 날짜가 뒤죽박죽이면 읽는 순서가 사라진다.
        for event_date in sorted(by_date):
            lines = by_date[event_date]
            last_index = len(lines) - 1
            content.append(event_date)
            content += [f" {'└' if index == last_index else '┌' if index == 0 else '├'} {x}"
                        for index, x in enumerate(lines)]
            content.append("\n")

        ntfy_data.append({
            "topic": topic,
            "title": f"[{zone_name}] {start_label} - {end_label}",
            "message": re.sub("\n\n", "\n", "\n".join(content)),
            "priority": 3,
        })
    return Response(ntfy_data)


@api_view(["GET"])
@authentication_classes([])
# @permission_classes([HasAPIKey])
@permission_classes([])
def list_due_alerts(request):
    """
    GET /events/alerts → 지금 나가야 할 예약들

    매시 돈다. 지난 6시간 안에 시각이 된 것 중 아직 안 나간 것을 담는다 —
    크론이 한 번 걸러도 다음 시간에 따라잡으라는 폭이다.

    **일정 하나에 알림도 한 번뿐이다.** 예약은 시작일 기준으로만 잡히므로
    (`due_at_for`), 사흘짜리 여행이라도 여기 담기는 것은 그 예약들뿐이고
    둘째·마지막 날에는 아무것도 생기지 않는다. 같은 일로 며칠 내리 알림이 오면
    받는 쪽은 어느 것이 진짜 챙길 날인지 알 수 없다.

    **통은 공간마다 하나다.** 주간 정리와 같은 규칙이다 — 예약 하나에 한 통씩
    보내면 같은 시각에 잡아둔 예약 다섯 개가 알림 다섯 개로 쏟아진다. 공간으로
    묶으면 "어린이집 세 건" 하나로 온다.

    **한 통 안은 날짜로 나눈다.** 한 번에 담기는 것이 같은 날 일정이라는 보장이
    없다 — "3일 전" 과 "1일 전" 은 서로 다른 날을 가리키면서도 같은 시각에 시각이
    될 수 있다. 날짜를 안 적으면 받는 쪽은 다섯 줄이 언제 것인지 모른 채 읽는다.

    `ids` 는 묶기 전의 예약 전부다. 크론이 밀어 보낸 뒤 이 목록으로 발송을
    찍으므로(`update_alert`), 통이 몇 개로 묶였는지와는 상관없이 낱개로 남아야 한다.
    """
    end_date = timezone.now()
    start_date = end_date - timedelta(hours=6)
    alerts = (
        EventAlert.objects.select_related("event", "event__zone", "event__zone__owner")
        .filter(event__completed_at__isnull=True,
                due_at__gte=start_date,
                due_at__lt=end_date).exclude(status="sent")
        .order_by("event__event_date", "event__event_hour", "id")
    )

    # (토픽, 공간) → 일정 날짜 → 그 날 일정들
    grouped: dict[tuple[str, str], dict[dt.date, dict[int, Event]]] = defaultdict(
        lambda: defaultdict(dict)
    )
    ids = list()
    for alert in alerts:
        event = alert.event
        # 한 일정에 걸린 예약 둘이 같은 창에 들어올 수 있다 — 크론이 한 번 걸러
        # 따라잡을 때 "1일 전" 과 "당일" 이 함께 온다. 찍을 것은 둘 다지만
        # 적을 것은 하나다(id 로 눌러 담는다).
        grouped[(event.zone.owner.ntfy_topic, event.zone.name)][event.event_date][event.id] = event
        ids.append(alert.id)

    def head(event) -> str:
        """시각 + 제목. 잠금화면의 제목 줄에 들어갈 만큼만이다."""
        event_hour = f"{str(event.event_hour).zfill(2)}시 " if event.event_hour else ""
        return f"{event_hour}{event.title}"

    ntfy_data = list()
    # 나가는 순서를 못 박는다. 만난 순서대로 두면 같은 시각에 돌려도 알림이
    # 도착하는 차례가 달라진다.
    for (topic, zone_name), by_date in sorted(grouped.items()):
        blocks = list()
        events = list()
        for event_date in sorted(by_date):
            lines = [event_date.strftime("%Y-%m-%d")]
            for event in by_date[event_date].values():
                events.append(event)
                lines.append(f" - {head(event)}")
                # 내용은 그 일정에 딸린 것이라 한 칸 더 들여 매단다. 같은 줄에
                # 이어 붙이면 제목이 어디서 끝나는지 안 보인다.
                if event.content:
                    lines.append(f"   └ {event.content}")
            blocks.append("\n".join(lines))

        ntfy_data.append({
            "topic": topic,
            # 한 건이면 제목이 그 일정을 그대로 말한다. "1건" 으로 접으면 잠금화면에서
            # 무엇을 챙기라는 건지 열어봐야 안다. 여럿을 한 제목에 우겨넣으면 잘려서
            # 어느 것도 못 읽으므로 그때는 개수만 적고 본문에 맡긴다.
            "title": (
                f"[{zone_name}] {head(events[0])}"
                if len(events) == 1
                else f"[{zone_name}] 일정 {len(events)}건"
            ),
            # 날짜 묶음 사이는 한 줄 띄운다. 붙여두면 날짜 줄이 앞 묶음의 꼬리로 읽힌다.
            "message": "\n\n".join(blocks),
            # 한 통에 섞였으니 가장 급한 것을 따른다. 낮은 쪽을 따르면 긴급으로
            # 잡아둔 일정이 방해금지에 막혀 조용히 도착한다.
            "priority": max(event.priority for event in events),
        })

    return Response({"data": ntfy_data, "ids": ids})


@api_view(["PATCH"])
@authentication_classes([])
@permission_classes([HasAPIKey])
def update_alert(request):
    """
    PATCH /events/alerts/status  {"ids": [...]}

    크론이 실제로 밀어 보낸 뒤 부른다. 여기서 발송으로 찍혀야 다음 시간에
    같은 예약이 다시 담기지 않는다.
    """
    ids = request.data.get("ids")
    if ids:
        EventAlert.objects.filter(id__in=ids).update(
            status="sent",
            sent_at=timezone.now())
    return Response({"detail": f"{len(ids)} alerts updated."})
