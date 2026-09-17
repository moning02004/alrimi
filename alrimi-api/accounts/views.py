from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.shortcuts import get_object_or_404
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
from .permissions import CanAddUsers, IsSuperuser
from .serializers import (
    ChangePasswordSerializer,
    MeSerializer,
    ObtainTokenSerializer,
    PushSubscriptionSerializer,
    UpdateMeSerializer,
    UserCreateSerializer,
    UserRoleSerializer,
    UserSerializer,
)

User = get_user_model()


def issue(user):
    """access는 본문으로, refresh는 httpOnly 쿠키로 나간다."""
    refresh = RefreshToken.for_user(user)
    response = Response({"access_token": str(refresh.access_token)})
    return set_refresh(response, refresh)


class ObtainTokenView(APIView):
    """POST /auth/obtain-token — 로그인. 회원가입은 없다(계정은 관리자가 추가한다)."""

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
    """
    POST /users/me/password → {"access_token"} + 새 refresh 쿠키

    처음 받은 비밀번호(0000)로 들어온 사람도 여기는 부를 수 있다
    (`accounts.authentication.ALLOWED_URL_NAMES`). 바꾸면 강제 변경이 풀린다.

    **로그인은 끊지 않고 새 토큰을 준다.** 예전에는 쿠키를 지워 다시 로그인하게 했는데,
    첫 로그인이면 "0000 으로 로그인 → 바꾸기 → 새 비밀번호로 또 로그인" 이 되어 들어오는
    데만 세 번을 거친다. 방금 현재 비밀번호를 맞힌 사람이라 다시 물을 까닭이 없다.

    이 브라우저의 refresh 쿠키는 새것으로 덮인다. 옛 토큰을 폐기(blacklist)하지는 못한다 —
    쿠키가 `/auth` 경로에만 실려 이 요청에는 오지 않는다. 쿠키를 지우던 예전에도 같았다.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        request.user.set_password(serializer.validated_data["new_password"])
        request.user.must_change_password = False
        request.user.save(update_fields=["password", "must_change_password"])

        return issue(request.user)


class UserListCreateView(APIView):
    """
    GET  /users → 사용자 목록
    POST /users {"username", "name"} → 추가. 비밀번호는 늘 0000 이다

    관리자와 최고 관리자가 부른다. 관리자가 할 수 있는 것은 **여기까지**다 —
    권한을 바꾸고 지우는 것은 `UserDetailView` 이고 최고 관리자만 들어간다.
    """

    permission_classes = [IsAuthenticated, CanAddUsers]

    def get(self, request):
        # 권한이 높은 사람이 위로. 같은 등급 안에서는 아이디 순이다
        users = User.objects.order_by("-is_superuser", "-is_staff", "username")
        return Response(UserSerializer(users, many=True).data)

    def post(self, request):
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class UserSearchView(APIView):
    """
    GET /users/search?q=엄 → [{id, username, name}, ...] (최대 10명)

    공간을 함께 볼 사람을 고를 때 쓴다. **로그인한 누구나** 부를 수 있다 — 관리자
    목록(`/users`)과 달리 권한·가입일·마지막 로그인 같은 것은 싣지 않고, 고르는 데 드는
    이름과 아이디만 준다. 이 서비스의 계정은 관리자가 넣은 몇 사람이라 서로 찾을 수
    있어야 가족끼리 나눠 볼 수 있다.

    한 글자부터 찾는다. 빈 말로는 아무도 주지 않는다 — 목록 전체를 한 번에 훑어가는
    길을 열지 않으려는 것이다. 나 자신과 비활성 계정은 빠진다.
    """

    permission_classes = [IsAuthenticated]
    LIMIT = 10

    def get(self, request):
        q = request.query_params.get("q", "").strip()
        if not q:
            return Response([])
        users = (
            User.objects.filter(is_active=True)
            .exclude(pk=request.user.pk)
            .filter(Q(username__icontains=q) | Q(name__icontains=q))
            .order_by("name", "username")[: self.LIMIT]
        )
        return Response([{"id": u.pk, "username": u.username, "name": u.name} for u in users])


class UserDetailView(APIView):
    """
    PATCH  /users/{id} {"is_staff"?, "is_superuser"?} → 권한 바꾸기
    DELETE /users/{id} → 삭제

    최고 관리자만. **자기 자신은 건드리지 못한다** — 자기 최고 관리자를 끄거나 자기를
    지우면, 그 사람이 마지막 최고 관리자였을 때 권한을 되돌려줄 사람이 남지 않는다.
    """

    permission_classes = [IsAuthenticated, IsSuperuser]

    def patch(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        if user.pk == request.user.pk:
            return Response({"detail": "자기 권한은 바꿀 수 없어요."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = UserRoleSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(user).data)

    def delete(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        if user.pk == request.user.pk:
            return Response({"detail": "자기 계정은 지울 수 없어요."}, status=status.HTTP_400_BAD_REQUEST)

        # 구글 캘린더에 붙어 있으면 먼저 끊는다. 계정만 지우면 구글 쪽 권한과 우리가 만든
        # 캘린더가 주인 없이 남는다 — 되는 데까지만 하고, 막혀도 삭제는 계속한다.
        from google_calendar.models import GoogleCalendarLink
        from google_calendar.sync import disconnect

        for link in GoogleCalendarLink.objects.filter(user=user):
            disconnect(link)

        # 공간·일정·알림 구독은 모델에서 함께 지워진다(on_delete=CASCADE)
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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
