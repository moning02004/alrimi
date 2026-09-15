"""
로그인 토큰 확인에 "비밀번호부터 바꿔라" 를 얹는다.

관리자가 추가한 계정은 누구나 아는 비밀번호(0000)로 시작한다. 화면에서만 막으면
주소를 직접 부르는 것으로 그대로 쓸 수 있으므로, 토큰을 확인하는 이 자리에서 막는다.
뷰마다 권한을 따로 거는 방식으로는 안 된다 — 뷰 대부분이 `permission_classes` 를
직접 적어 기본값을 덮어서, 한 곳이라도 빠뜨리면 그 길로 들어온다. 인증은 거의 모든
뷰가 기본값을 그대로 쓴다.
"""

from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication

#  비밀번호를 안 바꾼 사람도 부를 수 있는 자리. 화면이 "바꿔주세요" 를 그리려면
#  자기 정보가 필요하고, 바꾸는 자리 자체는 열려 있어야 한다. 로그인·재발급·
#  로그아웃은 애초에 이 인증을 거치지 않는다(`authentication_classes = []`).
ALLOWED_URL_NAMES = {"me", "change-password"}


class PasswordChangeRequired(PermissionDenied):
    default_detail = "처음 받은 비밀번호를 먼저 바꿔주세요."
    default_code = "password_change_required"


class PasswordGateJWTAuthentication(JWTAuthentication):
    """
    토큰은 멀쩡한데 비밀번호를 아직 안 바꿨으면 403 이다.

    401 로 답하지 않는다 — 웹은 401 을 받으면 토큰을 다시 받아 한 번 더 부르고, 그래도
    안 되면 로그아웃시킨다. 여기서 401 을 주면 비밀번호를 바꾸러 가기도 전에 쫓겨난다.
    """

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None

        user, _token = result
        if user.must_change_password:
            match = request._request.resolver_match
            if match is None or match.url_name not in ALLOWED_URL_NAMES:
                raise PasswordChangeRequired()
        return result
