from django.urls import path

from .views import (
    ChangePasswordView,
    MeView,
    ObtainTokenView,
    PushKeyView,
    PushSubscriptionView,
    PushTestView,
    RefreshTokenView,
    RevokeTokenView,
    UserDetailView,
    UserListCreateView,
    UserSearchView,
)

# APPEND_SLASH = False — 경로 끝에 슬래시를 붙이지 않는다.
auth_patterns = [
    path("auth/obtain-token", ObtainTokenView.as_view(), name="obtain-token"),
    path("auth/refresh-token", RefreshTokenView.as_view(), name="refresh-token"),
    path("auth/token", RevokeTokenView.as_view(), name="revoke-token"),
]

#  "me"·"change-password" 이름은 비밀번호를 안 바꾼 사람에게도 열리는 자리라
#  `accounts.authentication.ALLOWED_URL_NAMES` 가 이름으로 짚는다. 바꾸면 거기도 고친다.
user_patterns = [
    path("users/me", MeView.as_view(), name="me"),
    path("users/me/password", ChangePasswordView.as_view(), name="change-password"),
    # 사용자 관리. 추가는 관리자부터, 권한 변경·삭제는 최고 관리자만
    path("users", UserListCreateView.as_view(), name="users"),
    # 공간을 함께 볼 사람 찾기. 로그인한 누구나. `<int:user_id>` 보다 먼저 와야 한다
    path("users/search", UserSearchView.as_view(), name="user-search"),
    path("users/<int:user_id>", UserDetailView.as_view(), name="user-detail"),
]

#  웹 푸시. ntfy 는 토픽 하나로 끝나지만 이쪽은 기기마다 등록·해지가 필요해서
#  따로 자리를 낸다. 사람 계정에 딸린 것이라 users/ 아래로 넣을까 했는데, 브라우저가
#  다루는 것은 계정이 아니라 이 기기의 구독이라 경로도 그것을 말하게 뒀다.
push_patterns = [
    path("push/key", PushKeyView.as_view(), name="push-key"),
    path("push/subscriptions", PushSubscriptionView.as_view(), name="push-subscriptions"),
    path("push/test", PushTestView.as_view(), name="push-test"),
]

urlpatterns = auth_patterns + user_patterns + push_patterns
