import datetime as dt
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from django.contrib.auth import get_user_model
from django.core import signing
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from notices.models import Event
from zones.models import Zone

from . import client
from .models import GoogleCalendarLink
from .sync import google_event_id
from .views import STATE_COOKIE, STATE_SALT

User = get_user_model()


class FakeGoogle:
    """구글 쪽을 흉내 낸다. 캘린더마다 id → 본문."""

    def __init__(self):
        self.calendars: dict[str, dict[str, dict]] = {}
        self.revoked: list[str] = []
        self.refresh_calls = 0
        self.refresh_error: Exception | None = None

    def install(self, test: TestCase):
        names = [
            "refresh", "revoke", "exchange_code", "create_calendar", "calendar_exists",
            "delete_calendar", "update_event", "insert_event", "delete_event", "list_event_ids",
        ]
        patcher = patch.multiple(client, **{name: getattr(self, name) for name in names})
        patcher.start()
        test.addCleanup(patcher.stop)

    def refresh(self, refresh_token):
        self.refresh_calls += 1
        if self.refresh_error:
            raise self.refresh_error
        return {"access_token": "access", "expires_in": 3600}

    def revoke(self, token):
        self.revoked.append(token)

    def exchange_code(self, code, *, redirect_uri):
        return {
            "access_token": "access",
            "refresh_token": "refresh",
            "scope": f"openid email {client.CALENDAR_SCOPE}",
            # {"email": "hoon@example.com"} 를 담은 서명 없는 id_token
            "id_token": "x.eyJlbWFpbCI6Imhvb25AZXhhbXBsZS5jb20ifQ.x",
        }

    def create_calendar(self, token, *, summary, description):
        calendar_id = f"cal{len(self.calendars) + 1}@group.calendar.google.com"
        self.calendars[calendar_id] = {}
        return {"id": calendar_id}

    def calendar_exists(self, token, calendar_id):
        return calendar_id in self.calendars

    def delete_calendar(self, token, calendar_id):
        self.calendars.pop(calendar_id, None)

    def update_event(self, token, calendar_id, event_id, body):
        if calendar_id not in self.calendars or event_id not in self.calendars[calendar_id]:
            raise client.GoogleError(404, "notFound")
        self.calendars[calendar_id][event_id] = body
        return body

    def insert_event(self, token, calendar_id, body):
        if calendar_id not in self.calendars:
            raise client.GoogleError(404, "notFound")
        self.calendars[calendar_id][body["id"]] = body
        return body

    def delete_event(self, token, calendar_id, event_id):
        self.calendars.get(calendar_id, {}).pop(event_id, None)

    def list_event_ids(self, token, calendar_id):
        return set(self.calendars[calendar_id])


@override_settings(
    GOOGLE_CLIENT_ID="client-id",
    GOOGLE_CLIENT_SECRET="client-secret",
    GOOGLE_REDIRECT_URI="http://testserver/google/calendar/callback",
    GOOGLE_CALENDAR_SYNC_INLINE=True,
    WEB_ORIGIN="http://web.test",
)
class GoogleCalendarTestCase(TestCase):
    def setUp(self):
        self.google = FakeGoogle()
        self.google.install(self)
        self.user = User.objects.create_user("hoon", password="pw-strong-1234")
        self.zone = Zone.objects.create(owner=self.user, name="어린이집")
        self.day = timezone.localdate() + dt.timedelta(days=3)

    def auth(self):
        from rest_framework_simplejwt.tokens import RefreshToken

        return {"authorization": f"Bearer {RefreshToken.for_user(self.user).access_token}"}

    def link(self, **fields):
        self.google.calendars["cal0"] = {}
        return GoogleCalendarLink.objects.create(
            user=self.user, email="hoon@example.com", refresh_token="refresh", calendar_id="cal0", **fields
        )

    @property
    def remote(self) -> dict[str, dict]:
        return self.google.calendars["cal0"]

    def create_event(self, **fields):
        with self.captureOnCommitCallbacks(execute=True):
            return Event.objects.create(
                zone=self.zone, event_date=fields.pop("event_date", self.day), title="체육복", **fields
            )


