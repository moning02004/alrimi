import datetime as dt

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import HasAPIKey

from .models import Kind, MarkStyle, SpecialDay, styles_for
from .palette import PALETTE
from .serializers import (
    MarkStyleWriteSerializer,
    SpecialDaySerializer,
    SyncSerializer,
    find_days,
    parse_day,
)

#  달력이 한 번에 묻는 폭. 월간 그리드가 42일이라 넉넉하다.
MAX_RANGE_DAYS = 400


class SpecialDayListView(APIView):
    """
    GET /special-days?from=2026-09-01&to=2026-10-11
      → [{"date": "2026-09-16", "kind": "holiday", "name": "추석"},
         {"date": "2026-09-23", "kind": "term",    "name": "추분"}, ...]

    **읽기 전용이다.** 사용자가 고칠 길은 어디에도 없다 — 넣고 빼는 것은 운영이
    부르는 `POST /special-days/sync` 하나뿐이다.

    **꺼둔 종류도 함께 준다.** 거르는 일은 웹이 한다(`GET /special-days/styles`).
    서버에서 걸러 주면 설정에서 절기를 켜는 순간 달력을 다시 받아와야 하는데,
    같은 자료를 두 번 받을 까닭이 없다.

    `/calendar` 에 얹지 않고 따로 둔다. 특일은 한 해에 한 번 바뀔까 말까인데 일정은
    수시로 바뀌어서, 한 응답에 담으면 일정 하나 고칠 때마다 이쪽까지 다시 받게 된다.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        if not params.get("from") or not params.get("to"):
            raise ValidationError({"detail": "from 과 to 가 필요합니다."})

        start = parse_day(params["from"])
        end = parse_day(params["to"])
        if end < start:
            raise ValidationError({"detail": "to 는 from 보다 앞설 수 없습니다."})
        if (end - start).days > MAX_RANGE_DAYS:
            raise ValidationError({"detail": f"범위는 최대 {MAX_RANGE_DAYS}일입니다."})

        rows = SpecialDay.objects.filter(date__gte=start, date__lte=end)
        return Response(SpecialDaySerializer(rows, many=True).data)


class PaletteView(APIView):
    """
    GET /special-days/palette → [{"color": "#DC2626", "name": "빨강"}, ...]

    고를 수 있는 색. 공간 팔레트(`/zones/palette`)와 따로다 — 그쪽은 칩 배경이고
    이쪽은 흰 바탕의 작은 글씨라 기준이 다르다(`palette.py` 참고).

    이름을 함께 주는 것은 견본만으로는 무엇을 고른 건지 말로 확인할 수 없고,
    화면 낭독기에는 아예 안 읽히기 때문이다.
    """

    permission_classes = [IsAuthenticated]

    def get(self, _request):
        return Response(PALETTE)


class MarkStyleListView(APIView):
    """
    GET /special-days/styles
      → [{"kind": "holiday", "label": "공휴일", "color": "#DC2626"}, ...]

    보는 사람이 정한 종류별 색. 저장된 줄이 없는 종류는 기본값으로 채워 **항상
    종류 수만큼** 준다 — 받는 쪽이 "없으면 기본값" 규칙을 다시 적지 않아도
    되도록(`models.styles_for`).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(styles_for(request.user))


class MarkStyleDetailView(APIView):
    """
    PATCH /special-days/styles/{kind}  {"color": "#2563EB"}
      → 고친 뒤의 전체 목록

    **고친 줄 하나가 아니라 전체를 돌려준다.** 웹이 들고 있는 것이 목록이라,
    한 줄만 받으면 그 자리에 끼워 넣는 코드를 화면마다 적게 된다.
    """

    permission_classes = [IsAuthenticated]

    def patch(self, request, kind):
        if kind not in Kind.values:
            raise ValidationError({"kind": "그런 종류가 없습니다."})

        serializer = MarkStyleWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        MarkStyle.objects.update_or_create(
            user=request.user, kind=kind, defaults=serializer.validated_data
        )
        return Response(styles_for(request.user))


