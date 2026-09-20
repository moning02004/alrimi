from django.contrib.auth import authenticate
from django.contrib.auth.validators import UnicodeUsernameValidator
from rest_framework import serializers

from .models import Invite, User
from .subscribe import qr_data_uri, subscribe_link


class ObtainTokenSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(trim_whitespace=False, style={"input_type": "password"})

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get("request"),
            username=attrs["username"],
            password=attrs["password"],
        )
        # 어느 쪽이 틀렸는지 알려주지 않는다
        if user is None or not user.is_active:
            raise serializers.ValidationError({"detail": "아이디 또는 비밀번호가 올바르지 않습니다."})
        attrs["user"] = user
        return attrs


class MeSerializer(serializers.Serializer):
    username = serializers.CharField(read_only=True)
    name = serializers.CharField(read_only=True)
    ntfy_topic = serializers.CharField(read_only=True)
    ntfy_subscribe_url = serializers.SerializerMethodField()
    ntfy_subscribe_qr = serializers.SerializerMethodField()
    # 설정 화면이 "사용자 관리" 를 그릴지, 그 안에서 무엇까지 내줄지를 이 둘로 정한다
    is_staff = serializers.BooleanField(read_only=True)
    is_superuser = serializers.BooleanField(read_only=True)
    version = serializers.SerializerMethodField()

    def get_ntfy_subscribe_url(self, user) -> str | None:
        """
        누르면 ntfy 앱이 열리면서 구독까지 끝나는 링크.
        링크 조립은 서버가 한다 — 웹이 ntfy 주소를 알 필요가 없다.
        """
        return subscribe_link(user.ntfy_topic) if user.ntfy_topic else None

    def get_ntfy_subscribe_qr(self, user) -> str | None:
        """
        같은 링크의 QR. 앱이 안 열리는 자리(데스크톱, iOS)에서 폰으로 넘기는 수단이다.
        `<img src>` 에 바로 넣도록 data URI 로 준다.
        """
        return qr_data_uri(subscribe_link(user.ntfy_topic)) if user.ntfy_topic else None

    def get_version(self, _obj) -> str:
        from django.conf import settings

        return settings.APP_VERSION


class UpdateMeSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, allow_blank=True)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(trim_whitespace=False)
    new_password = serializers.CharField(trim_whitespace=False)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("현재 비밀번호가 올바르지 않습니다.")
        return value

    def validate_new_password(self, value):
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError

        # 같은 값으로 "바꾸면" 강제 변경이 아무 일도 안 한 채 풀린다
        if self.context["request"].user.check_password(value):
            raise serializers.ValidationError("지금 비밀번호와 다른 비밀번호로 바꿔주세요.")

        try:
            validate_password(value, self.context["request"].user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value


class InvitePasswordSerializer(serializers.Serializer):
    """
    초대 링크에서 정하는 비밀번호. **한 칸뿐이다** — 지금 비밀번호를 묻지 않는다.
    링크를 가진 것이 곧 자격이고, 받는 사람에게는 아직 아는 비밀번호가 없다.

    확인 칸을 두지 않는 까닭은, 잘못 쳐서 못 들어가더라도 새 링크를 받으면 그만이기
    때문이다. 대신 화면에 "보기" 를 두어 친 것을 눈으로 확인하게 한다.
    """

    password = serializers.CharField(trim_whitespace=False)

    def validate_password(self, value):
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError

        try:
            validate_password(value, self.context["user"])
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value


class UserSerializer(serializers.ModelSerializer):
    """사용자 관리 목록의 한 줄. 비밀번호·토픽 같은 것은 싣지 않는다."""

    # 목록에서 "아직 못 들어온 사람" 을 가려내는 둘. 링크를 보냈는지까지 보여야
    # 관리자가 같은 사람에게 두 번 보내거나, 보낸 줄 알고 잊는 일이 없다.
    has_password = serializers.SerializerMethodField()
    invite_pending = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "name",
            "is_staff",
            "is_superuser",
            "has_password",
            "invite_pending",
            "date_joined",
            "last_login",
        ]
        read_only_fields = fields

    def get_has_password(self, user) -> bool:
        """한 번이라도 들어와 비밀번호를 정했다. 아니면 링크를 받기 전까지 로그인할 수 없다."""
        return user.has_usable_password()

    def get_invite_pending(self, user) -> bool:
        """아직 안 쓴 초대가 남아 있다. 목록을 뽑는 쪽이 `select_related("invite")` 로 온다."""
        invite = getattr(user, "invite", None)
        return bool(invite and invite.alive)


