from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from zones.models import Zone

from .models import MAX_SPAN_DAYS, EventAlert, Event, parse_code

_DATETIME = serializers.DateTimeField()


class EventAlertItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventAlert
        # status 가 없으면 실패한 알림이 화면에서 "대기 중"으로 보인다
        fields = ["id", "code", "due_at", "status", "sent_at"]


class AlertCodesField(serializers.ListField):
    """웹은 알림 코드 배열을 통째로 보낸다. 여기서 형식만 검사한다."""

    child = serializers.CharField(max_length=16)

    def to_internal_value(self, data):
        codes = super().to_internal_value(data)
        if not codes:
            raise serializers.ValidationError("알림을 하나 이상 넣어주세요.")

        for code in codes:
            try:
                parse_code(code)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(exc.messages) from exc
        return list(dict.fromkeys(codes))


class EventListSerializer(serializers.ModelSerializer):
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
        ]

    def get_alerts(self, event) -> dict:
        items = list(event.alerts.all())
        return {
            "total": len(items),
            "sent": sum(1 for alert in items if alert.status == EventAlert.Status.SENT),
        }


class EventDetailSerializer(serializers.ModelSerializer):
    zone_name = serializers.CharField(source="zone.name", read_only=True)
    zone_color = serializers.CharField(source="zone.color", read_only=True)
    alerts = EventAlertItemSerializer(many=True, read_only=True)

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
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # 남의 공간에 일정을 꽂지 못하도록 후보를 본인 것으로 좁힌다
        request = self.context.get("request")
        if request is not None:
            self.fields["zone"].queryset = Zone.objects.filter(owner=request.user)

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
        codes = validated_data.pop("alerts", None)
        if not codes:
            raise serializers.ValidationError({"alerts": "알림을 하나 이상 넣어주세요."})
        validated_data.pop("completed", None)
        # 등록하는 일정은 늘 잡혀 있는 것이다. 보류로 시작할 길은 두지 않는다
        # — 날짜와 알림을 다 고른 뒤 보류함에 넣는 것은 아무 뜻도 없다.
        validated_data.pop("held", None)

        event = Event.objects.create(**validated_data)
        event.sync_alerts(codes)
        return event

    @transaction.atomic
    def update(self, instance, validated_data):
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
        return instance

    def to_representation(self, instance):
        instance = Event.objects.select_related("zone").prefetch_related("alerts").get(pk=instance.pk)
        return EventDetailSerializer(instance, context=self.context).data
