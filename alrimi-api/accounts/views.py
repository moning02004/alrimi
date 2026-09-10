from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from notices.models import Priority

from .cookies import clear_refresh, read_refresh, set_refresh
from .models import PushSubscription
from .serializers import (
    ChangePasswordSerializer,
    MeSerializer,
    ObtainTokenSerializer,
    PushSubscriptionSerializer,
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


class PushKeyView(APIView):
    """
    GET /push/key → {"public_key": "...", "enabled": true}

    브라우저가 구독을 만들 때 이 공개키가 필요하다(`applicationServerKey`). 서버가
    쥐고 있다가 물을 때 주는 이유는, 키를 웹 빌드에 박아두면 서버에서 갈았을 때
    양쪽이 어긋난 채로 몇 시간씩 조용히 실패하기 때문이다.

    `enabled` 가 false 면 서버에 키가 없는 것이다 — 웹은 그때 알림 켜기 자리를
    아예 내주지 않는다. 눌러봐야 실패할 버튼을 보여주지 않으려는 것이다.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(
            {
                "public_key": settings.VAPID_PUBLIC_KEY or None,
                "enabled": bool(settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY),
            }
        )


class PushSubscriptionView(APIView):
    """
    POST   /push/subscriptions — 이 기기에서 알림을 받겠다
    DELETE /push/subscriptions — 그만 받겠다

    둘 다 endpoint 로 짚는다. endpoint 는 푸시 서비스가 기기마다 발급하는 주소라
    우리가 따로 기기 id 를 만들 필요가 없다.

    **덮어쓴다(update_or_create).** 같은 endpoint 가 다시 오는 것은 브라우저가 구독을
    되살린 경우다. 이때 409 를 주면 웹은 할 수 있는 일이 없다 — 그 구독이 이미 그
    사람 것이므로 조용히 갱신하는 편이 맞다.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PushSubscriptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        PushSubscription.objects.update_or_create(
            endpoint=data["endpoint"],
            defaults={
                "user": request.user,
                "p256dh": data["keys"]["p256dh"],
                "auth": data["keys"]["auth"],
                # 기기를 알아보는 유일한 단서다. 긴 UA 를 통째로 담아도 쓸모가 없어
                # 칸 길이까지만 자른다.
                "user_agent": request.headers.get("User-Agent", "")[:255],
            },
        )
        return Response(status=status.HTTP_201_CREATED)

    def delete(self, request):
        endpoint = request.data.get("endpoint")
        if not endpoint:
            return Response({"detail": "endpoint 가 필요합니다."}, status=status.HTTP_400_BAD_REQUEST)

        # 남의 구독을 지우지 못하도록 자기 것 안에서만 찾는다. 없으면 이미 없는
        # 것이므로 204 로 같게 답한다 — 웹은 어느 쪽이든 "꺼짐" 으로 그리면 된다.
        request.user.push_subscriptions.filter(endpoint=endpoint).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PushTestView(APIView):
    """
    POST /push/test — 지금 이 계정의 기기들로 시험 알림을 보낸다.

    권한을 켠 직후에 필요하다. 브라우저가 "허용" 을 받아도 실제로 알림이 뜨는지는
    한 번 받아봐야 알고(방해금지·집중모드·시스템 설정이 따로 막는다), 진짜 일정이
    올 때까지 기다려서 확인할 수는 없다.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from notices.webpush import send_to_user

        delivered = send_to_user(
            request.user,
            title="일정 알리미",
            message="알림이 잘 도착했어요. 이제 일정 시각에 맞춰 알려드릴게요.",
            priority=Priority.NORMAL,
            # 누를 때마다 다른 이름을 준다. 진짜 알림은 같은 묶음이 두 번 와도 하나로
            # 덮이는 것이 맞지만(크론이 따라잡을 때), 시험은 눌렀는데 아무 일도
            # 일어나지 않으면 그것이야말로 확인하려던 실패와 구별되지 않는다.
            tag=f"test-{timezone.now().timestamp():.0f}",
        )
        if not delivered:
            # 기기가 없거나 전부 실패했다. 어느 쪽인지 사람이 할 일이 다르므로 나눠 말한다.
            detail = (
                "이 계정에 등록된 기기가 없어요. 알림 받기를 먼저 켜주세요."
                if not request.user.push_subscriptions.exists()
                else "등록된 기기에 보내지 못했어요. 알림 권한이 꺼져 있을 수 있어요."
            )
            return Response({"detail": detail}, status=status.HTTP_502_BAD_GATEWAY)

        return Response({"delivered": delivered})
