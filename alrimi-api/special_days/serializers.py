import datetime as dt
import re

from rest_framework import serializers

from .models import Kind, MarkStyle, SpecialDay
from .palette import COLORS

#  한 번에 맞출 수 있는 폭. 한 해치(365)를 넉넉히 넘기면서, 오타 한 번에 몇 년치를
#  훑어 지우는 것은 막는 선이다.
MAX_SYNC_DAYS = 800

#  "20260101". 특일 정보 API 의 `locdate` 가 이 꼴로 온다.
COMPACT_DATE = re.compile(r"^\d{8}$")


class SpecialDaySerializer(serializers.ModelSerializer):
    """웹이 달력을 칠하는 데 필요한 것만. 언제 들어온 줄인지는 화면과 상관없다."""

    class Meta:
        model = SpecialDay
        fields = ["date", "kind", "name"]


class MarkStyleWriteSerializer(serializers.ModelSerializer):
    """한 종류를 무슨 색으로 볼지. 고칠 것이 색 하나뿐이라 그것만 받는다."""

    class Meta:
        model = MarkStyle
        fields = ["color"]

    def validate_color(self, value):
        """
        팔레트 밖의 색은 받지 않는다. 흰 바탕에 놓이는 작은 글씨라 아무 색이나
        들어오면 안 읽힌다 — 고를 수 있는 값을 서버가 쥐고 있어야 하는 까닭이다.
        """
        color = value.strip().upper()
        if color not in COLORS:
            raise serializers.ValidationError("고를 수 있는 색이 아니에요.")
        return color


class SpecialDayItemField(serializers.Field):
    """
    들어온 줄 하나를 `(날짜, 이름)` 으로 읽는다.

    **공공데이터포털 특일 정보 API 의 응답을 그대로 받아준다.** 그쪽은
    `{"locdate": 20260101, "dateName": "1월 1일", "isHoliday": "Y"}` 꼴로 주는데,
    n8n 이 그것을 다시 `{"date": ..., "name": ...}` 으로 옮겨 적게 하면 워크플로에
    매핑 노드가 하나 더 붙고 그 노드가 곧 고장날 자리가 된다. 두 이름을 다 받으면
    n8n 은 받은 배열을 그대로 넘기기만 하면 된다.

    `isHoliday` 를 어떻게 쓰는지는 `keeps` 를 보라 — 받는 `kind` 마다 다르다.
    """

    def __init__(self, *args, kind: str = "", **kwargs):
        self.kind = kind
        super().__init__(*args, **kwargs)

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError("각 줄은 객체여야 합니다.")

        if not keeps(self.kind, data.get("isHoliday")):
            return None

        raw_date = data.get("date", data.get("locdate"))
        raw_name = data.get("name", data.get("dateName"))

        if raw_date is None:
            raise serializers.ValidationError("date(또는 locdate)가 필요합니다.")
        if not str(raw_name or "").strip():
            raise serializers.ValidationError("name(또는 dateName)이 필요합니다.")

        name = str(raw_name).strip()
        if len(name) > 40:
            raise serializers.ValidationError("이름은 40자를 넘을 수 없습니다.")

        return parse_day(raw_date), name

    def to_representation(self, value):
        date, name = value
        return {"date": date, "name": name}


def keeps(kind: str, is_holiday) -> bool:
    """
    이 줄을 이 `kind` 로 받을 것인가. `isHoliday` 깃발으로 가른다.

    **공휴일에만 본다.** `getHoliDeInfo` 는 공휴일(삼일절)과 쉬지 않는 기념일
    (식목일)을 한 배열에 섞어 주는데, 이 앱은 쉬는 날만 담는다. 그 응답을 그대로
    넘겨도 기념일은 여기서 걸러지므로, n8n 이 거르는 로직을 적지 않아도 된다.

    절기(`get24DivisionsInfo`)는 전부 `isHoliday: "N"` 으로 오지만 그것이 "안 쉬는
    기념일" 이라는 뜻은 아니다. 그래서 절기에는 이 깃발을 아예 보지 않는다.
    """
    if kind != Kind.HOLIDAY:
        return True

    # 깃발이 없으면 공휴일 전용 엔드포인트(getRestDeInfo)라 보고 받는다
    return str(is_holiday).strip().upper() != "N" if is_holiday is not None else True


def flatten(detail) -> str:
    """
    DRF 의 오류 덩어리를 사람이 읽을 한 줄로.

    그냥 f-string 에 넣으면 `[ErrorDetail(string='…', code='invalid')]` 가 통째로
    찍힌다. 이 메시지는 n8n 로그에 남아 사람이 읽는 것이라, 파이썬 속사정이 섞이면
    정작 무엇이 틀렸는지가 그 안에 묻힌다.
    """
    if isinstance(detail, list):
        return " ".join(flatten(item) for item in detail)
    if isinstance(detail, dict):
        return " ".join(flatten(item) for item in detail.values())
    return str(detail)


