"""refresh 토큰 쿠키를 다루는 자리. 설정은 settings.REFRESH_COOKIE 한 곳만 본다."""

from django.conf import settings
from rest_framework_simplejwt.tokens import RefreshToken


def cookie_name() -> str:
    return settings.REFRESH_COOKIE["name"]


def read_refresh(request) -> str | None:
    return request.COOKIES.get(cookie_name()) or None


def set_refresh(response, token: RefreshToken):
    conf = settings.REFRESH_COOKIE
    response.set_cookie(
        conf["name"],
        str(token),
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        path=conf["path"],
        domain=conf["domain"],
        secure=conf["secure"],
        httponly=True,
        samesite=conf["samesite"],
    )
    return response


def clear_refresh(response):
    conf = settings.REFRESH_COOKIE
    response.delete_cookie(
        conf["name"],
        path=conf["path"],
        domain=conf["domain"],
        samesite=conf["samesite"],
    )
    return response
