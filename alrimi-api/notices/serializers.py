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
            "priority",
            "completed_at",
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
            "priority",
            "completed_at",
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
            "priority",
            "alerts",
            "completed",
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
        """
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

    @transaction.atomic
    def create(self, validated_data):
        codes = validated_data.pop("alerts", None)
        if not codes:
            raise serializers.ValidationError({"alerts": "알림을 하나 이상 넣어주세요."})
        validated_data.pop("completed", None)

        event = Event.objects.create(**validated_data)
        event.sync_alerts(codes)
        return event

    @transaction.atomic
    def update(self, instance, validated_data):
        codes = validated_data.pop("alerts", None)
        completed = validated_data.pop("completed", None)

        # 시작일만 옮기면 기간은 그대로 따라 움직인다. 3일짜리 여행을 다음 주로
        # 미뤘을 뿐인데 마지막 날이 제자리에 남아 순서가 뒤집히면 안 된다.
        moved = validated_data.get("event_date")
        if moved is not None and "end_date" not in validated_data:
            validated_data["end_date"] = instance.end_date + (moved - instance.event_date)

        for field, value in validated_data.items():
            setattr(instance, field, value)
        if completed is not None:
            instance.completed_at = timezone.now() if completed else None
        instance.save()

        # 날짜가 바뀌면 코드가 그대로여도 발송 시각을 다시 잡아야 한다
        instance.sync_alerts(codes if codes is not None else [a.code for a in instance.alerts.all()])
        return instance

    def to_representation(self, instance):
        instance = Event.objects.select_related("zone").prefetch_related("alerts").get(pk=instance.pk)
        return EventDetailSerializer(instance, context=self.context).data
