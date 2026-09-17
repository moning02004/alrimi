from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Sharing, Zone
from .palette import PALETTE


class ZoneSerializer(serializers.ModelSerializer):
    # 목록 쿼리에서 annotate 로 붙여준다
    upcoming_count = serializers.IntegerField(read_only=True)
    past_count = serializers.IntegerField(read_only=True)
    # 받은(공유받은) 공간은 보기만 한다. 웹이 이 값으로 등록·수정 자리를 감춘다
    role = serializers.SerializerMethodField()
    # 받은 공간은 웹이 "누구의 공간인지" 로 이름을 적는다
    owner_name = serializers.SerializerMethodField()
    # 이 사람이 이 공간에 일정을 넣을 수 있나. 내 공간이거나, 받았는데 주인이 허락했거나
    writable = serializers.SerializerMethodField()

    class Meta:
        model = Zone
        fields = [
            "id",
            "name",
            "color",
            # 함께 보기. 켜면 주인이 정해둔 함께 보는 사람 모두에게 보인다(`Sharing`)
            "shared",
            # 함께 보는 사람도 일정 추가·수정. 함께 보기가 켜져 있을 때만 뜻이 있다
            "viewers_can_edit",
            "upcoming_count",
            "past_count",
            "role",
            "owner_id",
            "owner_name",
            "writable",
        ]
        read_only_fields = ["id", "owner_id"]
        extra_kwargs = {
            "color": {"required": False},
            "shared": {"required": False},
            "viewers_can_edit": {"required": False},
        }

    def get_role(self, zone) -> str:
        return "owner" if zone.owner_id == self.context["request"].user.id else "member"

    def get_writable(self, zone) -> bool:
        user = self.context["request"].user
        return zone.owner_id == user.id or (zone.shared and zone.viewers_can_edit)

    def get_owner_name(self, zone) -> str:
        return zone.owner.name or zone.owner.username

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


class PersonSerializer(serializers.Serializer):
    """함께 보는 사람 한 줄. 고르고 알아보는 데 드는 이름과 아이디뿐이다."""

    id = serializers.IntegerField()
    username = serializers.CharField()
    name = serializers.CharField(allow_null=True)


class AddSharingSerializer(serializers.Serializer):
    """
    찾기에서 고른 사람(`user_id`)을 함께 보는 사람으로 더한다. 계정은 관리자가 발급하므로
    가입·수락 절차가 따로 없다.
    """

    user_id = serializers.IntegerField()

    def validate_user_id(self, value):
        owner = self.context["request"].user
        user = get_user_model().objects.filter(pk=value, is_active=True).first()
        if user is None:
            raise serializers.ValidationError("그런 사람이 없어요.")
        if user.pk == owner.pk:
            raise serializers.ValidationError("나 자신은 더할 수 없어요.")
        if Sharing.objects.filter(owner=owner, viewer=user).exists():
            raise serializers.ValidationError("이미 함께 보고 있는 사람이에요.")
        return user
