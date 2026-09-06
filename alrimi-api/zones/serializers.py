from rest_framework import serializers

from .models import Zone
from .palette import PALETTE


class ZoneSerializer(serializers.ModelSerializer):
    # 목록 쿼리에서 annotate 로 붙여준다
    upcoming_count = serializers.IntegerField(read_only=True)
    past_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Zone
        fields = [
            "id",
            "name",
            "color",
            "upcoming_count",
            "past_count",
        ]
        read_only_fields = ["id"]
        extra_kwargs = {"color": {"required": False}}

    def validate_color(self, value):
        """
        팔레트 밖의 색은 받지 않는다. 흰 글씨를 얹는 칩 배경이라
        아무 색이나 들어오면 글씨가 안 읽힌다.
        """
        color = value.strip().upper()
        if color not in PALETTE:
            raise serializers.ValidationError("고를 수 있는 색이 아니에요.")
        return color

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("공간 이름을 적어주세요.")

        owner = self.context["request"].user
        taken = Zone.objects.filter(owner=owner, name=name)
        if self.instance:
            taken = taken.exclude(pk=self.instance.pk)
        if taken.exists():
            raise serializers.ValidationError("같은 이름의 공간이 이미 있어요.")
        return name
