import datetime as dt

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from zones.models import Zone, editable_zones

from .models import (
    MAX_REPEAT_COUNT,
    MAX_REPEAT_YEARS,
    MAX_SPAN_DAYS,
    Event,
    EventAlert,
    EventSeries,
    parse_code,
    repeat_dates,
)

#  수정·삭제가 어디까지 닿는가. 반복으로 만든 일정에서만 뜻이 있다.
#  this       — 이 일정만 (기본값)
#  following  — 이 일정과 같은 반복의 뒤따르는 것 전부
SCOPES = ("this", "following")

_DATETIME = serializers.DateTimeField()


class CanEditMixin(serializers.Serializer):
    """
    이 사람이 고칠 수 있는 일정인가. 내 공간이거나, 받은 공간인데 주인이 "함께 보는 사람도
    일정 추가·수정" 을 켜둔 것이다(`zones.models.editable_zones`). 웹이 이 값으로
    완료·수정·삭제·고르기 자리를 감춘다.

    고칠 수 있는 공간 id 는 요청마다 한 번만 센다. 목록은 카드 수만큼 이것을 부르므로,
    일정마다 물으면 쿼리가 카드 수만큼 는다.
    """

    can_edit = serializers.SerializerMethodField()

    def get_can_edit(self, event) -> bool:
        request = self.context.get("request")
        if request is None:
            return False
        ids = self.context.get("_editable_zone_ids")
        if ids is None:
            ids = set(editable_zones(request.user).values_list("id", flat=True))
            self.context["_editable_zone_ids"] = ids
        return event.zone_id in ids


class EventAlertItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventAlert
        # status 가 없으면 실패한 알림이 화면에서 "대기 중"으로 보인다
        fields = ["id", "code", "due_at", "status", "sent_at"]


class AlertCodesField(serializers.ListField):
    """
    웹은 알림 코드 배열을 통째로 보낸다. 여기서 형식만 검사한다.

    **빈 배열도 받는다.** 알림 없이 날짜만 적어두는 일정이 있다 — 달력에서 보기만 하면
    되는 것까지 울리게 하면, 정작 챙겨야 할 알림이 그 사이에 묻힌다.
    """

    child = serializers.CharField(max_length=16)

    def to_internal_value(self, data):
        codes = super().to_internal_value(data)

        for code in codes:
            try:
                parse_code(code)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(exc.messages) from exc
        return list(dict.fromkeys(codes))


class RepeatSerializer(serializers.Serializer):
    """
    등록할 때만 받는 반복 규칙. `{"freq": "weekly", "weekdays": [2], "until": "2026-12-31"}`

    요일은 월=0 … 일=6 이다(파이썬 `weekday()`). 매주가 아니면 요일은 무시한다.
    """

    freq = serializers.ChoiceField(choices=EventSeries.Freq.choices)
    weekdays = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=6), required=False, default=list
    )
    until = serializers.DateField()

    def validate(self, attrs):
        if attrs["freq"] == EventSeries.Freq.WEEKLY:
            if not attrs["weekdays"]:
                raise serializers.ValidationError({"weekdays": "반복할 요일을 골라주세요."})
            attrs["weekdays"] = sorted(set(attrs["weekdays"]))
        else:
            attrs["weekdays"] = []
        return attrs


class EventListSerializer(CanEditMixin, serializers.ModelSerializer):
    """목록 카드용. 알림은 점 개수만 알면 되므로 요약으로 줄인다."""

    # 카드는 존 이름 대신 왼쪽 색 막대로 공간을 구분한다
    zone_color = serializers.CharField(source="zone.color", read_only=True)
    alerts = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = [
            "id",
            "event_date",
            # 카드가 "2일차/3" 을 그리려면 걸치는 끝을 알아야 한다
            "end_date",
            "event_hour",
            "title",
            "completed_at",
            # 보류함이 "9월 14일에 있던 일정" 을 적으려면 치운 때가 아니라 보류
            # 여부를 알아야 한다. 목록 카드도 이 값으로 완료 동그라미를 감춘다 —
            # 보류한 일정에는 완료할 것이 없다.
            "held_at",
            "zone_id",
            "zone_color",
            "alerts",
            "can_edit",
            # 카드에 반복 표시를 붙인다
            "series_id",
        ]

    def get_alerts(self, event) -> dict:
        items = list(event.alerts.all())
        return {
            "total": len(items),
            "sent": sum(1 for alert in items if alert.status == EventAlert.Status.SENT),
        }


