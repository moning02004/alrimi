"""개발용. sqlite(도커면 postgres) + 느슨한 CORS + 쿠키 Secure 해제."""

from .base import *  # noqa: F401,F403
from .base import BASE_DIR, REFRESH_COOKIE
from .env import env, env_bool, env_list

DEBUG = env_bool("DJANGO_DEBUG", True)

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"])

# 도커로 띄우면 POSTGRES_* 가 들어온다. 그때만 postgres 를 쓰고, 없으면 sqlite 다 —
# 컨테이너 없이 `runserver` 만으로도 개발할 수 있어야 한다.
if env("POSTGRES_DB"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("POSTGRES_DB"),
            "USER": env("POSTGRES_USER"),
            "PASSWORD": env("POSTGRES_PASSWORD"),
            "HOST": env("POSTGRES_HOST", "127.0.0.1"),
            "PORT": env("POSTGRES_PORT", "5432"),
            "OPTIONS": {"connect_timeout": 5},
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / env("SQLITE_NAME", "db.sqlite3"),
        }
    }

CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS",
    ["http://localhost:3000", "http://127.0.0.1:3000"],
)

CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS

# http://localhost 에서는 Secure 쿠키가 저장되지 않는다.
REFRESH_COOKIE = {**REFRESH_COOKIE, "secure": False, "samesite": "Lax"}

# 개발 중에는 매니페스트가 없어도 정적 파일이 뜨도록
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
