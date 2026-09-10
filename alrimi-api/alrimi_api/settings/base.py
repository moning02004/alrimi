"""
환경 공통 설정. local/prod가 이 모듈을 읽고 각자 필요한 부분만 덮어쓴다.
"""

from datetime import timedelta
from pathlib import Path


from .env import env, env_int, env_list

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = env("DJANGO_SECRET_KEY", "django-insecure-local-only-do-not-use-in-prod")

DEBUG = False
ALLOWED_HOSTS: list[str] = env_list("DJANGO_ALLOWED_HOSTS")

APP_VERSION = env("APP_VERSION", "0.1.0")

# ── 앱 ────────────────────────────────────────────────────────────────

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "accounts",
    "zones",
    "notices",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "alrimi_api.urls"
WSGI_APPLICATION = "alrimi_api.wsgi.application"
ASGI_APPLICATION = "alrimi_api.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# 웹 클라이언트가 경로 끝에 슬래시를 붙이지 않는다. 리다이렉트가 나가면
# POST 본문이 사라지므로 반드시 꺼둔다.
APPEND_SLASH = False
AUTH_USER_MODEL = "accounts.User"

# ── 인증 ──────────────────────────────────────────────────────────────

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# 크론이 부르는 엔드포인트(주간 정리·매시 확인)를 지키는 열쇠. 계정과 무관한
# 서버 대 서버용이라 DB 가 아니라 환경변수에 둔다. 비어 있으면 그 엔드포인트는
# 통과하지 못한다 — 열쇠 없이 열려 있는 상태를 만들지 않는다.
N8N_API_KEY = env("N8N_API_KEY")

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "UNAUTHENTICATED_USER": None,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env_int("ACCESS_TOKEN_MINUTES", 30)),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=env_int("REFRESH_TOKEN_DAYS", 30)),
    # 회전은 끈다. 웹은 부트스트랩(useAuthBootstrap)과 api.ts 재시도가 각각
    # refresh를 부르고 StrictMode에서 두 번 실행되므로, 같은 쿠키를 든 요청이
    # 여러 개 동시에 뜬다. 회전시키면 그중 하나만 살고 나머지는 401을 받아
    # 프런트가 로그아웃 처리해버린다. 폐기는 로그아웃에서만 한다.
    "ROTATE_REFRESH_TOKENS": False,
    "BLACKLIST_AFTER_ROTATION": False,
    "UPDATE_LAST_LOGIN": True,
}

# refresh 토큰은 httpOnly 쿠키로만 오간다. 응답 본문에는 access만 담는다.
REFRESH_COOKIE = {
    "name": "alrimi_refresh",
    "path": "/auth",
    "domain": env("REFRESH_COOKIE_DOMAIN") or None,
    "secure": True,
    "samesite": "None",
}

# ── 데이터베이스 ──────────────────────────────────────────────────────

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ── 지역 ──────────────────────────────────────────────────────────────

LANGUAGE_CODE = "ko-kr"
TIME_ZONE = "Asia/Seoul"
USE_I18N = True
USE_TZ = True

# ── 정적 파일 ─────────────────────────────────────────────────────────

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# ── 알림 ──────────────────────────────────────────────────────────────

# ntfy 서버 주소. 구독 링크(ntfy://<host>/<topic>) 조립과 발송이 같은 곳을 본다.
NTFY_BASE_URL = env("NTFY_BASE_URL", "https://ntfy.sh").rstrip("/")

# 발행 계정. ACL 을 건 서버에서만 필요하다 — 비워두면 열린 서버로 보고 그냥 쏜다.
NTFY_USER = env("NTFY_USER")
NTFY_PASSWORD = env("NTFY_PASSWORD")

# 상세 화면의 "보내기" 가 이 시간만큼 기다린다. 길면 누른 사람이 멈춘 줄 안다.
NTFY_TIMEOUT_SECONDS = env_int("NTFY_TIMEOUT_SECONDS", 5)

# ── 웹 푸시 ───────────────────────────────────────────────────────────
#
# ntfy 와 **함께** 나간다. ntfy 앱을 깔지 않은 사람에게도 알림이 닿게 하려는 것이라,
# 둘 중 하나가 비어 있어도 나머지는 그대로 동작해야 한다.
#
# VAPID 키는 "이 서버가 보냈다"를 푸시 서비스에 증명하는 한 쌍이다. 공개키는 브라우저에
# 그대로 건네고(구독을 만들 때 필요하다), 개인키는 서버에만 둔다.
#   python manage.py webpush_keys 로 한 쌍을 만들어 .env 에 붙인다.
#
# **키를 바꾸면 기존 구독이 전부 죽는다.** 구독은 그때의 공개키에 묶여 발급되므로,
# 새 키로 보내면 푸시 서비스가 403 을 준다. 한 번 정하면 그대로 둔다.
VAPID_PUBLIC_KEY = env("VAPID_PUBLIC_KEY")
VAPID_PRIVATE_KEY = env("VAPID_PRIVATE_KEY")

# 푸시 서비스가 문제가 생겼을 때 연락할 곳. 규격이 요구하는 값이라 형식만 맞으면 된다.
VAPID_CLAIM_EMAIL = env("VAPID_CLAIM_EMAIL", "admin@alrimi.jeonghoon.dev")

# 알림을 눌렀을 때 열 곳. 서비스 워커가 이 주소로 창을 띄운다.
WEB_ORIGIN = env("WEB_ORIGIN", "https://alrimi.jeonghoon.dev").rstrip("/")

WEBPUSH_TIMEOUT_SECONDS = env_int("WEBPUSH_TIMEOUT_SECONDS", 10)

# 기기가 꺼져 있으면 푸시 서비스가 이 시간만큼 들고 있다가 버린다. 하루를 넘겨
# 배달된 "내일 일정" 은 이미 틀린 말이라, 크론이 따라잡는 창(6시간)에 맞춘다.
WEBPUSH_TTL_SECONDS = env_int("WEBPUSH_TTL_SECONDS", 6 * 60 * 60)


# ── CORS ──────────────────────────────────────────────────────────────

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")

# ── 로깅 ──────────────────────────────────────────────────────────────

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "simple": {"format": "{asctime} {levelname} {name} {message}", "style": "{"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "simple"},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django.request": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}