def parse_day(raw) -> dt.date:
    """'2026-01-01' · '20260101' · 20260101 → date."""
    text = str(raw).strip()
    if COMPACT_DATE.match(text):
        text = f"{text[:4]}-{text[4:6]}-{text[6:]}"
    try:
        return dt.date.fromisoformat(text)
    except ValueError:
        raise serializers.ValidationError(
            f"날짜 형식이 올바르지 않습니다: {raw!r} (YYYY-MM-DD 또는 YYYYMMDD)"
        ) from None


class SyncSerializer(serializers.Serializer):
    """
    한 종류의 한 기간을 통째로 맞추는 요청.

    **부분 수정이 아니라 "이 기간의 이 종류는 이게 전부다" 라는 선언이다.**
    대체공휴일은 나중에 지정되기도 하고, 지정됐다 바뀌기도 한다. 낱개로 넣고 빼는
    API 였다면 n8n 이 "서버에는 있는데 이번 응답에는 없는 날" 을 스스로 가려내
    지워야 하는데, 그 비교를 워크플로에 적어두면 조용히 틀리기 좋은 자리가 하나 더
    생긴다. 기간을 통째로 맞추면 부르는 쪽은 받은 것을 그대로 넘기기만 하면 되고,
    같은 요청을 몇 번 돌려도 결과가 같다.

    **종류마다 따로 돈다.** 공휴일을 맞춰도 같은 기간의 절기는 그대로다 — 안 그러면
    둘 중 하나만 동기화하는 순간 나머지가 지워진다.
    """

    holidays = serializers.ListField(child=serializers.DictField(), required=False)
    days = serializers.ListField(child=serializers.DictField(), required=False)

    def validate(self, attrs):
        params = self.context.get("params", {})
        kind = self._kind(params)
        start, end = self._range(params)

        # `days` 가 제 이름이지만 `holidays` 도 받는다 — 공휴일만 있던 시절의 이름이라
        # 이미 그렇게 짜둔 워크플로가 있으면 그대로 돌아야 한다.
        raw = attrs.get("days")
        if raw is None:
            raw = attrs.get("holidays")
        if raw is None:
            raise serializers.ValidationError({"days": "days 가 필요합니다."})

        field = SpecialDayItemField(kind=kind)
        items = []
        for index, row in enumerate(raw, start=1):
            try:
                parsed = field.to_internal_value(row)
            except serializers.ValidationError as exc:
                # 줄 번호는 사람이 세는 대로 1부터다. 0부터 세면 "1번째 줄" 이
                # 두 번째 줄을 가리켜, 받은 사람이 엉뚱한 자리를 들여다본다.
                raise serializers.ValidationError(
                    {"days": f"{index}번째 줄: {flatten(exc.detail)}"}
                ) from exc
            # `keeps` 가 거른 줄은 None 으로 온다
            if parsed is not None:
                items.append(parsed)

        outside = sorted({date for date, _ in items if not (start <= date <= end)})
        if outside:
            raise serializers.ValidationError(
                {"days": f"기간({start} ~ {end}) 밖의 날짜가 있습니다: {outside[0]}"}
            )

        # 같은 날이 두 번 오면 어느 이름이 맞는지 알 수 없다. 조용히 덮지 않고 되돌린다.
        seen: dict[dt.date, str] = {}
        for date, name in items:
            if date in seen and seen[date] != name:
                raise serializers.ValidationError(
                    {"days": f"같은 날짜에 이름이 둘입니다: {date} ({seen[date]} / {name})"}
                )
            seen[date] = name

        return {"kind": kind, "from": start, "to": end, "items": seen}

    def _kind(self, params) -> str:
        kind = params.get("kind", Kind.HOLIDAY)
        if kind not in Kind.values:
            raise serializers.ValidationError(
                {"kind": f"kind 는 {' · '.join(Kind.values)} 중 하나여야 합니다."}
            )
        return kind

    def _range(self, params) -> tuple[dt.date, dt.date]:
        if not params.get("from") or not params.get("to"):
            raise serializers.ValidationError({"detail": "from 과 to 가 필요합니다."})

        start = parse_day(params["from"])
        end = parse_day(params["to"])
        if end < start:
            raise serializers.ValidationError({"detail": "to 는 from 보다 앞설 수 없습니다."})
        if (end - start).days + 1 > MAX_SYNC_DAYS:
            raise serializers.ValidationError(
                {"detail": f"한 번에 맞출 수 있는 기간은 최대 {MAX_SYNC_DAYS}일입니다."}
            )
        return start, end