class UserCreateSerializer(serializers.Serializer):
    """
    사용자 추가. 이름과 아이디만 받는다 — **비밀번호는 아무도 정하지 않는다.**

    만들어진 계정에는 쓸 수 있는 비밀번호가 아예 없다. 대신 초대 링크가 하나 나오고
    (`Invite`), 받은 사람이 그 링크에서 자기 비밀번호를 정하면서 들어온다. 그때까지 이
    계정으로는 누구도 로그인할 수 없다 — 아이디를 아는 사람이 먼저 들어가 비밀번호를
    정해버리던 길(`0000`)이 여기서 닫힌다.

    추가하는 사람이 비밀번호를 정하게 하지 않는 까닭도 같다. 그러면 그 사람이 남의
    비밀번호를 아는 채로 남는다.

    권한도 받지 않는다. 추가한 사람은 늘 일반 사용자로 시작하고, 권한은 최고 관리자가
    따로 준다(`UserRoleSerializer`) — 관리자가 추가하면서 관리자를 만들 수 있으면
    "관리자는 추가만" 이 뚫린다.
    """

    username = serializers.CharField(
        max_length=150,
        validators=[UnicodeUsernameValidator()],
        error_messages={"blank": "아이디를 적어주세요."},
    )
    name = serializers.CharField(max_length=255, error_messages={"blank": "이름을 적어주세요."})

    def validate_username(self, value):
        # 대소문자만 다른 아이디는 사람 눈에 같은 아이디다
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("이미 있는 아이디예요.")
        return value

    def create(self, validated_data):
        user = User(username=validated_data["username"], name=validated_data["name"])
        # 해시 자리에 맞출 수 없는 값을 넣는다. 어떤 비밀번호로도 로그인되지 않는다.
        user.set_unusable_password()
        user.save()
        # 만든 링크는 응답에 한 번 실으려고 객체에 얹어둔다(`UserListCreateView`).
        user.invite = Invite.objects.create(user=user)
        return user


class UserRoleSerializer(serializers.Serializer):
    """
    권한 바꾸기. 최고 관리자만 부른다.

    **최고 관리자는 늘 관리자이기도 하다.** 최고 관리자를 켜면 관리자도 켜고, 관리자를
    끄면 최고 관리자도 끈다. 둘이 따로 놀면 "최고 관리자인데 관리자는 아닌" 계정이
    생기고, 관리자 사이트(is_staff 가 있어야 들어간다)와 이 화면의 말이 엇갈린다.
    """

    is_staff = serializers.BooleanField(required=False)
    is_superuser = serializers.BooleanField(required=False)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError({"detail": "바꿀 권한을 보내주세요."})
        if attrs.get("is_superuser") and attrs.get("is_staff") is False:
            raise serializers.ValidationError(
                {"detail": "최고 관리자는 관리자이기도 해서, 관리자를 끄면서 켤 수 없어요."}
            )
        return attrs

    def update(self, user, validated_data):
        if "is_staff" in validated_data:
            user.is_staff = validated_data["is_staff"]
            if not user.is_staff:
                user.is_superuser = False
        if "is_superuser" in validated_data:
            user.is_superuser = validated_data["is_superuser"]
            if user.is_superuser:
                user.is_staff = True
        user.save(update_fields=["is_staff", "is_superuser"])
        return user


class PushSubscriptionSerializer(serializers.Serializer):
    """
    브라우저의 `subscription.toJSON()` 을 그대로 받는다.

    모양을 우리 취향대로 바꾸지 않는다 — 웹은 브라우저가 준 객체를 손대지 않고
    보내면 되고, 중간에서 키 이름을 갈아끼우면 규격이 바뀌었을 때 양쪽을 다 고쳐야 한다.
    """

    endpoint = serializers.URLField(max_length=500)
    keys = serializers.DictField(child=serializers.CharField(max_length=255))

    def validate_keys(self, value):
        missing = {"p256dh", "auth"} - value.keys()
        if missing:
            raise serializers.ValidationError(f"{', '.join(sorted(missing))} 가 없습니다.")
        return value
