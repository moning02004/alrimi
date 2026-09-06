from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .cookies import clear_refresh, read_refresh, set_refresh
from .serializers import (
    ChangePasswordSerializer,
    MeSerializer,
    ObtainTokenSerializer,
    UpdateMeSerializer,
)

User = get_user_model()


def issue(user):
    """access는 본문으로, refresh는 httpOnly 쿠키로 나간다."""
    refresh = RefreshToken.for_user(user)
    response = Response({"access_token": str(refresh.access_token)})
    return set_refresh(response, refresh)


class ObtainTokenView(APIView):
    """POST /auth/obtain-token — 로그인. 회원가입은 없다(계정은 관리자가 발급)."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def post(self, request):
        serializer = ObtainTokenSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data["user"]
        User.objects.filter(pk=user.pk).update(last_login=timezone.now())
        return issue(user)


class RefreshTokenView(APIView):
    """POST /auth/refresh-token — 쿠키의 refresh로 access를 다시 발급한다."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def post(self, request):
        raw = read_refresh(request)
        if not raw:
            return Response({"detail": "refresh 토큰이 없습니다."}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            refresh = RefreshToken(raw)
        except TokenError:
            # 만료·폐기된 쿠키가 남아 매번 401이 되는 상황을 막는다
            return clear_refresh(
                Response({"detail": "refresh 토큰이 유효하지 않습니다."}, status=status.HTTP_401_UNAUTHORIZED)
            )

        # 쿠키는 그대로 두고 access만 새로 준다. 같은 쿠키로 동시에 여러 번
        # 불려도 전부 성공해야 한다 (RefreshTokenView 주석 참고).
        return Response({"access_token": str(refresh.access_token)})


class RevokeTokenView(APIView):
    """DELETE /auth/token — 로그아웃. 쿠키를 지우고 refresh를 폐기한다."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def delete(self, request):
        raw = read_refresh(request)
        if raw:
            try:
                RefreshToken(raw).blacklist()
            except (TokenError, AttributeError):
                pass
        return clear_refresh(Response(status=status.HTTP_204_NO_CONTENT))


class MeView(APIView):
    """GET/PATCH /users/me"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(MeSerializer(request.user).data)

    def patch(self, request):
        serializer = UpdateMeSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        if "name" in serializer.validated_data:
            request.user.name = serializer.validated_data["name"]
            request.user.save(update_fields=["name"])
        return Response(MeSerializer(request.user).data)


class ChangePasswordView(APIView):
    """POST /users/me/password"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])

        # 비밀번호를 바꿨으면 기존 세션은 끊는다
        return clear_refresh(Response(status=status.HTTP_204_NO_CONTENT))
