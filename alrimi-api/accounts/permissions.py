"""
사람이 아니라 서버가 부르는 엔드포인트(크론 등)를 지키는 열쇠.

계정이 없으므로 인증이 아니라 권한으로 둔다 — 통과해도 `request.user` 는
비어 있고, 뷰는 특정 사용자가 아니라 전체를 훑는다.
"""

import hmac

from django.conf import settings
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import BasePermission


class HasAPIKey(BasePermission):
    """`X-API-KEY` 헤더가 환경변수 `N8N_API_KEY` 와 같아야 통과한다."""

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
