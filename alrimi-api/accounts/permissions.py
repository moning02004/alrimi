"""
사람이 아니라 서버가 부르는 엔드포인트(크론 등)를 지키는 열쇠와, 사용자 관리 권한.
"""

import hmac

from django.conf import settings
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import BasePermission


class HasAPIKey(BasePermission):
    """
    `X-API-KEY` 헤더가 환경변수 `N8N_API_KEY` 와 같아야 통과한다.

    계정이 없으므로 인증이 아니라 권한으로 둔다 — 통과해도 `request.user` 는
    비어 있고, 뷰는 특정 사용자가 아니라 전체를 훑는다.
    """

    def has_permission(self, request, view):
        expected = settings.N8N_API_KEY
        if not expected:
            # 열쇠를 안 걸어둔 채 열어두면 아무나 들어온다. 막고 알린다.
            raise AuthenticationFailed("서버에 N8N_API_KEY 가 설정되어 있지 않습니다.")

        given = request.headers.get("X-API-KEY", "")
        # 길이·내용이 노출되지 않도록 상수 시간 비교를 쓴다.
        if not hmac.compare_digest(given, expected):
            raise AuthenticationFailed("API 키가 올바르지 않습니다.")

        return True


class CanAddUsers(BasePermission):
    """
    관리자(is_staff)와 최고 관리자(is_superuser). 사용자 목록을 보고 추가할 수 있다.

    최고 관리자는 is_staff 가 꺼져 있어도 들인다 — createsuperuser 로 만든 계정은 둘 다
    켜지지만, 관리자 사이트에서 손으로 하나만 켠 계정이 있을 수 있다.
    """

    message = "사용자를 추가할 권한이 없어요."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and (user.is_staff or user.is_superuser))


class IsSuperuser(BasePermission):
    """최고 관리자만. 권한을 주고 사용자를 지우는 자리다."""

    message = "최고 관리자만 할 수 있어요."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_superuser)
