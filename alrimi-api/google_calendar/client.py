"""
구글 OAuth 와 캘린더 API 를 부르는 얇은 층.

라이브러리(google-api-python-client)를 들이지 않았다. 쓰는 것은 엔드포인트 여남은
개뿐인데 그쪽은 딸려 오는 의존성이 크고, ntfy(`notices/ntfy.py`)도 urllib 로 부른다.

여기서는 **HTTP 만 한다.** 무엇을 언제 보낼지는 `sync.py` 가 정한다.
"""

import json
import logging
from base64 import urlsafe_b64decode
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from django.conf import settings

logger = logging.getLogger(__name__)

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
API_BASE = "https://www.googleapis.com/calendar/v3"

#  이 앱이 만든 캘린더만 다룰 수 있는 권한. 사람의 다른 캘린더는 읽지도 못한다.
CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created"
#  openid·email 은 "어느 계정에 붙었나" 를 설정 화면에 적으려고 받는다.
SCOPES = ["openid", "email", CALENDAR_SCOPE]


class GoogleError(Exception):
    """구글이 거절했거나 닿지 못했다. `status` 가 0 이면 닿지 못한 것이다."""

    def __init__(self, status: int, detail: str = ""):
        super().__init__(f"google {status}: {detail[:200]}")
        self.status = status
        self.detail = detail


class TokenRevoked(GoogleError):
    """refresh 토큰이 죽었다. 사람이 다시 연결하는 수밖에 없다."""


def configured() -> bool:
    return bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)


def _call(method: str, url: str, *, body=None, form=None, token: str | None = None):
    headers = {}
    data = None
    if form is not None:
        data = urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body, ensure_ascii=False).encode()
        headers["Content-Type"] = "application/json; charset=utf-8"
    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=settings.GOOGLE_TIMEOUT_SECONDS) as response:
            raw = response.read()
    except HTTPError as exc:
        detail = exc.read()[:1000].decode(errors="replace")
        raise GoogleError(exc.code, detail) from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise GoogleError(0, str(exc)) from exc
    return json.loads(raw) if raw else None


# ── OAuth ─────────────────────────────────────────────────────────────


def authorize_url(*, redirect_uri: str, state: str) -> str:
    return AUTH_URL + "?" + urlencode(
        {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(SCOPES),
            # 사람이 자리에 없을 때(일정을 고친 뒤 뒤에서) 써야 하므로 refresh 토큰이 필요하다
            "access_type": "offline",
            # 전에 허용한 계정은 동의 화면을 건너뛰면서 refresh 토큰을 다시 안 준다.
            # 끊었다 다시 붙일 때 그러면 연결이 반쪽이 되므로 매번 묻는다.
            "prompt": "consent",
            "state": state,
        }
    )


def exchange_code(code: str, *, redirect_uri: str) -> dict:
    return _call(
        "POST",
        TOKEN_URL,
        form={
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
    )


def refresh(refresh_token: str) -> dict:
    try:
        return _call(
            "POST",
            TOKEN_URL,
            form={
                "refresh_token": refresh_token,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "grant_type": "refresh_token",
            },
        )
    except GoogleError as exc:
        # 권한을 거뒀거나 토큰이 만료됐다. 5xx·네트워크는 저쪽 사정이라 끊긴 것으로 보지 않는다
        if exc.status in (400, 401) and "invalid_grant" in exc.detail:
            raise TokenRevoked(exc.status, exc.detail) from exc
        raise


def revoke(token: str) -> None:
    _call("POST", REVOKE_URL, form={"token": token})


def email_from_id_token(id_token: str | None) -> str:
    """
    토큰 응답에 딸려 온 id_token 에서 이메일만 꺼낸다.

    서명은 검사하지 않는다 — 방금 TLS 로 구글 토큰 엔드포인트에서 직접 받은 값이고,
    쓰는 곳도 화면에 "어느 계정" 을 적는 것뿐이다.
    """
    try:
        payload = (id_token or "").split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(urlsafe_b64decode(payload)).get("email", "")
    except (IndexError, ValueError):
        return ""


# ── 캘린더 ────────────────────────────────────────────────────────────


def _calendar_url(calendar_id: str) -> str:
    return f"{API_BASE}/calendars/{quote(calendar_id, safe='')}"


def create_calendar(token: str, *, summary: str, description: str) -> dict:
    return _call(
        "POST",
        f"{API_BASE}/calendars",
        token=token,
        body={"summary": summary, "description": description, "timeZone": settings.TIME_ZONE},
    )


def calendar_exists(token: str, calendar_id: str) -> bool:
    try:
        _call("GET", _calendar_url(calendar_id) + "?fields=id", token=token)
    except GoogleError as exc:
        if exc.status in (404, 410):
            return False
        raise
    return True


def delete_calendar(token: str, calendar_id: str) -> None:
    try:
        _call("DELETE", _calendar_url(calendar_id), token=token)
    except GoogleError as exc:
        if exc.status not in (404, 410):
            raise


def update_event(token: str, calendar_id: str, event_id: str, body: dict) -> dict:
    """
    PUT 이다. 구글에서 지워진(cancelled) 일정도 이것으로 되살아난다 —
    지운 id 로 insert 하면 409 가 난다.
    """
    return _call(
        "PUT", f"{_calendar_url(calendar_id)}/events/{quote(event_id)}", token=token, body=body
    )


def insert_event(token: str, calendar_id: str, body: dict) -> dict:
    return _call("POST", f"{_calendar_url(calendar_id)}/events", token=token, body=body)


def delete_event(token: str, calendar_id: str, event_id: str) -> None:
    try:
        _call("DELETE", f"{_calendar_url(calendar_id)}/events/{quote(event_id)}", token=token)
    except GoogleError as exc:
        # 이미 없다. 지우려던 결과와 같다.
        if exc.status not in (404, 410):
            raise


def list_event_ids(token: str, calendar_id: str) -> set[str]:
    ids: set[str] = set()
    page = None
    while True:
        params = {"showDeleted": "false", "maxResults": "2500", "fields": "items(id),nextPageToken"}
        if page:
            params["pageToken"] = page
        data = _call("GET", f"{_calendar_url(calendar_id)}/events?{urlencode(params)}", token=token)
        ids.update(item["id"] for item in data.get("items", []))
        page = data.get("nextPageToken")
        if not page:
            return ids
