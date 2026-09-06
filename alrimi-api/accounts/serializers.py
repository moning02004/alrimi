from django.contrib.auth import authenticate
from rest_framework import serializers

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

        try:
            validate_password(value, self.context["request"].user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value
