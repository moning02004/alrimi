import datetime as dt
import re
from collections import defaultdict
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import F, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date as parse_date_string
from rest_framework import generics, status
from rest_framework.authentication import TokenAuthentication, SessionAuthentication
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import SAFE_METHODS, AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import HasAPIKey
from zones.models import editable_zones, recipients, visible_zones

from .filters import FILTERS, filter_q, ordering_for
from .models import EventAlert, Event, Priority
from .notify import new_event as notify_new_event
from .ntfy import NtfyError, send_alert
from .webpush import send_alert as push_alert, send_to_user
from .serializers import (
    EventAlertItemSerializer,
    EventDetailSerializer,
    EventListSerializer,
    EventWriteSerializer,
)


def visible_events(user):
    """
    볼 수 있는 일정 — 내 공간과 함께 보는 공간의 것. 목록·달력·상세·검색이 쓴다.

    고치고 지우는 쪽은 `deletable_events`·`EventDetailView` 가 따로 좁힌다(`editable_zones`).
    보는 사람은 보기와 알림만 함께한다(`zones.models.Sharing`).
    """
    return Event.objects.filter(zone__in=visible_zones(user))


def deletable_events(user):
    """지울 수 있는 일정. 알림까지 딸려 지워지므로 미리 불러올 것이 없다."""
    return Event.objects.filter(zone__in=editable_zones(user))


class IsEventOwnerOrReadOnly(BasePermission):
    """
    받은 공간의 일정은 보기만 한다 — 주인이 "함께 보는 사람도 일정 추가·수정" 을 켜두지 않았으면.
    """

    message = "이 공간의 일정은 주인만 고칠 수 있어요."

    def has_object_permission(self, request, view, event):
        if request.method in SAFE_METHODS or event.zone.owner_id == request.user.id:
            return True
        return editable_zones(request.user).filter(pk=event.zone_id).exists()


def zone_filter(request) -> Q:
    """
    목록을 좁히는 선택 필터. 없으면 전체 공간.

    - `?zone={id}`  — 공간 하나
    - `?owner={id}` — 그 사람의 공간 전부(내가 볼 수 있는 것만). 받은 공간은 웹이 사람마다
      칩 하나로 묶어 보여주므로, 그 칩을 누르면 이 필터로 온다.

    둘이 함께 오면 zone 이 이긴다 — 더 좁은 쪽이다.
    """
    params = request.query_params
    for key, field in (("zone", "zone_id"), ("owner", "zone__owner_id")):
        raw = params.get(key)
        if not raw:
            continue
        try:
            return Q(**{field: int(raw)})
        except ValueError:
            raise ValidationError({key: "id는 정수여야 합니다."}) from None
    return Q()


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


#  검색 결과는 여기까지. 이보다 많으면 찾는 말을 더 적는 편이 빠르다.
SEARCH_LIMIT = 100


