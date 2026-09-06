"""
.env 로더. `DJANGO_ENV`(local/prod)에 맞는 파일을 먼저 읽고, 없으면 `.env`를
읽는다. 이미 셸에 있는 환경변수는 덮어쓰지 않으므로 배포 환경에서는 파일 없이
환경변수만으로도 동작한다.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent

DJANGO_ENV = os.environ.get("DJANGO_ENV", "local")

for candidate in (BASE_DIR / f".env.{DJANGO_ENV}", BASE_DIR / ".env"):
    if candidate.exists():
        load_dotenv(candidate, override=False)


def env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


def env_bool(key: str, default: bool = False) -> bool:
    raw = os.environ.get(key)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_int(key: str, default: int) -> int:
    raw = os.environ.get(key)
    if raw is None or not raw.strip():
        return default
    return int(raw)


def env_list(key: str, default: list[str] | None = None) -> list[str]:
    raw = os.environ.get(key)
    if raw is None or not raw.strip():
        return list(default or [])
    return [item.strip() for item in raw.split(",") if item.strip()]


def require(key: str) -> str:
    """운영에서 빠지면 안 되는 값. 비어 있으면 부팅 단계에서 바로 알려준다."""
    value = os.environ.get(key, "").strip()
    if not value:
        raise RuntimeError(f"환경변수 {key} 가 필요합니다 (DJANGO_ENV={DJANGO_ENV})")
    return value