class EventDetailSerializer(CanEditMixin, serializers.ModelSerializer):
    zone_name = serializers.CharField(source="zone.name", read_only=True)
    zone_color = serializers.CharField(source="zone.color", read_only=True)
    alerts = EventAlertItemSerializer(many=True, read_only=True)
    repeat = serializers.SerializerMethodField()

    def get_repeat(self, event) -> dict | None:
        """반복으로 만든 일정이면 그 규칙. 상세가 "매주 수요일 · 12월 31일까지" 를 적는다."""
        series = event.series
        if series is None:
            return None
        return {
            "freq": series.freq,
            "weekdays": series.weekday_list,
            "until": series.until,
        }

    class Meta:
        model = Event
        fields = [
            "id",
            "event_date",
            "end_date",
            "event_hour",
            "title",
            "content",
            "completed_at",
            "held_at",
            "zone_id",
            "zone_name",
            "zone_color",
            "alerts",
            "can_edit",
            "series_id",
            "repeat",
        ]


class EventWriteSerializer(serializers.ModelSerializer):
    """
    공간은 경로가 아니라 본문으로 받는다. 목록의 축이 날짜라서
    등록 폼에서 공간을 고르고, 수정할 때 다른 공간으로 옮길 수도 있다.
    """

    zone = serializers.PrimaryKeyRelatedField(queryset=Zone.objects.none())
    alerts = AlertCodesField(required=False)
    # 모델에는 completed_at 이 있지만 클라이언트는 켜고 끄기만 하면 된다
    completed = serializers.BooleanField(required=False, write_only=True)
    # 보류도 마찬가지. `held: false` 는 "다시 잡는다" 는 뜻이라 새 날짜와 함께 온다
    held = serializers.BooleanField(required=False, write_only=True)
    # 등록할 때만. 반복 규칙은 만든 뒤에 바꾸지 않는다(`EventSeries`)
    repeat = RepeatSerializer(required=False, write_only=True)

    class Meta:
        model = Event
        fields = [
            "id",
            "zone",
            "event_date",
            "end_date",
            "event_hour",
            "title",
            "content",
            "alerts",
            "completed",
            "held",
            "repeat",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # 넣을 수 있는 공간으로 좁힌다 — 내 것과, 주인이 일정 추가·수정을 허락한 받은 공간
        request = self.context.get("request")
        if request is not None:
            self.fields["zone"].queryset = editable_zones(request.user)

    def validate_zone(self, zone):
        """
        다른 사람의 공간으로는 옮기지 못한다. 함께 고치는 공간이라도 일정을 내 공간으로 빼가면
        주인의 목록과 알림에서 사라진다 — 고칠 수 있다는 것이 가져갈 수 있다는 뜻은 아니다.
        """
        if self.instance is not None and zone.owner_id != self.instance.zone.owner_id:
            raise serializers.ValidationError("다른 사람의 공간으로는 옮길 수 없어요.")
        return zone

    def validate_title(self, value):
        title = value.strip()
        if not title:
            raise serializers.ValidationError("제목을 적어주세요.")
        return title

    def validate_event_date(self, value):
        """
        지난 날짜로는 등록하지 못한다. 알림 시각이 이미 지나 있어서
        보내는 쪽이 저장 직후 그 일정의 예약을 전부 집어 들고 한꺼번에 쏘게 된다.

        이미 있는 지난 일정은 그대로 고칠 수 있어야 하므로,
        날짜를 실제로 바꿀 때만 막는다.
        """
        if self.instance is not None and self.instance.event_date == value:
            return value
        if value < timezone.localdate():
            raise serializers.ValidationError("지난 날짜로는 등록할 수 없어요.")
        return value

    def validate_alerts(self, value):
        return value

    def validate(self, attrs):
        """
        기간은 시작일과 마지막 날 **두 칸이 함께** 있어야 말이 된다.
        한 칸씩 보는 validate_<field> 로는 검사할 수 없어 여기서 본다.

        마지막 날을 아예 안 보낸 요청은 그냥 보낸다 — 등록이면 하루짜리이고,
        수정이면 시작일을 옮긴 만큼 마지막 날도 같이 밀린다(`update` 참고).
        여기서 저장된 옛 마지막 날과 견주면, 3일짜리 여행을 다음 주로 옮기는
        평범한 수정이 "마지막 날보다 뒤"라는 이유로 막힌다.

        보류를 푸는 요청은 **날 자리가 실제로 앞에 있는지**까지 본다. 아래 참고.
        """
        self._check_resume(attrs)
        self._check_repeat(attrs)

        end = attrs.get("end_date")
        if end is None:
            return attrs

        start = attrs.get("event_date") or getattr(self.instance, "event_date", None)
        if start is None:
            return attrs

        if end < start:
            raise serializers.ValidationError(
                {"end_date": "종료일은 시작일보다 앞설 수 없어요."}
            )
        if (end - start).days + 1 > MAX_SPAN_DAYS:
            raise serializers.ValidationError(
                {"end_date": f"한 일정은 최대 {MAX_SPAN_DAYS}일까지 이어질 수 있어요."}
            )
        return attrs

    def _check_repeat(self, attrs) -> None:
        """
        반복은 등록할 때만 받는다. 끝나는 날과 개수를 여기서 본다 — 시작일과 함께
        봐야 알 수 있어서 `RepeatSerializer` 혼자서는 검사할 수 없다.
        """
        repeat = attrs.get("repeat")
        if repeat is None:
            return
        if self.instance is not None:
            raise serializers.ValidationError(
                {"repeat": "반복 규칙은 바꿀 수 없어요. 이후 일정을 지우고 새로 만들어 주세요."}
            )

        start = attrs["event_date"]
        until = repeat["until"]
        if until < start:
            raise serializers.ValidationError({"repeat": "반복이 끝나는 날은 시작일보다 뒤여야 해요."})
        try:
            limit = start.replace(year=start.year + MAX_REPEAT_YEARS)
        except ValueError:  # 2월 29일
            limit = start.replace(year=start.year + MAX_REPEAT_YEARS, day=28)
        if until > limit:
            raise serializers.ValidationError(
                {"repeat": f"반복은 {MAX_REPEAT_YEARS}년 안에서만 정할 수 있어요."}
            )

        dates = repeat_dates(start, repeat["freq"], until, repeat["weekdays"])
        if not dates:
            raise serializers.ValidationError({"repeat": "이 규칙으로는 만들어질 날이 없어요."})
        if len(dates) > MAX_REPEAT_COUNT:
            raise serializers.ValidationError(
                {"repeat": f"한 번에 {MAX_REPEAT_COUNT}개까지 반복할 수 있어요. 끝나는 날을 앞당겨 주세요."}
            )
        # `create` 가 다시 계산하지 않도록 들고 간다
        repeat["dates"] = dates

    def _check_resume(self, attrs) -> None:
        """
        보류를 푸는데 날짜가 지났으면 막는다.

        `validate_event_date` 는 **바뀐** 날짜만 본다 — 지난 일정도 제목이나 내용은
        고칠 수 있어야 해서다. 그 틈으로 "9월 14일에 보류해둔 것" 을 날짜 그대로
        풀면 일정은 목록에 돌아오는데 알림은 한 통도 안 온다: 예약 시각이 전부
        지나 있고, 발송 창은 지난 6시간뿐이라(`due_alerts`) 되살려도 잡히지 않는다.

        다시 잡는다는 것은 곧 날을 새로 고른다는 뜻이므로, 여기서 그 날을 요구한다.
        아직 안 지난 일정을 보류만 풀어 되돌리는 것은 그대로 된다.
        """
        if attrs.get("held") is not False or self.instance is None:
            return
        if self.instance.held_at is None:
            return

        start = attrs.get("event_date") or self.instance.event_date
        if start < timezone.localdate():
            raise serializers.ValidationError(
                {"event_date": "다시 잡을 날짜를 골라주세요."}
            )

    @transaction.atomic
    def create(self, validated_data):
        # 알림 없이 날짜만 적어두는 일정이 있다. 빈 배열도, 아예 안 보낸 것도 "안 울린다" 다.
        codes = validated_data.pop("alerts", None) or []
        validated_data.pop("completed", None)
        # 등록하는 일정은 늘 잡혀 있는 것이다. 보류로 시작할 길은 두지 않는다
        # — 날짜와 알림을 다 고른 뒤 보류함에 넣는 것은 아무 뜻도 없다.
        validated_data.pop("held", None)
        repeat = validated_data.pop("repeat", None)

        if repeat is None:
            event = Event.objects.create(**validated_data)
            event.sync_alerts(codes)
            return event

        # 반복이면 날마다 한 건씩 만든다. 여러 날짜리는 걸치는 길이를 그대로 옮긴다.
        series = EventSeries.objects.create(
            freq=repeat["freq"],
            weekdays=",".join(str(day) for day in repeat["weekdays"]),
            until=repeat["until"],
        )
        start = validated_data.pop("event_date")
        end = validated_data.pop("end_date", None) or start
        span = end - start

        first = None
        for day in repeat["dates"]:
            event = Event.objects.create(
                **validated_data, series=series, event_date=day, end_date=day + span
            )
            event.sync_alerts(codes)
            first = first or event
        # 응답은 첫 번째 일정이다. 웹은 목록을 통째로 다시 받는다.
        return first

    @property
    def scope(self) -> str:
        request = self.context.get("request")
        scope = request.query_params.get("scope", "this") if request is not None else "this"
        if scope not in SCOPES:
            raise serializers.ValidationError({"scope": "this 또는 following 이어야 합니다."})
        return scope

    @transaction.atomic
    def update(self, instance, validated_data):
        scope = self.scope
        # "이후 모두" 에 옮겨 적을 것. instance 를 고치기 **전의** 날짜로 뒤따르는 것을 찾는다.
        following = (
            list(
                Event.objects.filter(
                    series_id=instance.series_id, event_date__gt=instance.event_date
                ).order_by("event_date")
            )
            if scope == "following" and instance.series_id
            else []
        )
        shared = {
            field: validated_data[field]
            for field in ("zone", "title", "content", "event_hour")
            if field in validated_data
        }
        moved_by = (
            validated_data["event_date"] - instance.event_date
            if "event_date" in validated_data
            else dt.timedelta(0)
        )
        span_before = instance.end_date - instance.event_date

        codes = validated_data.pop("alerts", None)
        completed = validated_data.pop("completed", None)
        held = validated_data.pop("held", None)
        # 보류를 푸는 중인가. 아래에서 예약을 되살릴지 가르는 값이라 instance 를
        # 고치기 **전에** 잡아둔다.
        resumed = held is False and instance.held_at is not None

        # 시작일만 옮기면 기간은 그대로 따라 움직인다. 3일짜리 여행을 다음 주로
        # 미뤘을 뿐인데 마지막 날이 제자리에 남아 순서가 뒤집히면 안 된다.
        moved = validated_data.get("event_date")
        if moved is not None and "end_date" not in validated_data:
            validated_data["end_date"] = instance.end_date + (moved - instance.event_date)

        for field, value in validated_data.items():
            setattr(instance, field, value)
        if completed is not None:
            instance.completed_at = timezone.now() if completed else None
        if held is not None:
            instance.held_at = timezone.now() if held else None
            # 보류하는 일정에 완료는 남아 있을 자리가 없다. 둘 다 켜져 있으면
            # 다시 잡았을 때 목록에 돌아오자마자 완료로 그어진 채 나타난다.
            if held:
                instance.completed_at = None
        instance.save()

        # 날짜가 바뀌면 코드가 그대로여도 발송 시각을 다시 잡아야 한다
        instance.sync_alerts(codes if codes is not None else [a.code for a in instance.alerts.all()])
        # 다시 잡은 일정은 지난번에 나간 예약까지 되살린다 — `revive_alerts` 참고
        if resumed:
            instance.revive_alerts()

        self._apply_to_following(following, instance, shared, codes, moved_by, span_before)
        return instance

    @staticmethod
    def _apply_to_following(following, instance, shared, codes, moved_by, span_before) -> None:
        """
        "이후 모두 고치기". 제목·내용·시각·공간·알림은 그대로 옮겨 적고, 날짜는 옮긴
        만큼 함께 민다 — 매주 수요일을 목요일로 옮기면 뒤따르는 것도 다 목요일이 된다.
        기간(며칠짜리인지)도 새 길이를 따른다.

        **완료·보류는 옮기지 않는다.** 그 날 한 번의 일이다. 이미 완료한 날도 제목은
        바뀐다 — 기록을 남기려면 "이 일정만" 을 고르면 된다.
        """
        if not following:
            return
        span = instance.end_date - instance.event_date
        for event in following:
            for field, value in shared.items():
                setattr(event, field, value)
            if moved_by or span != span_before:
                event.event_date += moved_by
                event.end_date = event.event_date + span
            event.save()
            event.sync_alerts(codes if codes is not None else [a.code for a in event.alerts.all()])

    def to_representation(self, instance):
        instance = Event.objects.select_related("zone").prefetch_related("alerts").get(pk=instance.pk)
        return EventDetailSerializer(instance, context=self.context).data
