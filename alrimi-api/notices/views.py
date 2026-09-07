import datetime as dt
from collections import defaultdict
from datetime import timedelta

from django.db.models import Q
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
            queryset = queryset.exclude(
                completed_at__isnull=False, event_date__gte=timezone.localdate()
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
            return self.rows(
                Q(event_date=day), ["completed_at", "zone_id", "id"], hide_completed=False
            )

        # 주간 스트립은 앞뒤로 넘길 수 있어서 창이 오늘에 고정되지 않는다.
        # 스트립이 그린 기간을 그대로 받아 목록이 같은 창을 보게 한다.
        if params.get("from") or params.get("to"):
            start, end = parse_range(params, require_end=False)
            window = Q(event_date__gte=start)
            if end is not None:
                window &= Q(event_date__lte=end)
            return self.rows(window, ["event_date", "completed_at", "zone_id", "id"], hide_completed=False)

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
                event_date__gte=start,
                event_date__lte=end,
            )
            # 목록에서 뺀 것은 점도 찍지 않는다. 점은 있는데 눌러도 아래에 없는
            # 날을 만들지 않으려는 것이다. 지난 날은 목록에 남으므로 점도 남긴다.
            .exclude(completed_at__isnull=False, event_date__gte=timezone.localdate())
            .values_list("event_date", "zone_id", "zone__color")
            .distinct()
            .order_by("event_date", "zone_id")
        )

        calendar: dict[str, list[dict]] = defaultdict(list)
        for event_date, zone_id, color in rows:
            calendar[event_date.isoformat()].append({"zone": zone_id, "color": color})
        return Response(calendar)


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


# 일요일마다 다음주 일정을 정리해서 알림을 보낸다.
@api_view(["GET"])
@authentication_classes([])
@permission_classes([HasAPIKey])
def list_weekly(request):
    """
    GET /weekly?from=&to=&zone={id} → {"2026-08-19": [...], ...}

    주간 스트립이 쓴다. 달력 점과 달리 일정 본문을 실어 보내야 한다.
    """

    start_date = timezone.now().date() + timedelta(days=1)
    end_date = start_date + timedelta(days=6)
    rows = (
        Notice.objects.select_related("zone", "zone__owner").prefetch_related("alerts")
        .filter(event_date__gte=start_date,
                event_date__lt=end_date,
                completed_at__isnull=True)
        .order_by("event_date", "completed_at", "zone_id", "id")
    )

    weekly: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for notice in rows:
        zone_name = notice.zone.name
        title = notice.title
        event_date = notice.event_date.strftime("%Y-%m-%d")
        weekly[notice.zone.owner.ntfy_topic][event_date].append(f"[{zone_name}] {title}")

    body = defaultdict(list)
    for ntfy_topic, event_data in weekly.items():
        for event_date, content in event_data.items():
            last_index = len(content) - 1
            content = [f" {'└' if index == last_index else '┌' if index == 0 else '├'} {x}"
                       for index, x in enumerate(content)]

            body[ntfy_topic].append(event_date)
            body[ntfy_topic] += content
        body[ntfy_topic] += "\n"

    start_date = start_date.strftime("%Y-%m-%d")
    end_date = end_date.strftime("%Y-%m-%d")
    ntfy_data = list()
    for topic, content in body.items():
        ntfy_data.append({
            "topic": topic,
            "title": f"[{start_date} - {end_date}] 일정",
            "message": "\n".join(content),
            "priority": 3,
        })
    return Response(ntfy_data)


# 일요일마다 다음주 일정을 정리해서 알림을 보낸다.
@api_view(["GET"])
@authentication_classes([])
@permission_classes([HasAPIKey])
def alert_notices(request):
    end_date = timezone.now()
    start_date = end_date - timedelta(hours=2)
    alerts = (
        Alert.objects.select_related("notice", "notice__zone", "notice__zone__owner")
        .filter(notice__completed_at__isnull=True,
                status="",
                due_at__gte=start_date,
                due_at__lt=end_date)
        .order_by("notice__event_date", "id")
    )

    ready_data = defaultdict(list)
    for alert in alerts:
        zone_name = alert.notice.zone.name
        title = alert.notice.title
        content = alert.notice.content
        priority = alert.notice.priority
        ready_data[alert.notice.zone.owner.ntfy_topic].append({
            "id": alert.id,
            "title": f"[{zone_name}] {title}",
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
    return Response(ntfy_data)
