import logging
import secrets

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from django.shortcuts import redirect
from django.urls import reverse
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import client, sync
from .models import GoogleCalendarLink

logger = logging.getLogger(__name__)
User = get_user_model()

STATE_SALT = "google-calendar-connect"
#  동의 화면에서 머뭇거릴 시간. 넘기면 처음부터 다시 누른다.
STATE_MAX_AGE = 10 * 60
STATE_COOKIE = "alrimi_google_state"
STATE_COOKIE_PATH = "/google"


def redirect_uri(request) -> str:
    """
    구글 콘솔에 적은 주소와 **글자 하나까지** 같아야 한다. 프록시 뒤에서는 스스로 만든
    주소가 어긋나기 쉬워서 환경변수를 먼저 본다.
    """
    return settings.GOOGLE_REDIRECT_URI or request.build_absolute_uri(reverse("google-calendar-callback"))


class GoogleCalendarView(APIView):
    """
    GET    /google/calendar → 연결 상태
    DELETE /google/calendar → 연결을 끊는다 (구글에 만든 캘린더도 지운다)

    `enabled` 가 false 면 서버에 구글 앱 설정이 없다. 웹은 그때 이 줄을 아예 그리지 않는다
    — 웹 푸시의 `/push/key` 와 같은 규칙이다.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        link = GoogleCalendarLink.objects.filter(user=request.user).first()
        return Response(
            {
                "enabled": client.configured(),
                "connected": link is not None and link.broken_at is None,
                "broken": link is not None and link.broken_at is not None,
                "email": link.email if link else None,
                "last_synced_at": link.last_synced_at if link else None,
                "last_error": link.last_error if link else "",
            }
        )

    def delete(self, request):
        link = GoogleCalendarLink.objects.filter(user=request.user).first()
        if link is not None:
            sync.disconnect(link)
        return Response(status=status.HTTP_204_NO_CONTENT)


class GoogleCalendarConnectView(APIView):
    """
    POST /google/calendar/connect → {"url": "https://accounts.google.com/..."}

    웹은 받은 주소로 창을 옮기기만 한다. 동의가 끝나면 구글이 브라우저를
    `/google/calendar/callback` 으로 돌려보낸다.

    **state 에 사람을 싣고, 같은 값을 쿠키에도 둔다.** 돌아오는 요청은 브라우저 이동이라
    로그인 토큰(Authorization 헤더)이 없어서, 누구의 연결인지는 서명한 state 로만 안다.
    그런데 state 만 보면 남이 자기 계정으로 받아둔 링크를 내게 누르게 해서 **내 구글
    캘린더를 그 사람 계정에 붙이는** 일이 된다. 누른 브라우저가 연결을 시작한 그
    브라우저인지를 쿠키로 맞춰본다.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not client.configured():
            return Response(
                {"detail": "구글 캘린더 연동이 설정되지 않았어요."}, status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        nonce = secrets.token_urlsafe(16)
        state = signing.dumps({"u": request.user.pk, "n": nonce}, salt=STATE_SALT)
        response = Response({"url": client.authorize_url(redirect_uri=redirect_uri(request), state=state)})

        conf = settings.REFRESH_COOKIE
        response.set_cookie(
            STATE_COOKIE,
            nonce,
            max_age=STATE_MAX_AGE,
            path=STATE_COOKIE_PATH,
            domain=conf["domain"],
            secure=conf["secure"],
            httponly=True,
            samesite=conf["samesite"],
        )
        return response


class GoogleCalendarCallbackView(APIView):
    """
    GET /google/calendar/callback?code=&state= — 구글이 브라우저를 돌려보내는 자리.

    끝나면 웹의 설정 화면으로 보낸다. 결과는 `?google=` 에 싣는다:
    `connected` · `denied`(동의 화면에서 취소) · `scope`(캘린더 권한만 빼고 허용) · `error`

    JSON 으로 답하지 않는 것은 이 요청을 연 것이 사람의 브라우저라서다 — 여기서
    멈추면 API 주소에 JSON 한 줄이 떠 있는 화면을 보게 된다.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request):
        nonce = request.COOKIES.get(STATE_COOKIE)

        def back(result: str):
            response = redirect(f"{settings.WEB_ORIGIN}/settings?google={result}")
            response.delete_cookie(
                STATE_COOKIE,
                path=STATE_COOKIE_PATH,
                domain=settings.REFRESH_COOKIE["domain"],
                samesite=settings.REFRESH_COOKIE["samesite"],
            )
            return response

        if request.query_params.get("error"):
            return back("denied")

        try:
            payload = signing.loads(
                request.query_params.get("state", ""), salt=STATE_SALT, max_age=STATE_MAX_AGE
            )
        except signing.BadSignature:
            return back("error")
        if not nonce or payload.get("n") != nonce:
            return back("error")

        user = User.objects.filter(pk=payload.get("u"), is_active=True).first()
        code = request.query_params.get("code")
        if user is None or not code:
            return back("error")

        try:
            tokens = client.exchange_code(code, redirect_uri=redirect_uri(request))
        except client.GoogleError as exc:
            logger.warning("google token exchange failed: status=%s", exc.status)
            return back("error")

        refresh_token = tokens.get("refresh_token")
        # 동의 화면에서 권한을 하나씩 끌 수 있다. 캘린더만 빼고 허용하면 연결은 되는데
        # 아무것도 못 쓰므로, 반쪽으로 붙이지 않고 돌려보낸다.
        if client.CALENDAR_SCOPE not in tokens.get("scope", "").split() or not refresh_token:
            try:
                client.revoke(refresh_token or tokens.get("access_token", ""))
            except client.GoogleError:
                pass
            return back("scope")

        email = client.email_from_id_token(tokens.get("id_token"))
        link = GoogleCalendarLink.objects.filter(user=user).first() or GoogleCalendarLink(user=user)
        # 같은 계정으로 다시 붙이면(끊겼다가 되살리는 경우) 캘린더를 이어 쓴다.
        # 다른 계정이면 옛 캘린더는 그 계정 것이라 여기서 쓸 수 없다.
        if link.email != email:
            link.calendar_id = ""
        link.email = email
        link.refresh_token = refresh_token
        link.access_token = tokens.get("access_token", "")
        link.access_expires_at = None  # 만료 시각을 모르는 채 믿지 않는다. 처음 쓸 때 새로 받는다
        link.broken_at = None
        link.last_error = ""
        link.last_synced_at = None
        link.save()

        # 이미 있는 일정을 옮겨 담는다. 수십 건이면 몇 초 걸리므로 기다리게 하지 않는다.
        sync.schedule(sync.resync, user.pk)
        return back("connected")


class GoogleCalendarSyncView(APIView):
    """
    POST /google/calendar/sync — 전체를 다시 맞춘다. 202 로 곧바로 답하고 뒤에서 돈다.

    구글에서 일정을 지우거나 고쳐버렸을 때, 서버가 재시작하느라 줄 서 있던 반영이
    사라졌을 때 사람이 누르는 버튼이다.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        link = GoogleCalendarLink.objects.filter(user=request.user, broken_at__isnull=True).first()
        if link is None:
            return Response({"detail": "연결된 구글 캘린더가 없어요."}, status=status.HTTP_400_BAD_REQUEST)
        sync.schedule(sync.resync, request.user.pk)
        return Response(status=status.HTTP_202_ACCEPTED)
