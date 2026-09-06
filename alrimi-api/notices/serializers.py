from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from zones.models import Zone

from .models import Alert, Notice, parse_code

_DATETIME = serializers.DateTimeField()


class AlertItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = Alert
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


class NoticeListSerializer(serializers.ModelSerializer):
    """목록 카드용. 알림은 점 개수만 알면 되므로 요약으로 줄인다."""

    # 카드는 존 이름 대신 왼쪽 색 막대로 공간을 구분한다
    zone_color = serializers.CharField(source="zone.color", read_only=True)
    alerts = serializers.SerializerMethodField()

    class Meta:
        model = Notice
        fields = [
            "id",
            "event_date",
            "title",
            "priority",
            "completed_at",
            "zone_id",
            "zone_color",
            "alerts",
        ]

    def get_alerts(self, notice) -> dict:
        items = list(notice.alerts.all())
        return {
            "total": len(items),
            "sent": sum(1 for alert in items if alert.status == Alert.Status.SENT),
        }


class NoticeDetailSerializer(serializers.ModelSerializer):
    zone_name = serializers.CharField(source="zone.name", read_only=True)
    zone_color = serializers.CharField(source="zone.color", read_only=True)
    alerts = AlertItemSerializer(many=True, read_only=True)

    class Meta:
        model = Notice
        fields = [
            "id",
            "event_date",
            "title",
            "content",
            "priority",
            "completed_at",
            "zone_id",
            "zone_name",
            "zone_color",
            "alerts",
        ]


class NoticeWriteSerializer(serializers.ModelSerializer):
    """
    공간은 경로가 아니라 본문으로 받는다. 목록의 축이 날짜라서
    등록 폼에서 공간을 고르고, 수정할 때 다른 공간으로 옮길 수도 있다.
    """

    zone = serializers.PrimaryKeyRelatedField(queryset=Zone.objects.none())
    alerts = AlertCodesField(required=False)
    # 모델에는 completed_at 이 있지만 클라이언트는 켜고 끄기만 하면 된다
    completed = serializers.BooleanField(required=False, write_only=True)

    class Meta:
        model = Notice
        fields = [
            "id",
            "zone",
            "event_date",
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

    @transaction.atomic
    def create(self, validated_data):
        codes = validated_data.pop("alerts", None)
        if not codes:
            raise serializers.ValidationError({"alerts": "알림을 하나 이상 넣어주세요."})
        validated_data.pop("completed", None)

        notice = Notice.objects.create(**validated_data)
        notice.sync_alerts(codes)
        return notice

    @transaction.atomic
    def update(self, instance, validated_data):
        codes = validated_data.pop("alerts", None)
        completed = validated_data.pop("completed", None)

        for field, value in validated_data.items():
            setattr(instance, field, value)
        if completed is not None:
            instance.completed_at = timezone.now() if completed else None
        instance.save()

        # 날짜가 바뀌면 코드가 그대로여도 발송 시각을 다시 잡아야 한다
        instance.sync_alerts(codes if codes is not None else [a.code for a in instance.alerts.all()])
        return instance

    def to_representation(self, instance):
        instance = Notice.objects.select_related("zone").prefetch_related("alerts").get(pk=instance.pk)
        return NoticeDetailSerializer(instance, context=self.context).data
