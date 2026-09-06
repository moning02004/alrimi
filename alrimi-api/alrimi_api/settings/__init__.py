"""
DJANGO_SETTINGS_MODULE 은 항상 `alrimi_api.settings` 로 두고,
어떤 환경을 쓸지는 `DJANGO_ENV` 환경변수(local | prod)로 고른다.

    DJANGO_ENV=prod python manage.py migrate
"""

from .env import DJANGO_ENV

if DJANGO_ENV == "prod":
    from .prod import *  # noqa: F401,F403
elif DJANGO_ENV == "local":
    from .local import *  # noqa: F401,F403
else:
    raise RuntimeError(f"알 수 없는 DJANGO_ENV: {DJANGO_ENV!r} (local | prod)")