class EventListCreateView(generics.ListCreateAPIView):
    """
    GET  /events?from=&to=&zone={id}          — 임의 기간. 주간 스트립이 쓴다
    GET  /events?date=2026-08-19&zone={id}    — 하루치
    GET  /events?filter=upcoming|later|past|held&zone={id}
    GET  /events?q=소풍&zone={id}             — 제목·내용 검색 (최근 날짜부터 100건)
    POST /events                              — 공간은 본문의 zone

    `filter=held` 만 보류함이다. 나머지 창은 전부 보류를 빼고 본다 — 보류는
    "아직 날짜가 없는 것" 이라 날짜를 축으로 삼는 목록 어디에도 자리가 없다.

    넷이 겹치면 q > date > from/to > filter 순으로 이긴다. 화면마다 창이 하나뿐이라
    섞이면 목록이 어느 창을 그린 건지 알 수 없어진다.
    """

    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_serializer_class(self):
        return EventWriteSerializer if self.request.method == "POST" else EventListSerializer

    def perform_create(self, serializer):
        """
        만든 뒤 **함께 보는 사람에게** 알린다. 반복으로 여러 건이 생겨도 알림은 한 통이다 —
        매주 체육복을 넣었다고 알림이 아홉 번 오면 그게 더 성가시다.
        """
        event = serializer.save()
        notify_new_event(event, self.request.user)

    def rows(self, condition, ordering, *, hide_completed: bool = True, held: bool = False):
        """
        완료한 일정은 **앞으로의** 목록에서만 뺀다 — 아침에 훑는 것은
        "아직 남은 것"이라서다.

        지난 일정은 기록이다. 끝낸 것을 지워버리면 그 날 무엇이 있었는지가
        틀리게 남으므로 그대로 두고 웹이 흐리게 그린다.
        하루 보기(`?date=`)도 같은 이유로 전부 돌려준다.

        **보류한 일정은 완료와 다르게 어디에도 남기지 않는다.** 완료는 "그 날
        있었던 일"이라 지난 목록에 기록으로 남지만, 보류는 "그 날 없던 일로 했고
        아직 다시 안 잡은 것"이다. 날짜를 축으로 삼는 목록에 흐리게라도 남으면
        그 날 무엇이 있었는지가 틀리게 읽힌다. 그래서 `held` 가 이 갈림을 통째로
        가른다 — 보류함만 True 로 부르고, 나머지는 전부 보류를 빼고 본다.
        """
        queryset = visible_events(self.request.user).filter(held_at__isnull=not held)
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

    def search(self, raw: str):
        """
        제목·내용에서 찾는다. 띄어 쓴 말은 **모두** 들어 있어야 한다("소풍 도시락").

        날짜 창이 없다 — "소풍 언제였지" 도 "다음 소풍 언제지" 도 여기로 온다. 그래서
        완료·보류·지난 것을 가리지 않고 다 담고, 가까운 미래가 위에 오도록 날짜가 늦은
        것부터가 아니라 **오늘에서 가까운 것부터** 세운다: 앞으로의 일정(날짜순) 다음에
        지난 일정(최근순).
        """
        terms = raw.split()
        if not terms or len(raw) > 50:
            raise ValidationError({"q": "찾을 말을 50자 안으로 적어주세요."})

        condition = Q()
        for term in terms:
            condition &= Q(title__icontains=term) | Q(content__icontains=term)

        today = timezone.localdate()
        queryset = (
            visible_events(self.request.user)
            .filter(zone_filter(self.request), condition)
            .select_related("zone")
            .prefetch_related("alerts")
        )
        upcoming = list(queryset.filter(end_date__gte=today).order_by("event_date", "id")[:SEARCH_LIMIT])
        past = list(
            queryset.filter(end_date__lt=today).order_by("-event_date", "-id")[: SEARCH_LIMIT - len(upcoming)]
        )
        return upcoming + past

    def get_queryset(self):
        params = self.request.query_params

        if "q" in params:
            return self.search(params["q"])

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
        held = name == "held"
        # 보류함은 날짜가 아니라 보류 여부로 가른다. 여기 담기는 것은 전부
        # "지금은 일정이 아닌 것" 이라 앞으로의 목록처럼 완료를 걸러낼 것도 없다.
        return self.rows(
            filter_q(name, timezone.localdate()),
            ordering_for(name),
            hide_completed=not held,
            held=held,
        )


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
            visible_events(request.user).filter(
                zone_filter(request),
                # 창에 걸치기만 하면 된다. 창 밖에서 시작한 여행도 창 안의 날들에는
                # 띠가 지나가야 한다.
                event_date__lte=end,
                end_date__gte=start,
                # 보류한 일정은 그 날 있을 일이 아니다. 띠가 남아 있으면 눌러서
                # 간 자리(하루 보기)에는 없어서, 달력과 목록이 서로 다른 말을 한다.
                held_at__isnull=True,
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

    permission_classes = [IsAuthenticated, IsEventOwnerOrReadOnly]
    lookup_url_kwarg = "event_id"
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_serializer_class(self):
        return EventWriteSerializer if self.request.method == "PATCH" else EventDetailSerializer

    def get_queryset(self):
        # 함께 보는 공간의 일정도 찾는다. 남의 것이 404 가 아니라 403 이어야 웹이
        # "주인만 고칠 수 있다" 고 말할 수 있다 — 권한은 위의 permission 이 가른다.
        return (
            visible_events(self.request.user)
            .select_related("zone", "series")
            .prefetch_related("alerts")
        )

    def perform_destroy(self, instance):
        """
        `?scope=following` 이면 같은 반복의 뒤따르는 일정까지 지운다. 앞선 날은
        남는다 — 지난 기록이거나, 이미 따로 챙기고 있는 날이다.
        """
        scope = self.request.query_params.get("scope", "this")
        if scope not in ("this", "following"):
            raise ValidationError({"scope": "this 또는 following 이어야 합니다."})

        if scope == "following" and instance.series_id:
            with transaction.atomic():
                Event.objects.filter(
                    series_id=instance.series_id, event_date__gte=instance.event_date
                ).delete()
            return
        instance.delete()


class BulkDeleteEventsView(APIView):
    """
    POST /events/bulk-delete  {"ids": [1, 2, 3]} → {"deleted": 3}

    목록에서 여럿을 골라 지울 때 쓴다. 웹이 DELETE 를 개수만큼 따로 보내면 모바일 망에서
    일부만 실패하기 쉽고, 몇 개가 남았는지 사람이 다시 확인해야 한다. 한 요청 안에서
    한꺼번에 지우므로 전부 지워지거나 하나도 안 지워진다.

    **남의 일정 id 는 조용히 건너뛴다.** 없는 것과 남의 것을 구분해 알려주면 그 id 가
    있는지를 떠볼 수 있다. 웹은 `deleted` 를 보낸 개수와 비교해 빠진 것을 알린다.

    DELETE 가 아니라 POST 인 까닭은 본문 때문이다 — 본문을 실은 DELETE 는 프록시에
    따라 본문이 떨어진다.
    """

    permission_classes = [IsAuthenticated]
    MAX_IDS = 500

    def post(self, request):
        ids = request.data.get("ids")
        if (
            not isinstance(ids, list)
            or not ids
            or not all(isinstance(i, int) and not isinstance(i, bool) for i in ids)
        ):
            raise ValidationError({"ids": "지울 일정 id 목록(정수)이 필요합니다."})
        if len(ids) > self.MAX_IDS:
            raise ValidationError({"ids": f"한 번에 {self.MAX_IDS}개까지 지울 수 있습니다."})

        with transaction.atomic():
            events = deletable_events(request.user).filter(id__in=set(ids))
            deleted = events.count()
            # 일정마다 신호(구글 캘린더 반영)가 나가도록 쿼리셋 delete 를 쓴다
            events.delete()

        return Response({"deleted": deleted})


class SendEventAlertView(APIView):
    """
    POST /events/{event_id}/alerts/{event_alert_id}/send — 이 예약을 지금 보낸다.

    상세 화면의 "보내기" 버튼이 쓴다. 시간이 되기 전에 손으로 한 번 밀어보거나,
    실패한 것을 다시 밀 때다.

    보낸 것으로 기록되므로 나중에 예약 시각이 와도 다시 나가지 않는다 —
    같은 알림을 두 번 받는 것이 안 오는 것보다 성가시다.

    **웹 푸시가 먼저고, ntfy 는 그 뒤를 받는다.** 예전에는 둘을 나란히 보냈는데
    그러면 두 길을 다 켜둔 사람은 같은 알림을 폰에서 두 번 받는다 — 브라우저 알림과
    ntfy 알림이 같은 문구로 나란히 쌓인다. 웹 푸시로 한 대라도 닿았으면 거기서 멈추고,
    닿은 기기가 하나도 없을 때만 ntfy 를 부른다.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, event_id, event_alert_id):
        alert = get_object_or_404(
            EventAlert.objects.select_related("event__zone__owner").prefetch_related(
                "event__zone__owner__viewers__viewer", "event__zone__mutes"
            ),
            pk=event_alert_id,
            event_id=event_id,
            event__zone__in=editable_zones(request.user),
        )

        # 공간을 함께 보는 사람에게도 보낸다. 사람마다 웹 푸시 → 안 닿으면 ntfy 순서다.
        reached = 0
        errors: list[NtfyError] = []
        for person in recipients(alert.event.zone):
            if push_alert(alert, person):
                # 닿았으면 발송이다. ntfy 를 건너뛴 것이지 못 보낸 것이 아니다.
                reached += 1
                continue
            try:
                send_alert(alert, person)
            except NtfyError as exc:
                errors.append(exc)
            else:
                reached += 1

        # 한 사람에게라도 닿았으면 발송으로 찍는다. 예약은 하나라 사람마다 나눠 적을
        # 자리가 없고, 못 찍으면 예약 시각에 닿은 사람까지 한 번 더 받는다.
        if reached:
            alert.mark_sent()
            return Response(EventAlertItemSerializer(alert).data)

        # 모두에게 두 길이 다 막혔다. 실패도 EventAlert 에 남으므로(status="fail") 화면이
        # 그 자리에서 까닭을 보여줄 수 있도록 이유를 그대로 싣는다.
        alert.mark_failed()
        return Response({"detail": str(errors[0])}, status=status.HTTP_502_BAD_GATEWAY)


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


# 일요일마다 다음 주 일정을 공간별로 정리해 보낸다. 크론이 부른다.
@api_view(["GET"])
@authentication_classes([])
# 열쇠를 빼면 남의 일정 제목과 ntfy 토픽이 그대로 열린다. 로그인으로도 못 들어온다
# — 크론은 사람 계정이 없고, 사람은 이 자리를 볼 일이 없다.
@permission_classes([HasAPIKey])
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
        Event.objects.select_related("zone", "zone__owner")
        .prefetch_related("alerts", "zone__owner__viewers__viewer", "zone__mutes")
        # 이 주에 걸치기만 하면 담는다. 지난주에 떠나 이번 주에 돌아오는 여행도
        # 이번 주에 있는 일이다.
        .filter(event_date__lte=end_date,
                end_date__gte=start_date,
                completed_at__isnull=True,
                # 보류한 것은 다음 주에 할 일이 아니다
                held_at__isnull=True)
        .order_by("event_date", "event_hour", "zone_id", "id")
    )

    # (토픽, 공간) → 날짜 → 그 날 줄들
    weekday_marks = ['월', '화', '수', '목', '금', '토', '일']
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
            # 제목이 공간을 말하므로 줄마다 [공간] 을 다시 적지 않는다
            weekday = day.weekday()
            weekday_mark = f" ({weekday_marks[weekday]})"
            line = f"{event_hour}{event.title}{mark}"
            # 함께 보는 사람도 같은 정리를 받는다. 통은 받는 사람마다 따로다
            for person in recipients(event.zone):
                key = (person.ntfy_topic, event.zone.name)
                weekly[key][f'{day.strftime("%Y-%m-%d")}{weekday_mark}'].append(line)

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
            "title": f"[{zone_name}] {start_label} ~ {end_label} 일정",
            "message": re.sub("\n\n", "\n", "\n".join(content)),
            "priority": 3,
            "actions": [
                {
                    "action": "view",
                    "label": "웹으로 이동",
                    "url": settings.WEB_ORIGIN,
                }
            ]
        })
    return Response(ntfy_data)


def due_alert_groups(alerts) -> list[dict]:
    """
    예약들을 **(사람, 공간)** 으로 묶고 통마다 제목·본문·우선순위를 짓는다.

    ntfy 와 웹 푸시가 같은 문구를 쓰도록 여기 한 곳에서만 만든다 — 두 길이 같은
    예약을 두고 다른 말을 하면, 폰에서 나란히 받았을 때 어느 쪽이 맞는지 알 수 없다.

    **통은 공간마다 하나다.** 예약 하나에 한 통씩 보내면 같은 시각에 잡아둔 예약
    다섯 개가 알림 다섯 개로 쏟아진다. 공간으로 묶으면 "어린이집 3건" 하나로 온다.

    **한 통 안은 날짜로 나눈다.** 한 번에 담기는 것이 같은 날 일정이라는 보장이
    없다 — "3일 전" 과 "1일 전" 은 서로 다른 날을 가리키면서도 같은 시각에 시각이
    될 수 있다. 날짜를 안 적으면 받는 쪽은 다섯 줄이 언제 것인지 모른 채 읽는다.

    `ids` 는 그 통에 담긴 예약들이다. 발송을 찍는 단위는 여전히 낱개라
    (`update_alert`), 묶였다고 뭉뚱그리지 않는다.
    """
    # (사람, 공간) → 일정 날짜 → 그 날 일정들
    grouped: dict[tuple, dict[dt.date, dict[int, Event]]] = defaultdict(lambda: defaultdict(dict))
    ids: dict[tuple, list[int]] = defaultdict(list)

    for alert in alerts:
        event = alert.event
        # 공간을 함께 보는 사람도 같은 알림을 받는다. 통은 받는 사람마다 따로다 —
        # 토픽과 기기가 사람마다 다르다.
        for person in recipients(event.zone):
            key = (person.pk, person, event.zone.name)
            # 한 일정에 걸린 예약 둘이 같은 창에 들어올 수 있다 — 크론이 한 번 걸러
            # 따라잡을 때 "1일 전" 과 "당일" 이 함께 온다. 찍을 것은 둘 다지만
            # 적을 것은 하나다(id 로 눌러 담는다).
            grouped[key][event.event_date][event.id] = event
            ids[key].append(alert.id)

    def head(event) -> str:
        """시각 + 제목. 잠금화면의 제목 줄에 들어갈 만큼만이다."""
        event_hour = f"{str(event.event_hour).zfill(2)}시 " if event.event_hour else ""
        return f"{event_hour}{event.title}"

    groups = []
    # 나가는 순서를 못 박는다. 만난 순서대로 두면 같은 시각에 돌려도 알림이
    # 도착하는 차례가 달라진다. 사람 객체는 정렬 기준이 못 되므로 id 로 줄 세운다.
    weekday_marks = ['월', '화', '수', '목', '금', '토', '일']
    for key in sorted(grouped, key=lambda k: (k[0], k[2])):
        recipient, zone_name = key[1], key[2]
        by_date = grouped[key]
        blocks = []
        events = []
        for event_date in sorted(by_date):
            weekday = event_date.weekday()
            weekday_mark = f" ({weekday_marks[weekday]})"

            lines = [f'{event_date.strftime("%Y-%m-%d")}{weekday_mark}']
            for event in by_date[event_date].values():
                events.append(event)
                lines.append(f" - {head(event)}")
                # 내용은 그 일정에 딸린 것이라 한 칸 더 들여 매단다. 같은 줄에
                # 이어 붙이면 제목이 어디서 끝나는지 안 보인다.
                if event.content:
                    lines.append(f"   └ {event.content}")
            blocks.append("\n".join(lines))

        groups.append({
            # 받는 사람. 공간 주인일 수도, 함께 보는 사람일 수도 있다
            "recipient": recipient,
            "zone_name": zone_name,
            # 제목은 건수만 적는다. 한 건이어도 같다 — 무엇인지는 본문이 말한다.
            "title": f"[{zone_name}] 일정 {len(events)}건",
            # 날짜 묶음 사이는 한 줄 띄운다. 붙여두면 날짜 줄이 앞 묶음의 꼬리로 읽힌다.
            "message": "\n\n".join(blocks),
            # 일정마다 중요도를 고르지 않는다. 모두 일반 등급으로 나간다.
            "priority": Priority.NORMAL,
            "ids": ids[key],
            # 알림을 눌렀을 때 열 화면을 고르는 데 쓴다(`push_group`)
            "event_ids": [event.id for event in events],
        })

    return groups


def due_alerts(*, ids: list[int] | None = None):
    """
    지금 나가야 할 예약들. `ids` 를 주면 그 예약들만 (크론이 되짚어 부를 때).

    시각 창은 지난 6시간이다 — 크론이 한 번 걸러도 다음 시간에 따라잡으라는 폭이다.

    **일정 하나에 알림도 한 번뿐이다.** 예약은 시작일 기준으로만 잡히므로
    (`due_at_for`), 사흘짜리 여행이라도 여기 담기는 것은 그 예약들뿐이고
    둘째·마지막 날에는 아무것도 생기지 않는다. 같은 일로 며칠 내리 알림이 오면
    받는 쪽은 어느 것이 진짜 챙길 날인지 알 수 없다.
    """
    queryset = EventAlert.objects.select_related(
        "event", "event__zone", "event__zone__owner"
    ).prefetch_related(
        # 받는 사람을 고를 때(`recipients`) 공간마다 쿼리를 다시 내지 않도록
        "event__zone__owner__viewers__viewer",
        # 알림을 꺼둔 사람은 받는 사람에서 빠진다(`recipients`)
        "event__zone__mutes",
        # 보류한 일정의 예약은 나가지 않는다. 다시 잡을 때 `revive_alerts` 가
        # 새 날짜로 되살리므로, 여기서 빼도 알림이 영영 사라지지는 않는다.
    ).filter(event__completed_at__isnull=True, event__held_at__isnull=True)

    if ids is None:
        end_date = timezone.now()
        queryset = queryset.filter(due_at__gte=end_date - timedelta(hours=6), due_at__lt=end_date)
        queryset = queryset.exclude(status="sent")
    else:
        # 크론이 방금 `GET /events/alerts` 로 받아간 목록이다. 창을 다시 재면 그 사이
        # 시각이 지난 예약이 끼어들어, ntfy 로 나간 것과 웹 푸시로 나간 것이 어긋난다.
        # 발송 표시(`update_alert`)는 이 뒤에 찍히므로 status 로 다시 거르지 않는다.
        queryset = queryset.filter(id__in=ids)

    return queryset.order_by("event__event_date", "event__event_hour", "id")


def alert_ids(groups) -> list[int]:
    """
    묶음들에 담긴 예약 id. 공간을 여럿이 함께 보면 같은 예약이 받는 사람마다 한 번씩
    담기므로 겹친 것을 한 번만 남긴다(순서는 처음 나온 대로).
    """
    return list(dict.fromkeys(alert_id for group in groups for alert_id in group["ids"]))


def ntfy_payload(group) -> dict:
    """묶음 하나를 n8n 이 그대로 ntfy 로 POST 할 수 있는 모양으로."""
    return {
        "topic": group["recipient"].ntfy_topic,
        "title": group["title"],
        "message": group["message"],
        "priority": group["priority"],
        "actions": [
            {
                "action": "view",
                "label": "웹으로 이동",
                "url": settings.WEB_ORIGIN,
            }
        ],
    }


def push_group(group) -> int:
    """묶음 하나를 웹 푸시로 민다. 돌려주는 값은 실제로 닿은 기기 수다."""
    return send_to_user(
        group["recipient"],
        title=group["title"],
        message=group["message"],
        priority=group["priority"],
        # 같은 묶음이 두 번 도착해도 알림은 하나로 덮인다. 크론이 한 번 걸러
        # 따라잡을 때 앞서 나간 것과 겹칠 수 있다.
        tag=f"due-{min(group['ids'])}",
        # 한 건이면 누르자마자 그 일정이 열린다. 여럿이면 홈에서 훑는다.
        path=f"/events/{group['event_ids'][0]}" if len(group["event_ids"]) == 1 else "/home",
    )


@api_view(["GET"])
@authentication_classes([])
@permission_classes([HasAPIKey])
def list_due_alerts(request):
    """
    GET /events/alerts → 지금 나가야 할 예약들. **읽기만 한다.**

    매시 도는 한 바퀴의 첫 걸음이다. 보내는 것은 다음 걸음(`push_due_alerts`)이
    맡는다 — 조회와 발송을 한 자리에 합치면 워크플로만 봐서는 언제 알림이
    나가는지 알 수 없다.

    `data` 는 **묶음 전부**다. 웹 푸시로 닿을 것까지 들어 있으므로 **여기 것을
    ntfy 로 쏘면 안 된다** — 두 길을 다 켜둔 사람이 같은 알림을 두 번 받는다.
    ntfy 로 쏠 것은 `POST /events/alerts/push` 가 걸러 돌려주는 쪽이다.
    이 자리의 `data` 는 "이번 시간에 무엇이 나가나" 를 눈으로 보는 용도다.

    `ids` 는 묶기 전의 예약 전부다 — 통이 몇 개로 묶였는지와 상관없이 낱개로
    남아야 다음 두 걸음이 같은 것을 가리킨다.
    """
    groups = due_alert_groups(due_alerts())

    return Response({
        "data": [ntfy_payload(group) for group in groups],
        "ids": alert_ids(groups),
    })


@api_view(["POST"])
@authentication_classes([])
@permission_classes([HasAPIKey])
def push_due_alerts(request):
    """
    POST /events/alerts/push  {"ids": [...]}
      → {"data": [웹 푸시로 못 닿은 묶음만], "ids": [...]}

    **웹 푸시를 보내고, 그러고도 못 닿은 것만 돌려준다.** 크론은 `GET /events/alerts`
    로 받아간 ids 를 그대로 되돌려주고, 돌아온 `data` 만 ntfy 로 쏜 뒤 `ids` 로
    발송을 찍는다. 한 바퀴는 이렇게 돈다:

        GET /events/alerts → POST /events/alerts/push (웹 푸시 발송)
        → (n8n 이 돌아온 data 만 ntfy 발행) → PATCH /events/alerts/status

    **왜 n8n 이 웹 푸시를 직접 못 쏘는가.** 본문을 기기의 공개키로 암호화해서 보내야
    한다(VAPID + aes128gcm). 그 열쇠는 이 서버에만 있으므로, ntfy 처럼 "보낼 내용을
    건네주면 남이 쏘는" 방식이 성립하지 않는다.

    **왜 두 길로 나란히 보내지 않는가.** 두 길을 다 켜둔 사람은 같은 알림을 폰에서
    두 번 받는다 — 브라우저 알림과 ntfy 알림이 같은 문구로 나란히 쌓인다. 웹 푸시로
    한 대라도 닿았으면 그 묶음은 `data` 에서 빠지고, ntfy 는 닿은 기기가 하나도
    없을 때만(안 켰거나·구독이 죽었거나·서버에 VAPID 키가 없거나) 뒤를 받는다.

    **돌려주는 `ids` 는 걸러내지 않는다.** 웹 푸시로 나갔든 ntfy 로 나갔든 발송으로
    찍힐 것은 같아서다. 여기서 빼면 웹 푸시로 받은 예약이 pending 으로 남아 다음
    시간에 ntfy 로 한 번 더 나간다.

    **발송 표시는 여기서 하지 않는다.** 찍는 곳은 `update_alert` 한 곳뿐이다.
    여기서 찍으면 크론이 ntfy 를 쏘기도 전에 나간 것으로 남고, 그 사이에 끊기면
    웹 푸시로 못 닿은 사람은 아무 데서도 못 받는다.
    """
    ids = request.data.get("ids") or []
    if not ids:
        return Response({"data": [], "ids": []})

    groups = due_alert_groups(due_alerts(ids=ids))

    return Response({
        "data": [ntfy_payload(group) for group in groups if not push_group(group)],
        "ids": alert_ids(groups),
    })


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
