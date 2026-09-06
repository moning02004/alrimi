from django.urls import path

from .views import (
    ChangePasswordView,
    MeView,
    ObtainTokenView,
    RefreshTokenView,
    RevokeTokenView,
)

# APPEND_SLASH = False — 경로 끝에 슬래시를 붙이지 않는다.
auth_patterns = [
    path("auth/obtain-token", ObtainTokenView.as_view(), name="obtain-token"),
    path("auth/refresh-token", RefreshTokenView.as_view(), name="refresh-token"),
    path("auth/token", RevokeTokenView.as_view(), name="revoke-token"),
]

user_patterns = [
    path("users/me", MeView.as_view(), name="me"),
    path("users/me/password", ChangePasswordView.as_view(), name="change-password"),
]

urlpatterns = auth_patterns + user_patterns
