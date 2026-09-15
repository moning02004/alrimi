from django.contrib.auth import authenticate
from django.contrib.auth.validators import UnicodeUsernameValidator
from rest_framework import serializers

from .models import INITIAL_PASSWORD, User
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
    # 켜져 있으면 웹은 다른 화면 대신 비밀번호 변경만 보여준다. 서버도 막는다
    # (`accounts.authentication`) — 화면만 믿으면 주소를 직접 부르는 길이 남는다.
    must_change_password = serializers.BooleanField(read_only=True)
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

        # 처음 받는 비밀번호로 되돌아가지 못하게 한다. 길이 검사에서도 걸리지만, 그 말로는
        # 왜 안 되는지가 드러나지 않는다 — 검사를 느슨하게 바꾸는 날에도 이 줄은 남아야 한다.
        if value == INITIAL_PASSWORD:
            raise serializers.ValidationError(
                f"{INITIAL_PASSWORD} 은 처음 받는 비밀번호라 새 비밀번호로 쓸 수 없어요."
            )
        # 같은 값으로 "바꾸면" 강제 변경이 아무 일도 안 한 채 풀린다
        if self.context["request"].user.check_password(value):
            raise serializers.ValidationError("지금 비밀번호와 다른 비밀번호로 바꿔주세요.")

        try:
            validate_password(value, self.context["request"].user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value


class UserSerializer(serializers.ModelSerializer):
    """사용자 관리 목록의 한 줄. 비밀번호·토픽 같은 것은 싣지 않는다."""

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "name",
            "is_staff",
            "is_superuser",
            # 목록에 "비밀번호 변경 전" 을 적어, 추가해놓고 아직 안 들어온 사람을 알아보게 한다
            "must_change_password",
            "date_joined",
            "last_login",
        ]
        read_only_fields = fields


class UserCreateSerializer(serializers.Serializer):
    """
    사용자 추가. 이름과 아이디만 받는다 — **비밀번호는 받지 않고 늘 0000 으로 만든다.**

    추가하는 사람이 비밀번호를 정하게 하면 그 사람이 남의 비밀번호를 아는 채로 남는다.
    모두가 아는 값으로 만들고 첫 로그인에서 바꾸게 하면, 바뀐 뒤의 비밀번호는 본인만 안다.

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
        user = User(
            username=validated_data["username"],
            name=validated_data["name"],
            must_change_password=True,
        )
        # 비밀번호 검사(길이·숫자만)를 거치지 않는다. 0000 은 그 검사를 통과할 수 없는 값이고,
        # 그래서 바꿀 때는 받아주지 않는다.
        user.set_password(INITIAL_PASSWORD)
        user.save()
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