@api_view(["POST"])
@authentication_classes([])
@permission_classes([HasAPIKey])
def sync_special_days(request):
    """
    POST /special-days/sync?kind=holiday
        {"days": [{"locdate": 20260101, "dateName": "1월 1일", "isHoliday": "Y"}, ...]}
      → {"kind": ..., "from": ..., "to": ..., "added": 1, "updated": 0, "removed": 1, "kept": 14}

    **기간은 보낸 자료에서 뽑는다.** `from`·`to` 를 따로 적지 않는다 — 받아온 것과
    어긋나게 적으면 안 받아온 기간이 지워지는데, 그 어긋남은 아무도 모르게 일어난다.
    창은 자료에 들어 있는 **해 전체**다(`serializers.window_for`). 그래서 **한 해치를
    통째로 보내야 한다** — 한 달치만 보내면 그 해 나머지가 지워질 판이 되고,
    그때는 아래 가드가 막는다.

    **받은 것을 그대로 넘기면 된다.** 벌거벗은 배열도, `days`·`holidays`·`terms`·
    `items` 중 아무 이름에 담긴 것도, n8n 이 한 겹 싸서 내보낸 `[{"terms": [...]}]`
    도 다 알아본다(`serializers.find_days`). 옮겨 담는 노드를 워크플로에 두지
    않으려는 것이다 — 그 노드가 곧 조용히 고장날 자리가 된다.

    **"이 기간의 이 종류는 이게 전부다"** 라는 선언이다. 부분 수정이 아니다:

      · 없던 날은 생기고          (새로 지정된 대체공휴일)
      · 이름이 다르면 고쳐지고    (이름만 바뀐 경우)
      · 응답에 없는 날은 지워진다 (지정이 취소된 경우)

    기간 밖과 **다른 종류는 건드리지 않는다.** 공휴일을 맞춰도 같은 기간의 절기는
    그대로다 — 안 그러면 둘 중 하나만 동기화하는 순간 나머지가 지워진다.

    `kind` 는 받아온 엔드포인트에 맞춘다(기본값 `holiday`):

        holiday   getRestDeInfo        공휴일
        term      get24DivisionsInfo   절기

    줄마다 `date`·`locdate` 와 `name`·`dateName` 을 알아본다. 공휴일로 받을 때는
    "안 쉰다" 고 적힌 줄을 걸러내므로(`serializers.keeps`), `getHoliDeInfo` 의 섞인
    응답을 그대로 넘겨도 쉬는 날만 들어간다. 그 깃발은 문자열 `"N"` 이든 불리언
    `false` 든 같은 뜻으로 읽는다 — 주는 곳마다 다르게 적는다.

    **한꺼번에 많이 지우게 되면 막는다.** 남길 것보다 지울 것이 많으면 400 이다 —
    특일 API 가 반쯤 죽어 몇 줄만 주거나, 한 달치를 한 해인 줄 알고 보냈거나,
    엉뚱한 종류로 보낸 것이다. 어느 쪽이든 그대로 흘려보내면 달력이 조용히 빈다.
    정말 그럴 작정이면 `?force=true`.

    빈 목록은 창을 잡을 근거조차 없으므로 늘 400 이다 — 처음부터 비어 왔든,
    `isHoliday` 로 걸러내고 나니 비었든.
    """
    serializer = SyncSerializer(
        # 목록이 어느 이름에 담겨 왔는지는 여기서 가려낸다. 그 뒤로는 모양이 하나다.
        data={"days": find_days(request.data)},
        context={"params": request.query_params},
    )
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    plan = plan_sync(data["kind"], data["from"], data["to"], data["items"])

    forced = str(request.query_params.get("force", "")).lower() in {"1", "true"}
    if not forced and (refusal := mass_delete_refusal(plan)):
        return Response({"detail": refusal}, status=status.HTTP_400_BAD_REQUEST)

    apply_plan(plan)
    return Response(plan["counts"])


