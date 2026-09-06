"""운영용. PostgreSQL + HTTPS 강제 + 필수 환경변수 검증."""

from .base import *  # noqa: F401,F403
from .base import MIDDLEWARE, REFRESH_COOKIE
from .env import env, env_bool, env_int, env_list, require

DEBUG = False

# 정적 파일은 gunicorn 앞에 웹서버를 두지 않아도 되도록 whitenoise가 맡는다
MIDDLEWARE = MIDDLEWARE.copy()
MIDDLEWARE.insert(
    MIDDLEWARE.index("django.middleware.security.SecurityMiddleware") + 1,
    "whitenoise.middleware.WhiteNoiseMiddleware",
)

SECRET_KEY = require("DJANGO_SECRET_KEY")
ALLOWED_HOSTS = require("DJANGO_ALLOWED_HOSTS").replace(" ", "").split(",")

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": require("POSTGRES_DB"),
        "USER": require("POSTGRES_USER"),
        "PASSWORD": require("POSTGRES_PASSWORD"),
        "HOST": env("POSTGRES_HOST", "127.0.0.1"),
        "PORT": env("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": env_int("POSTGRES_CONN_MAX_AGE", 60),
        "OPTIONS": {"connect_timeout": 5},
    }
}

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS") or CORS_ALLOWED_ORIGINS

# 프록시(nginx 등) 뒤에서 https 를 올바르게 인식하도록
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", True)
SECURE_HSTS_SECONDS = env_int("SECURE_HSTS_SECONDS", 60 * 60 * 24 * 30)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
X_FRAME_OPTIONS = "DENY"

# 웹과 API 도메인이 다르므로 SameSite=None + Secure 가 필수다.
REFRESH_COOKIE = {**REFRESH_COOKIE, "secure": True, "samesite": "None"}