class EventMirrorTests(GoogleCalendarTestCase):
    def test_new_event_lands_in_the_calendar_as_an_all_day_event(self):
        self.link()
        event = self.create_event(content="흰 티셔츠")

        body = self.remote[google_event_id(event.pk)]
        self.assertEqual(body["summary"], "[어린이집] 체육복")
        self.assertEqual(body["description"], "흰 티셔츠")
        self.assertEqual(body["start"], {"date": self.day.isoformat()})
        # 구글의 종일 일정은 끝을 포함하지 않는다
        self.assertEqual(body["end"], {"date": (self.day + dt.timedelta(days=1)).isoformat()})

    def test_google_reminders_are_off(self):
        """알리미가 이미 알린다. 구글까지 울리면 같은 일로 두 번 받는다."""
        self.link()
        event = self.create_event()
        self.assertEqual(
            self.remote[google_event_id(event.pk)]["reminders"], {"useDefault": False, "overrides": []}
        )

    def test_event_with_an_hour_is_a_one_hour_slot(self):
        self.link()
        event = self.create_event(event_hour=7)

        body = self.remote[google_event_id(event.pk)]
        self.assertEqual(dt.datetime.fromisoformat(body["start"]["dateTime"]).hour, 7)
        self.assertEqual(dt.datetime.fromisoformat(body["end"]["dateTime"]).hour, 8)

    def test_multi_day_event_stays_all_day_even_with_an_hour(self):
        self.link()
        event = self.create_event(event_hour=9, end_date=self.day + dt.timedelta(days=2))

        body = self.remote[google_event_id(event.pk)]
        self.assertEqual(body["end"], {"date": (self.day + dt.timedelta(days=3)).isoformat()})

    def test_edit_through_the_api_updates_the_calendar(self):
        self.link()
        event = self.create_event()

        with self.captureOnCommitCallbacks(execute=True):
            res = self.client.patch(
                reverse("event-detail", args=[event.pk]),
                {"title": "소풍"},
                content_type="application/json",
                headers=self.auth(),
            )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.remote[google_event_id(event.pk)]["summary"], "[어린이집] 소풍")

    def test_holding_removes_it_and_resuming_brings_it_back(self):
        self.link()
        event = self.create_event()

        with self.captureOnCommitCallbacks(execute=True):
            event.held_at = timezone.now()
            event.save()
        self.assertNotIn(google_event_id(event.pk), self.remote)

        with self.captureOnCommitCallbacks(execute=True):
            event.held_at = None
            event.save()
        self.assertIn(google_event_id(event.pk), self.remote)

    def test_deleting_removes_it(self):
        self.link()
        event = self.create_event()
        gid = google_event_id(event.pk)

        with self.captureOnCommitCallbacks(execute=True):
            event.delete()
        self.assertNotIn(gid, self.remote)

    def test_deleting_the_zone_removes_its_events(self):
        self.link()
        gid = google_event_id(self.create_event().pk)

        with self.captureOnCommitCallbacks(execute=True):
            self.zone.delete()
        self.assertNotIn(gid, self.remote)

    def test_renaming_the_zone_retitles_its_events(self):
        self.link()
        event = self.create_event()

        with self.captureOnCommitCallbacks(execute=True):
            self.zone.name = "유치원"
            self.zone.save()
        self.assertEqual(self.remote[google_event_id(event.pk)]["summary"], "[유치원] 체육복")

    def test_nothing_is_sent_without_a_link(self):
        with self.captureOnCommitCallbacks(execute=True) as callbacks:
            Event.objects.create(zone=self.zone, event_date=self.day, title="체육복")
        self.assertEqual(callbacks, [])
        self.assertEqual(self.google.refresh_calls, 0)

    def test_access_token_is_reused_until_it_expires(self):
        self.link()
        self.create_event()
        self.create_event()
        self.assertEqual(self.google.refresh_calls, 1)

    def test_revoked_access_marks_the_link_broken_without_breaking_the_save(self):
        link = self.link()
        self.google.refresh_error = client.TokenRevoked(400, "invalid_grant")

        event = self.create_event()

        self.assertTrue(Event.objects.filter(pk=event.pk).exists())
        link.refresh_from_db()
        self.assertIsNotNone(link.broken_at)
        self.assertTrue(link.last_error)

    def test_google_failure_is_recorded_and_does_not_break_the_save(self):
        link = self.link()
        with patch.object(client, "update_event", side_effect=client.GoogleError(500, "backend")):
            event = self.create_event()

        self.assertTrue(Event.objects.filter(pk=event.pk).exists())
        link.refresh_from_db()
        self.assertIn("500", link.last_error)

    def test_calendar_deleted_on_google_is_recreated_with_everything(self):
        link = self.link()
        first = self.create_event()
        del self.google.calendars["cal0"]

        second = self.create_event()

        link.refresh_from_db()
        self.assertNotEqual(link.calendar_id, "cal0")
        self.assertEqual(
            set(self.google.calendars[link.calendar_id]),
            {google_event_id(first.pk), google_event_id(second.pk)},
        )