def plan_sync(kind: str, start: dt.date, end: dt.date, wanted: dict[dt.date, str]) -> dict:
    """
    **무엇을 할지 먼저 정하고, 쓰지는 않는다.** 가드가 헤아린 결과를 보고 막을 수
    있어야 해서다 — 지운 뒤에 "많이 지웠네" 하면 늦는다.
    """
    current = {
        row.date: row
        for row in SpecialDay.objects.filter(kind=kind, date__gte=start, date__lte=end)
    }

    gone = [row.pk for date, row in current.items() if date not in wanted]
    fresh = [
        SpecialDay(date=date, kind=kind, name=name)
        for date, name in wanted.items()
        if date not in current
    ]
    # 이름만 바뀐 것. 같은 이름까지 저장하면 updated_at 이 매번 새로 찍혀,
    # 나중에 "언제 실제로 바뀌었나" 를 되짚을 수 없다.
    changed = [row for date, row in current.items() if date in wanted and row.name != wanted[date]]
    for row in changed:
        row.name = wanted[row.date]

    return {
        "gone": gone,
        "fresh": fresh,
        "changed": changed,
        "counts": {
            "kind": kind,
            "from": start,
            "to": end,
            "added": len(fresh),
            "updated": len(changed),
            "removed": len(gone),
            "kept": len(current) - len(gone) - len(changed),
        },
    }


#  이만큼 아래로는 가드가 나서지 않는다. 한두 건 지우는 것은 사고라 해도 잃는 것이
#  적고 눈에 금방 띄는데, 여기에 가드를 걸면 자료가 몇 건뿐인 해를 정상적으로
#  고치는 일마다 걸려서 정작 필요할 때 `force=true` 를 습관처럼 붙이게 된다.
MASS_DELETE_FLOOR = 3


def mass_delete_refusal(plan: dict) -> str | None:
    """
    한꺼번에 많이 지우게 되면 막는다. 막을 까닭이 없으면 None.

    **남길 것보다 지울 것이 많으면** 무언가 잘못된 것이다: 특일 API 가 반쯤 죽어
    몇 줄만 줬거나, 한 달치를 한 해인 줄 알고 보냈거나(창은 해 전체로 잡히므로
    나머지 열한 달이 통째로 지워진다), 엉뚱한 종류로 보냈거나. 어느 쪽이든 실제로
    지워지는 양이 `MASS_DELETE_FLOOR` 는 넘는다 — 한 해는 공휴일 스무 건 남짓,
    절기 스물넷이다.

    평소의 동기화는 여기 걸리지 않는다. 대체공휴일이 취소돼도 `removed=1, kept=19`
    라 멀쩡히 지나간다.
    """
    counts = plan["counts"]
    removed, kept = counts["removed"], counts["kept"]

    if removed < MASS_DELETE_FLOOR or removed <= kept:
        return None

    return (
        f"{counts['from']} ~ {counts['to']} 의 {counts['kind']} 에서 {removed}건을 지우고 "
        f"{kept}건만 남기게 됩니다. 받아온 자료가 한 해치가 맞는지 확인해주세요. "
        "정말 이대로 맞추려면 force=true 를 붙여주세요."
    )


@transaction.atomic
def apply_plan(plan: dict) -> None:
    """
    정해둔 것을 쓴다. 한 덩어리로 묶는다 — 중간에 끊기면 지우기만 하고 넣지 못한
    채 남아, 달력에 공휴일이 사라진 상태가 된다.
    """
    if plan["gone"]:
        SpecialDay.objects.filter(pk__in=plan["gone"]).delete()
    if plan["fresh"]:
        SpecialDay.objects.bulk_create(plan["fresh"])
    if plan["changed"]:
        now = timezone.now()
        for row in plan["changed"]:
            # `auto_now` 는 save() 에서만 찍힌다. bulk_update 는 지나치므로 손으로 넣는다.
            row.updated_at = now
        SpecialDay.objects.bulk_update(plan["changed"], ["name", "updated_at"])