class ResyncTests(GoogleCalendarTestCase):
    def test_resync_adds_missing_and_removes_strays(self):
        # 연결 전에 있던 일정과, 보류해서 담기면 안 되는 일정
        kept = self.create_event()
        held = self.create_event(held_at=timezone.now())
        link = self.link()
        self.remote["alrimi999"] = {"id": "alrimi999"}

        with self.captureOnCommitCallbacks(execute=True):
            res = self.client.post(reverse("google-calendar-sync"), headers=self.auth())

        self.assertEqual(res.status_code, 202)
        self.assertEqual(set(self.remote), {google_event_id(kept.pk)})
        self.assertNotIn(google_event_id(held.pk), self.remote)
        link.refresh_from_db()
        self.assertIsNotNone(link.last_synced_at)


class ConnectFlowTests(GoogleCalendarTestCase):
    def test_status_when_not_connected(self):
        body = self.client.get(reverse("google-calendar"), headers=self.auth()).json()
        self.assertEqual(body["enabled"], True)
        self.assertEqual(body["connected"], False)

    @override_settings(GOOGLE_CLIENT_ID="")
    def test_status_is_disabled_without_server_config(self):
        body = self.client.get(reverse("google-calendar"), headers=self.auth()).json()
        self.assertEqual(body["enabled"], False)

    def test_connect_returns_the_consent_url_and_pins_the_browser(self):
        res = self.client.post(reverse("google-calendar-connect"), headers=self.auth())

        self.assertEqual(res.status_code, 200)
        query = parse_qs(urlparse(res.json()["url"]).query)
        self.assertIn(client.CALENDAR_SCOPE, query["scope"][0])
        self.assertEqual(query["access_type"], ["offline"])
        payload = signing.loads(query["state"][0], salt=STATE_SALT)
        self.assertEqual(payload["u"], self.user.pk)
        self.assertEqual(res.cookies[STATE_COOKIE].value, payload["n"])

    def callback(self, *, state=None, nonce="nonce", **params):
        if state is None:
            state = signing.dumps({"u": self.user.pk, "n": "nonce"}, salt=STATE_SALT)
        if nonce:
            self.client.cookies[STATE_COOKIE] = nonce
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.get(reverse("google-calendar-callback"), {"state": state, "code": "c", **params})

    def test_callback_connects_and_backfills_existing_events(self):
        event = Event.objects.create(zone=self.zone, event_date=self.day, title="체육복")

        res = self.callback()

        self.assertEqual(res.status_code, 302)
        self.assertEqual(res["Location"], "http://web.test/settings?google=connected")
        link = GoogleCalendarLink.objects.get(user=self.user)
        self.assertEqual(link.email, "hoon@example.com")
        self.assertIn(google_event_id(event.pk), self.google.calendars[link.calendar_id])

    def test_callback_from_another_browser_is_refused(self):
        """state 만 맞고 쿠키가 없다 — 남이 받아둔 링크를 누른 것이다."""
        res = self.callback(nonce=None)
        self.assertEqual(res["Location"], "http://web.test/settings?google=error")
        self.assertFalse(GoogleCalendarLink.objects.exists())

    def test_callback_with_a_forged_state_is_refused(self):
        res = self.callback(state="forged")
        self.assertEqual(res["Location"], "http://web.test/settings?google=error")

    def test_cancelled_consent(self):
        res = self.client.get(reverse("google-calendar-callback"), {"error": "access_denied"})
        self.assertEqual(res["Location"], "http://web.test/settings?google=denied")

    def test_consent_without_the_calendar_scope_is_not_half_connected(self):
        tokens = {**self.google.exchange_code("c", redirect_uri=""), "scope": "openid email"}
        with patch.object(client, "exchange_code", return_value=tokens):
            res = self.callback()

        self.assertEqual(res["Location"], "http://web.test/settings?google=scope")
        self.assertFalse(GoogleCalendarLink.objects.exists())
        self.assertEqual(self.google.revoked, ["refresh"])

    def test_disconnect_deletes_the_calendar_and_the_link(self):
        self.link()

        res = self.client.delete(reverse("google-calendar"), headers=self.auth())

        self.assertEqual(res.status_code, 204)
        self.assertNotIn("cal0", self.google.calendars)
        self.assertEqual(self.google.revoked, ["refresh"])
        self.assertFalse(GoogleCalendarLink.objects.exists())
