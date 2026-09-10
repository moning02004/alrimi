import datetime as dt
import json
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from zones.models import Zone

from .filters import UPCOMING_DAYS, upcoming_end
from .models import MAX_SPAN_DAYS, EventAlert, Event, Priority, due_at_for, parse_code
from .views import next_week
from .ntfy import NtfyError, compose, publish

User = get_user_model()


class CodeTests(TestCase):
    def test_parse(self):
        self.assertEqual(parse_code("D-1 20:00"), (1, 20))
        self.assertEqual(parse_code("D 07:00"), (0, 7))

    def test_after_the_event(self):
        """
        일정이 지난 뒤로도 잡는다 — 다녀와서 정리할 일이 딸려 오는 일정이 있다.
        offset 은 "며칠 전" 이라 뒤로 잡은 것은 음수로 나온다.
        """
        self.assertEqual(parse_code("D+3 20:00"), (-3, 20))
        self.assertEqual(parse_code("D+1 07:00"), (-1, 7))

    def test_bad_codes_are_rejected(self):
        from django.core.exceptions import ValidationError

        bad_codes = [
            "X-1 20:00",
            "D-1 20:30",
            "D-1",
            "D-1 25:00",
            "",
            "D1 20:00",  # 앞인지 뒤인지가 코드에 없다
            "D+61 20:00",  # 두 달을 넘겨 잡는다
            "D-61 20:00",
        ]
        for bad in bad_codes:
            with self.assertRaises(ValidationError, msg=bad):
                parse_code(bad)

    def test_due_at_is_local_time(self):
        due = due_at_for(dt.date(2026, 9, 11), "D-1 20:00")
        self.assertEqual(timezone.localtime(due).strftime("%Y-%m-%d %H:%M"), "2026-09-10 20:00")

    def test_due_at_after_the_event(self):
        due = due_at_for(dt.date(2026, 9, 11), "D+3 20:00")
        self.assertEqual(timezone.localtime(due).strftime("%Y-%m-%d %H:%M"), "2026-09-14 20:00")


class FilterBoundaryTests(TestCase):
    """
    창은 요일과 무관하게 오늘 + UPCOMING_DAYS다.
    웹의 주간 스트립이 같은 창을 그리므로 여기가 바뀌면 스트립도 같이 바뀌어야 한다.
    """

    def test_window_covers_upcoming_days_counting_the_start(self):
        # 9/4 부터 7일 = 9/4 ~ 9/10
        self.assertEqual(upcoming_end(dt.date(2026, 9, 4)), dt.date(2026, 9, 10))

    def test_windows_tile_without_gap_or_overlap(self):
        """주간 스트립이 창 폭만큼 통째로 넘기므로 이어 붙였을 때 딱 맞아야 한다."""
        start = dt.date(2026, 9, 4)
        nxt = start + dt.timedelta(days=UPCOMING_DAYS)
        self.assertEqual(upcoming_end(start) + dt.timedelta(days=1), nxt)

    def test_window_does_not_depend_on_the_weekday(self):
        for day in range(1, 8):
            today = dt.date(2026, 9, day)
            self.assertEqual((upcoming_end(today) - today).days, UPCOMING_DAYS - 1)


class ApiTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("hoon", password="pw-strong-1234")
        self.other = User.objects.create_user("nam", password="pw-strong-1234")
        self.zone = Zone.objects.create(owner=self.user, name="우리집")
        self.today = timezone.localdate()

        res = self.client.post(
            reverse("obtain-token"),
            {"username": "hoon", "password": "pw-strong-1234"},
            content_type="application/json",
        )
        self.auth = {"authorization": f"Bearer {res.json()['access_token']}"}

    def post(self, url, body):
        return self.client.post(url, body, content_type="application/json", headers=self.auth)

    def get(self, url):
        return self.client.get(url, headers=self.auth)


class EventCrudTests(ApiTestCase):
    def payload(self, **over):
        return {
            "zone": self.zone.id,
            "event_date": str(self.today + dt.timedelta(days=1)),
            "title": "가을 운동회",
            "content": "흰 티셔츠, 모자",
            "priority": 5,
            "alerts": ["D-1 20:00", "D 07:00"],
            **over,
        }

    def test_create_builds_alerts_from_codes(self):
        res = self.post(reverse("event-list"), self.payload())
        self.assertEqual(res.status_code, 201)

        body = res.json()
        self.assertEqual(body["zone_name"], "우리집")
        self.assertEqual(body["zone_id"], self.zone.id)
        self.assertEqual(body["zone_color"], self.zone.color)
        self.assertEqual([a["code"] for a in body["alerts"]], ["D-1 20:00", "D 07:00"])
        self.assertTrue(all(a["sent_at"] is None for a in body["alerts"]))

    def test_an_alert_after_the_event_is_scheduled_after_it(self):
        """"시작하고 3일 뒤" 처럼 일정이 지난 다음으로도 예약된다."""
        start = self.today + dt.timedelta(days=1)
        res = self.post(
            reverse("event-list"),
            self.payload(event_date=str(start), alerts=["D 07:00", "D+3 20:00"]),
        )
        self.assertEqual(res.status_code, 201)

        alert = EventAlert.objects.get(event_id=res.json()["id"], code="D+3 20:00")
        self.assertEqual(timezone.localtime(alert.due_at).date(), start + dt.timedelta(days=3))

    def test_bad_alert_code_is_400(self):
        res = self.post(reverse("event-list"), self.payload(alerts=["오늘"]))
        self.assertEqual(res.status_code, 400)

    def test_a_past_date_is_refused(self):
        """
        지난 날짜로 등록되면 알림 시각이 이미 지나 있어
        보내는 쪽이 저장 직후 그 일정의 예약을 전부 집어 들고 한꺼번에 쏘게 된다.
        """
        past = str(self.today - dt.timedelta(days=1))
        res = self.post(reverse("event-list"), self.payload(event_date=past))
        self.assertEqual(res.status_code, 400)
        self.assertIn("event_date", res.json())

    def test_today_is_allowed(self):
        res = self.post(reverse("event-list"), self.payload(event_date=str(self.today)))
        self.assertEqual(res.status_code, 201)

    def test_an_existing_past_event_stays_editable(self):
        event = Event.objects.create(
            zone=self.zone, event_date=self.today - dt.timedelta(days=5), title="지난 것"
        )
        event.sync_alerts(["D 07:00"])

        res = self.client.patch(
            reverse("event-detail", args=[event.id]),
            {"title": "이름만 고침"},
            content_type="application/json",
            headers=self.auth,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["title"], "이름만 고침")

    def test_moving_an_event_into_the_past_is_refused(self):
        event_id = self.post(
            reverse("event-list"), self.payload()
        ).json()["id"]

        res = self.client.patch(
            reverse("event-detail", args=[event_id]),
            {"event_date": str(self.today - dt.timedelta(days=1))},
            content_type="application/json",
            headers=self.auth,
        )
        self.assertEqual(res.status_code, 400)

    def test_empty_alerts_is_400(self):
        res = self.post(reverse("event-list"), self.payload(alerts=[]))
        self.assertEqual(res.status_code, 400)

    def test_update_keeps_sent_alerts_and_replaces_the_rest(self):
        event_id = self.post(
            reverse("event-list"), self.payload()
        ).json()["id"]

        sent = EventAlert.objects.get(event_id=event_id, code="D-1 20:00")
        sent.mark_sent()

        res = self.client.patch(
            reverse("event-detail", args=[event_id]),
            {"alerts": ["D-3 20:00"]},
            content_type="application/json",
            headers=self.auth,
        )
        self.assertEqual(res.status_code, 200)

        codes = {a["code"] for a in res.json()["alerts"]}
        self.assertIn("D-1 20:00", codes)  # 발송된 건 기록으로 남는다
        self.assertIn("D-3 20:00", codes)
        self.assertNotIn("D 07:00", codes)  # 아직 안 나간 건 교체된다

    def test_moving_the_date_reschedules_pending_alerts(self):
        event_id = self.post(
            reverse("event-list"), self.payload()
        ).json()["id"]
        moved = self.today + dt.timedelta(days=10)

        self.client.patch(
            reverse("event-detail", args=[event_id]),
            {"event_date": str(moved)},
            content_type="application/json",
            headers=self.auth,
        )
        alert = EventAlert.objects.get(event_id=event_id, code="D 07:00")
        self.assertEqual(timezone.localtime(alert.due_at).date(), moved)

    def test_other_users_event_is_404(self):
        event = Event.objects.create(
            zone=Zone.objects.create(owner=self.other, name="남의집"),
            event_date=self.today,
            title="비밀",
        )
        self.assertEqual(self.get(reverse("event-detail", args=[event.id])).status_code, 404)

    def test_delete_removes_alerts(self):
        event_id = self.post(
            reverse("event-list"), self.payload()
        ).json()["id"]

        res = self.client.delete(reverse("event-detail", args=[event_id]), headers=self.auth)
        self.assertEqual(res.status_code, 204)
        self.assertFalse(EventAlert.objects.filter(event_id=event_id).exists())


class EventListTests(ApiTestCase):
    def make(self, offset_days: int, title: str) -> Event:
        return Event.objects.create(
            zone=self.zone,
            event_date=self.today + dt.timedelta(days=offset_days),
            title=title,
        )

    def titles(self, filter_name: str) -> list[str]:
        url = f"{reverse('event-list')}?filter={filter_name}"
        return [n["title"] for n in self.get(url).json()]

    def setUp(self):
        super().setUp()
        self.boundary = (upcoming_end(self.today) - self.today).days
        self.make(-3, "지난 것")
        self.make(0, "오늘")
        self.make(self.boundary, "경계")
        self.make(self.boundary + 1, "이후")

    def test_upcoming_covers_today_through_upcoming_end(self):
        self.assertEqual(self.titles("upcoming"), ["오늘", "경계"])

    def test_later_is_everything_beyond(self):
        self.assertEqual(self.titles("later"), ["이후"])

    def test_past_is_newest_first(self):
        self.assertEqual(self.titles("past"), ["지난 것"])

    def test_unknown_filter_falls_back_to_upcoming(self):
        self.assertEqual(self.titles("garbage"), ["오늘", "경계"])

    def test_list_summarises_alerts_for_the_dots(self):
        """카드의 점은 '몇 개 중 몇 개 나갔나'만 말한다."""
        event = self.make(1, "점 확인")
        EventAlert.objects.create(event=event, code="D-1 20:00", due_at=timezone.now()).mark_sent()
        EventAlert.objects.create(event=event, code="D 07:00", due_at=timezone.now()).mark_failed()
        EventAlert.objects.create(event=event, code="D-2 20:00", due_at=timezone.now())

        url = f"{reverse('event-list')}?filter=upcoming"
        row = next(n for n in self.get(url).json() if n["title"] == "점 확인")
        self.assertEqual(row["alerts"], {"total": 3, "sent": 1})

    def test_a_failed_alert_is_not_counted_as_sent(self):
        """실패는 나간 것이 아니다. 점이 초록으로 차면 온 줄 알게 된다."""
        event = self.make(1, "실패 확인")
        EventAlert.objects.create(event=event, code="D 07:00", due_at=timezone.now()).mark_failed()

        url = f"{reverse('event-list')}?filter=upcoming"
        row = next(n for n in self.get(url).json() if n["title"] == "실패 확인")
        self.assertEqual(row["alerts"], {"total": 1, "sent": 0})


class CrossZoneListTests(ApiTestCase):
    """목록의 축은 날짜다 — 공간은 좁히는 필터일 뿐."""

    def setUp(self):
        super().setUp()
        self.other_zone = Zone.objects.create(owner=self.user, name="어린이집")
        self.mine = Event.objects.create(zone=self.zone, event_date=self.today, title="우리집 일")
        self.theirs = Event.objects.create(
            zone=self.other_zone, event_date=self.today, title="어린이집 일"
        )
        # 남의 계정 것은 절대 섞이면 안 된다
        Event.objects.create(
            zone=Zone.objects.create(owner=self.other, name="남의집"),
            event_date=self.today,
            title="남의 일",
        )

    def titles(self, query: str = "") -> list[str]:
        return [n["title"] for n in self.get(f"{reverse('event-list')}{query}").json()]

    def test_default_spans_every_zone_of_the_owner(self):
        self.assertEqual(sorted(self.titles("?filter=upcoming")), ["어린이집 일", "우리집 일"])

    def test_zone_query_narrows_the_list(self):
        self.assertEqual(self.titles(f"?filter=upcoming&zone={self.zone.id}"), ["우리집 일"])

    def test_zone_of_another_owner_yields_nothing(self):
        stranger = Zone.objects.filter(owner=self.other).first()
        self.assertEqual(self.titles(f"?filter=upcoming&zone={stranger.id}"), [])

    def test_non_numeric_zone_is_400(self):
        res = self.get(f"{reverse('event-list')}?filter=upcoming&zone=abc")
        self.assertEqual(res.status_code, 400)

    def test_same_day_groups_by_zone(self):
        rows = self.get(f"{reverse('event-list')}?filter=upcoming").json()
        self.assertEqual([r["zone_id"] for r in rows], sorted(r["zone_id"] for r in rows))

    def test_rows_carry_the_zone_colour_for_the_card_bar(self):
        row = next(r for r in self.get(f"{reverse('event-list')}?filter=upcoming").json())
        self.assertTrue(row["zone_color"].startswith("#"))

    def test_date_query_returns_just_that_day(self):
        Event.objects.create(
            zone=self.zone, event_date=self.today + dt.timedelta(days=1), title="내일 일"
        )
        self.assertEqual(sorted(self.titles(f"?date={self.today}")), ["어린이집 일", "우리집 일"])

    def test_date_wins_over_filter(self):
        past = self.today - dt.timedelta(days=3)
        Event.objects.create(zone=self.zone, event_date=past, title="지난 일")
        # filter=upcoming 이어도 date 가 이긴다
        self.assertEqual(self.titles(f"?date={past}&filter=upcoming"), ["지난 일"])

    def test_malformed_date_is_400(self):
        self.assertEqual(self.get(f"{reverse('event-list')}?date=8월19일").status_code, 400)


class CreateEventZoneTests(ApiTestCase):
    def body(self, zone_id):
        return {
            "zone": zone_id,
            "event_date": str(self.today),
            "title": "본문으로 공간 지정",
            "content": "",
            "priority": 4,
            "alerts": ["D 07:00"],
        }

    def test_zone_comes_from_the_body(self):
        res = self.post(reverse("event-list"), self.body(self.zone.id))
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["zone_id"], self.zone.id)

    def test_cannot_plant_an_event_in_someone_elses_zone(self):
        stranger = Zone.objects.create(owner=self.other, name="남의집")
        res = self.post(reverse("event-list"), self.body(stranger.id))
        self.assertEqual(res.status_code, 400)

    def test_zone_is_required(self):
        payload = self.body(self.zone.id)
        del payload["zone"]
        self.assertEqual(self.post(reverse("event-list"), payload).status_code, 400)

    def test_an_event_can_be_moved_to_another_zone(self):
        event_id = self.post(reverse("event-list"), self.body(self.zone.id)).json()["id"]
        target = Zone.objects.create(owner=self.user, name="회사")

        res = self.client.patch(
            reverse("event-detail", args=[event_id]),
            {"zone": target.id},
            content_type="application/json",
            headers=self.auth,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["zone_id"], target.id)


class CalendarTests(ApiTestCase):
    """
    /calendar 는 날짜맵이 아니라 **일정 목록**이다. 여러 날짜리를 날마다 잘라
    보내면 웹이 그것을 다시 하나로 붙일 수 없어 띠를 못 그린다.
    """

    def setUp(self):
        super().setUp()
        self.other_zone = Zone.objects.create(owner=self.user, name="어린이집")
        Event.objects.create(zone=self.zone, event_date=self.today, title="a")
        Event.objects.create(zone=self.zone, event_date=self.today, title="b")
        Event.objects.create(zone=self.other_zone, event_date=self.today, title="c")

    def calendar(self, query: str) -> list:
        return self.get(f"{reverse('calendar')}{query}").json()

    def span(self, days: int = 7) -> str:
        return f"?from={self.today}&to={self.today + dt.timedelta(days=days)}"

    def test_every_event_comes_back_on_its_own(self):
        """같은 공간에 둘이 있어도 접지 않는다 — 띠는 일정마다 하나씩 그려진다."""
        self.assertEqual({row["title"] for row in self.calendar(self.span())}, {"a", "b", "c"})

    def test_a_row_carries_both_ends_so_the_web_can_draw_a_band(self):
        trip = Event.objects.create(
            zone=self.zone,
            event_date=self.today + dt.timedelta(days=1),
            end_date=self.today + dt.timedelta(days=3),
            title="제주 여행",
        )
        row = next(row for row in self.calendar(self.span()) if row["id"] == trip.id)
        self.assertEqual(row["event_date"], str(trip.event_date))
        self.assertEqual(row["end_date"], str(trip.end_date))

    def test_each_row_says_which_zone_not_just_a_colour(self):
        """색약이면 색만으로는 어느 공간인지 못 읽는다. 웹이 머리글자를 그린다."""
        row = self.calendar(self.span())[0]
        self.assertEqual(row["zone"], self.zone.id)
        self.assertEqual(row["color"], self.zone.color)

    def test_a_row_carries_the_title_for_the_bands_label(self):
        """띠에 붙는 이름이 '일정 1건' 이면 스크린리더로는 못 읽는다."""
        self.assertIn("a", {row["title"] for row in self.calendar(self.span())})

    def test_a_row_says_whether_it_was_completed(self):
        """
        여기 담기는 완료 일정은 늘 지난 것이다. 이 값이 없으면 웹이 "그냥 지나간 것"
        과 "치운 것" 을 같은 흐림으로 그린다.
        """
        day = self.today - dt.timedelta(days=3)
        done = Event.objects.create(zone=self.zone, event_date=day, title="치운 것")
        done.set_completed(True)
        Event.objects.create(zone=self.zone, event_date=day, title="그냥 지난 것")

        rows = {row["title"]: row["completed"] for row in self.calendar(f"?from={day}&to={day}")}
        self.assertEqual(rows, {"치운 것": True, "그냥 지난 것": False})

    def test_an_empty_window_is_an_empty_list(self):
        far = self.today + dt.timedelta(days=30)
        self.assertEqual(self.calendar(f"?from={far}&to={far}"), [])

    def test_zone_query_narrows_the_rows(self):
        rows = self.calendar(f"{self.span()}&zone={self.zone.id}")
        self.assertEqual({row["zone"] for row in rows}, {self.zone.id})

    def test_longer_events_come_first_so_the_web_stacks_them_from_the_top(self):
        """짧은 것이 위에 앉으면 긴 띠가 그 아래에서 여러 줄로 꺾여 보인다."""
        Event.objects.create(
            zone=self.zone,
            event_date=self.today,
            end_date=self.today + dt.timedelta(days=4),
            title="긴 것",
        )
        self.assertEqual(self.calendar(self.span())[0]["title"], "긴 것")

    def test_range_is_inclusive_on_both_ends(self):
        edge = self.today + dt.timedelta(days=3)
        Event.objects.create(zone=self.zone, event_date=edge, title="끝날")
        rows = self.calendar(f"?from={edge}&to={edge}")
        self.assertEqual([row["title"] for row in rows], ["끝날"])

    def test_other_owners_events_never_appear(self):
        Event.objects.create(
            zone=Zone.objects.create(owner=self.other, name="남의집"),
            event_date=self.today,
            title="남의 일",
        )
        self.assertNotIn("남의 일", {row["title"] for row in self.calendar(self.span())})

    def test_missing_range_is_400(self):
        self.assertEqual(self.get(reverse("calendar")).status_code, 400)

    def test_reversed_range_is_400(self):
        res = self.get(f"{reverse('calendar')}?from={self.today}&to={self.today - dt.timedelta(days=1)}")
        self.assertEqual(res.status_code, 400)

    def test_absurd_range_is_refused(self):
        res = self.get(f"{reverse('calendar')}?from={self.today}&to={self.today + dt.timedelta(days=500)}")
        self.assertEqual(res.status_code, 400)

    def test_requires_auth(self):
        self.assertEqual(self.client.get(reverse("calendar")).status_code, 401)


class RangeQueryTests(ApiTestCase):
    """주간 스트립이 앞뒤로 넘길 때 쓰는 임의 기간 조회."""

    def setUp(self):
        super().setUp()
        self.days = {
            offset: Event.objects.create(
                zone=self.zone,
                event_date=self.today + dt.timedelta(days=offset),
                title=f"D{offset:+d}",
            )
            for offset in (-1, 0, 6, 7, 13)
        }

    def titles(self, query: str) -> list[str]:
        return [n["title"] for n in self.get(f"{reverse('event-list')}{query}").json()]

    def span(self, start_offset: int) -> str:
        start = self.today + dt.timedelta(days=start_offset)
        end = start + dt.timedelta(days=UPCOMING_DAYS - 1)
        return f"?from={start}&to={end}"

    def test_first_window_matches_filter_upcoming(self):
        self.assertEqual(self.titles(self.span(0)), self.titles("?filter=upcoming"))

    def test_next_window_picks_up_where_the_first_ended(self):
        first = self.titles(self.span(0))
        second = self.titles(self.span(UPCOMING_DAYS))

        self.assertEqual(first, ["D+0", "D+6"])
        self.assertEqual(second, ["D+7", "D+13"])
        # 겹치지도 빠지지도 않는다
        self.assertEqual(set(first) & set(second), set())

    def test_previous_window_reaches_past_events(self):
        self.assertIn("D-1", self.titles(self.span(-UPCOMING_DAYS)))

    def test_range_is_inclusive_on_both_ends(self):
        edge = self.today + dt.timedelta(days=6)
        self.assertEqual(self.titles(f"?from={edge}&to={edge}"), ["D+6"])

    def test_zone_query_still_narrows_it(self):
        other = Zone.objects.create(owner=self.user, name="어린이집")
        Event.objects.create(zone=other, event_date=self.today, title="남의 공간")
        self.assertNotIn("남의 공간", self.titles(f"{self.span(0)}&zone={self.zone.id}"))

    def test_range_wins_over_filter(self):
        self.assertEqual(self.titles(f"{self.span(UPCOMING_DAYS)}&filter=upcoming"), ["D+7", "D+13"])

    def test_date_wins_over_range(self):
        day = self.today + dt.timedelta(days=6)
        self.assertEqual(self.titles(f"?date={day}&from={self.today}&to={self.today}"), ["D+6"])

    def test_from_without_to_means_everything_onwards(self):
        """웹이 "이 날부터 앞으로 전부"를 한 번에 받아 화면에서 기간/이후로 나눈다."""
        rows = self.titles(f"?from={self.today}")
        self.assertEqual(rows, ["D+0", "D+6", "D+7", "D+13"])

    def test_to_without_from_is_400(self):
        self.assertEqual(self.get(f"{reverse('event-list')}?to={self.today}").status_code, 400)

    def test_calendar_still_needs_both_ends(self):
        res = self.get(f"{reverse('calendar')}?from={self.today}")
        self.assertEqual(res.status_code, 400)

    def test_reversed_range_is_400(self):
        back = self.today - dt.timedelta(days=1)
        self.assertEqual(
            self.get(f"{reverse('event-list')}?from={self.today}&to={back}").status_code, 400
        )

    def test_absurd_range_is_refused(self):
        far = self.today + dt.timedelta(days=500)
        self.assertEqual(
            self.get(f"{reverse('event-list')}?from={self.today}&to={far}").status_code, 400
        )


class AlertStatusTests(ApiTestCase):
    """예약 → 발송됨 / 발송 실패."""

    def setUp(self):
        super().setUp()
        self.event = Event.objects.create(zone=self.zone, event_date=self.today, title="준비물")
        self.event.sync_alerts(["D 07:00"])
        self.alert = self.event.alerts.get()

    def detail(self) -> dict:
        rows = self.get(reverse("event-detail", args=[self.event.id])).json()["alerts"]
        return rows[0]

    def test_a_new_alert_is_pending(self):
        self.assertEqual(self.alert.status, EventAlert.Status.PENDING)
        self.assertIsNone(self.alert.sent_at)
        self.assertEqual(self.detail()["status"], "")

    def test_marking_sent_records_both_the_state_and_the_time(self):
        self.alert.mark_sent()

        self.alert.refresh_from_db()
        self.assertEqual(self.alert.status, EventAlert.Status.SENT)
        self.assertIsNotNone(self.alert.sent_at)

        row = self.detail()
        self.assertEqual(row["status"], "sent")
        self.assertIsNotNone(row["sent_at"])

    def test_marking_failed_leaves_sent_at_empty(self):
        """`sent_at` 이 차면 목록의 발송 점이 나간 것으로 센다."""
        self.alert.mark_failed()

        self.alert.refresh_from_db()
        self.assertEqual(self.alert.status, EventAlert.Status.FAILED)
        self.assertIsNone(self.alert.sent_at)

    def test_the_detail_screen_can_tell_failed_from_pending(self):
        """둘 다 sent_at 이 비어 있다. status 가 없으면 실패가 '대기 중'으로 보인다."""
        self.alert.mark_failed()
        self.assertEqual(self.detail()["status"], "fail")


class CompletionTests(ApiTestCase):
    """완료한 일정은 목록·달력·발송에서 모두 빠진다."""

    def setUp(self):
        super().setUp()
        self.event = Event.objects.create(
            zone=self.zone, event_date=self.today, title="체육복 챙기기", content="흰 티셔츠"
        )
        self.event.sync_alerts(["D 07:00"])
        self.alert = self.event.alerts.get()
        # 오늘 07:00 은 이미 지난 시각이라 발송 대상이다
        EventAlert.objects.filter(pk=self.alert.pk).update(due_at=timezone.now() - dt.timedelta(hours=1))

    def complete(self, value: bool):
        return self.client.patch(
            reverse("event-detail", args=[self.event.id]),
            {"completed": value},
            content_type="application/json",
            headers=self.auth,
        )

    def agenda(self) -> list[str]:
        url = f"{reverse('event-list')}?from={self.today}"
        return [n["title"] for n in self.get(url).json()]

    def test_patch_completed_sets_and_clears_the_timestamp(self):
        res = self.complete(True)
        self.assertEqual(res.status_code, 200)
        self.assertIsNotNone(res.json()["completed_at"])

        self.assertIsNone(self.complete(False).json()["completed_at"])

    def test_completing_only_needs_the_flag(self):
        """알림 코드를 통째로 다시 보내지 않아도 된다."""
        self.complete(True)
        self.assertEqual(self.event.alerts.count(), 1)

    def test_a_completed_past_event_stays_in_the_list(self):
        """지난 일정은 기록이다. 끝낸 것을 지우면 그 날이 틀리게 남는다."""
        past = Event.objects.create(
            zone=self.zone, event_date=self.today - dt.timedelta(days=3), title="독감 예방접종"
        )
        past.set_completed(True)

        start = self.today - dt.timedelta(days=7)
        url = f"{reverse('event-list')}?from={start}&to={self.today}"
        rows = self.get(url).json()

        row = next(n for n in rows if n["title"] == "독감 예방접종")
        self.assertIsNotNone(row["completed_at"])

    def test_a_completed_past_event_keeps_its_calendar_band(self):
        day = self.today - dt.timedelta(days=3)
        past = Event.objects.create(zone=self.zone, event_date=day, title="독감 예방접종")
        past.set_completed(True)

        rows = self.get(f"{reverse('calendar')}?from={day}&to={day}").json()
        self.assertEqual([row["title"] for row in rows], ["독감 예방접종"])

    def test_it_stays_in_the_window_but_is_marked_done(self):
        """
        기간 목록에서는 사라지지 않는다 — 웹이 흐리게 그리고 뒤로 민다.
        완료했다고 그 날에서 없어지면 "내가 뭘 했더라"를 못 본다.
        """
        self.assertIn("체육복 챙기기", self.agenda())

        self.complete(True)
        rows = self.get(f"{reverse('event-list')}?from={self.today}").json()
        row = next(r for r in rows if r["title"] == "체육복 챙기기")
        self.assertIsNotNone(row["completed_at"])

    def test_it_drops_out_of_the_upcoming_filter(self):
        """`filter=upcoming` 은 '아직 남은 것'을 묻는 질문이라 빠진다."""
        url = f"{reverse('event-list')}?filter=upcoming"
        titles = lambda: [n["title"] for n in self.get(url).json()]  # noqa: E731

        self.assertIn("체육복 챙기기", titles())
        self.complete(True)
        self.assertNotIn("체육복 챙기기", titles())

    def test_it_comes_back_when_uncompleted(self):
        self.complete(True)
        self.complete(False)
        self.assertIn("체육복 챙기기", self.agenda())

    def test_the_day_view_still_shows_it(self):
        """되돌릴 길이 있어야 한다 — 하루 보기가 그 자리다."""
        self.complete(True)
        url = f"{reverse('event-list')}?date={self.today}"
        rows = self.get(url).json()
        self.assertEqual([n["title"] for n in rows], ["체육복 챙기기"])
        self.assertIsNotNone(rows[0]["completed_at"])

    def test_the_calendar_band_disappears(self):
        span = f"?from={self.today}&to={self.today}"
        self.assertNotEqual(self.get(f"{reverse('calendar')}{span}").json(), [])

        self.complete(True)
        self.assertEqual(self.get(f"{reverse('calendar')}{span}").json(), [])

    def test_completing_keeps_the_alerts_so_undo_restores_them(self):
        """
        완료는 지우는 것이 아니라 덮는 것이다. 예약이 남아 있어야 취소했을 때
        되살아난다. 발송하는 쪽은 `completed_at` 이 빈 것만 골라 보내면 된다.
        """
        self.complete(True)
        self.assertEqual(self.event.alerts.count(), 1)

        alert = self.event.alerts.get()
        self.assertIsNone(alert.sent_at, "완료했다고 보낸 것으로 처리하면 안 된다")

        self.complete(False)
        self.event.refresh_from_db()
        self.assertIsNone(self.event.completed_at)
        self.assertEqual(self.event.alerts.count(), 1)

    def test_it_stops_counting_towards_upcoming_count(self):
        before = self.get(reverse("zone-list")).json()[0]["upcoming_count"]
        self.complete(True)
        after = self.get(reverse("zone-list")).json()[0]["upcoming_count"]
        self.assertEqual(after, before - 1)


class NtfyPublishTests(TestCase):
    """보내는 쪽 자체. 요청이 어떤 모양으로 나가는지를 여기서 못 박는다."""

    @override_settings(
        NTFY_BASE_URL="https://ntfy.example.com", NTFY_USER="alrimi", NTFY_PASSWORD="pw"
    )
    def test_publish_posts_json_with_basic_auth(self):
        with patch("notices.ntfy.urlopen") as urlopen:
            publish("alrimi-topic", title="[우리집] 준비물", message="9월 8일 (화)", priority=5)

        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "https://ntfy.example.com")
        self.assertEqual(
            json.loads(request.data),
            {
                "topic": "alrimi-topic",
                "title": "[우리집] 준비물",
                "message": "9월 8일 (화)",
                "priority": 5,
            },
        )
        # 한글 제목은 헤더(X-Title)로는 못 보낸다. JSON 본문이라 UTF-8 로 그대로 실린다.
        self.assertIn("준비물", request.data.decode())
        self.assertTrue(request.get_header("Authorization").startswith("Basic "))

    @override_settings(NTFY_USER="", NTFY_PASSWORD="")
    def test_open_server_needs_no_credentials(self):
        with patch("notices.ntfy.urlopen") as urlopen:
            publish("alrimi-topic", title="t", message="m", priority=3)
        self.assertIsNone(urlopen.call_args.args[0].get_header("Authorization"))

    def test_a_user_without_a_topic_is_an_error_not_a_silent_no_op(self):
        with self.assertRaises(NtfyError):
            publish("", title="t", message="m", priority=3)


class SendAlertTests(ApiTestCase):
    """POST /events/{id}/alerts/{id}/send — 상세 화면의 '보내기'."""

    def setUp(self):
        super().setUp()
        self.event = Event.objects.create(
            zone=self.zone,
            event_date=self.today + dt.timedelta(days=1),
            title="준비물",
            content="흰 티셔츠",
        )
        self.event.sync_alerts(["D-1 20:00"])
        self.alert = self.event.alerts.get()

    def url(self, event_id=None, event_alert_id=None):
        return reverse(
            "alert-send",
            args=[event_id or self.event.id, event_alert_id or self.alert.id],
        )

    def test_sending_goes_to_the_owners_topic_and_records_it(self):
        with patch("notices.ntfy.publish") as publish_mock:
            res = self.post(self.url(), {})

        self.assertEqual(res.status_code, 200)
        publish_mock.assert_called_once()
        topic = publish_mock.call_args.args[0]
        self.assertEqual(topic, self.user.ntfy_topic)
        # 우선순위는 일정의 것을 그대로 쓴다 — 값이 ntfy 등급(1~5)과 같은 축이다
        self.assertEqual(publish_mock.call_args.kwargs["priority"], self.event.priority)

        self.alert.refresh_from_db()
        self.assertEqual(self.alert.status, EventAlert.Status.SENT)
        self.assertIsNotNone(self.alert.sent_at)
        self.assertEqual(res.json()["status"], "sent")

    def test_a_failure_is_recorded_and_the_reason_comes_back(self):
        with patch("notices.ntfy.publish", side_effect=NtfyError("ntfy 서버에 닿지 못했어요.")):
            res = self.post(self.url(), {})

        self.assertEqual(res.status_code, 502)
        self.assertIn("닿지 못했", res.json()["detail"])

        self.alert.refresh_from_db()
        self.assertEqual(self.alert.status, EventAlert.Status.FAILED)
        # 실패에 sent_at 이 차면 목록의 발송 점이 나간 것으로 센다
        self.assertIsNone(self.alert.sent_at)

    def test_other_peoples_alerts_are_not_reachable(self):
        theirs = Event.objects.create(
            zone=Zone.objects.create(owner=self.other, name="남의집"),
            event_date=self.today + dt.timedelta(days=1),
            title="남의 일정",
        )
        theirs.sync_alerts(["D-1 20:00"])

        with patch("notices.ntfy.publish") as publish_mock:
            res = self.post(self.url(theirs.id, theirs.alerts.get().id), {})

        self.assertEqual(res.status_code, 404)
        publish_mock.assert_not_called()

    def test_the_alert_has_to_belong_to_that_event(self):
        """경로의 두 id 가 어긋나면 남의 알림을 밀 수 있다."""
        elsewhere = Event.objects.create(
            zone=self.zone, event_date=self.today + dt.timedelta(days=2), title="다른 일정"
        )
        elsewhere.sync_alerts(["D-1 20:00"])

        res = self.post(self.url(elsewhere.id, self.alert.id), {})
        self.assertEqual(res.status_code, 404)

    def test_the_message_says_which_space_and_when(self):
        """잠금화면에서 이것만 보고 판단한다."""
        title, message = compose(self.event)

        self.assertEqual(title, "[우리집] 준비물")
        self.assertIn("흰 티셔츠", message)
        self.assertIn(str(self.event.event_date.day), message)


class CronEndpointTests(TestCase):
    """
    크론이 부르는 두 엔드포인트. 사람 계정이 아니라 환경변수 열쇠로 통과한다.

    이쪽은 화면이 없어서 깨져도 아무도 모른다 — 알림이 안 오는 것으로만 드러나고,
    그때는 이미 그 주가 지나 있다. 그래서 경계를 테스트로 박아둔다.
    """

    def setUp(self):
        self.user = User.objects.create_user(username="cron-owner", password="pw-strong-1234")
        self.zone = Zone.objects.create(owner=self.user, name="어린이집")

    def make(self, event_date, title="가을 운동회"):
        return Event.objects.create(
            zone=self.zone, event_date=event_date, title=title, content="", priority=4
        )

    # ── 열쇠 ────────────────────────────────────────────────────

    @override_settings(N8N_API_KEY="right-key")
    def test_헤더가_없으면_막힌다(self):
        for url in ("/events/weekly", "/events/alerts"):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 403)

    @override_settings(N8N_API_KEY="right-key")
    def test_틀린_열쇠는_막힌다(self):
        res = self.client.get("/events/weekly", headers={"x-api-key": "wrong-key"})
        self.assertEqual(res.status_code, 403)

    @override_settings(N8N_API_KEY="right-key")
    def test_맞는_열쇠는_통과한다(self):
        res = self.client.get("/events/weekly", headers={"x-api-key": "right-key"})
        self.assertEqual(res.status_code, 200)

    @override_settings(N8N_API_KEY="")
    def test_서버에_열쇠가_없으면_열어두지_않는다(self):
        """설정이 비었을 때 통과시키면 아무나 들어온다. 막는 쪽이 맞다."""
        res = self.client.get("/events/weekly", headers={"x-api-key": "anything"})
        self.assertEqual(res.status_code, 403)

    @override_settings(N8N_API_KEY="right-key")
    def test_로그인_토큰만으로는_못_본다(self):
        """사람 계정으로 로그인해도 이 엔드포인트는 열쇠가 따로 필요하다."""
        res = self.client.post(
            reverse("obtain-token"),
            {"username": "cron-owner", "password": "pw-strong-1234"},
            content_type="application/json",
        )
        auth = {"authorization": f"Bearer {res.json()['access_token']}"}
        self.assertEqual(self.client.get("/events/weekly", headers=auth).status_code, 403)

    # ── 주간 정리는 "다음 주 월~일" 이다 ─────────────────────────

    @override_settings(N8N_API_KEY="k")
    def test_다음주_월요일부터_일요일까지만_담는다(self):
        """
        일요일에 돈다고 보고, 그 주가 아니라 **다음** 주가 담겨야 한다.
        경계 바로 앞뒤(다음주 월요일 하루 전 / 일요일 다음 날)는 빠진다.
        """
        sunday = dt.date(2026, 9, 13)  # 일요일
        next_monday = dt.date(2026, 9, 14)
        next_sunday = dt.date(2026, 9, 20)

        self.make(next_monday - dt.timedelta(days=1), "이번주_토요일")
        self.make(next_monday, "다음주_월요일")
        self.make(next_sunday, "다음주_일요일")
        self.make(next_sunday + dt.timedelta(days=1), "다다음주_월요일")

        with patch("notices.views.timezone.localdate", return_value=sunday):
            res = self.client.get("/events/weekly", headers={"x-api-key": "k"})

        self.assertEqual(res.status_code, 200)
        message = "\n".join(item["message"] for item in res.json())
        self.assertIn("다음주_월요일", message)
        self.assertIn("다음주_일요일", message)
        self.assertNotIn("이번주_토요일", message)
        self.assertNotIn("다다음주_월요일", message)

        title = res.json()[0]["title"]
        self.assertIn("2026-09-14", title)
        self.assertIn("2026-09-20", title)

    @override_settings(N8N_API_KEY="k")
    def test_어느_요일에_돌아도_같은_주가_나온다(self):
        """크론이 하루 밀려 토요일에 돌아도 담기는 기간이 달라지면 안 된다."""
        self.make(dt.date(2026, 9, 14), "다음주_월요일")

        titles = set()
        for day in (dt.date(2026, 9, 12), dt.date(2026, 9, 13)):  # 토, 일
            with patch("notices.views.timezone.localdate", return_value=day):
                res = self.client.get("/events/weekly", headers={"x-api-key": "k"})
            titles.add(res.json()[0]["title"])

        self.assertEqual(len(titles), 1, f"요일마다 기간이 달라졌다: {titles}")

    @override_settings(N8N_API_KEY="k")
    def test_완료한_일정은_빠진다(self):
        event = self.make(dt.date(2026, 9, 14), "끝난_것")
        event.completed_at = timezone.now()
        event.save()

        with patch("notices.views.timezone.localdate", return_value=dt.date(2026, 9, 13)):
            res = self.client.get("/events/weekly", headers={"x-api-key": "k"})

        self.assertEqual(res.json(), [])

    @override_settings(N8N_API_KEY="k")
    def test_토픽별로_묶인다(self):
        other = User.objects.create_user(username="cron-other", password="pw-strong-1234")
        other_zone = Zone.objects.create(owner=other, name="회사")
        self.make(dt.date(2026, 9, 14), "내_일정")
        Event.objects.create(
            zone=other_zone, event_date=dt.date(2026, 9, 14), title="남_일정", content="", priority=3
        )

        with patch("notices.views.timezone.localdate", return_value=dt.date(2026, 9, 13)):
            res = self.client.get("/events/weekly", headers={"x-api-key": "k"})

        topics = {item["topic"] for item in res.json()}
        self.assertEqual(len(topics), 2)
        self.assertIn(self.user.ntfy_topic, topics)
        self.assertIn(other.ntfy_topic, topics)

    # ── 통은 공간마다 하나다 ────────────────────────────────────

    @override_settings(N8N_API_KEY="k")
    def test_공간마다_한_통씩_나간다(self):
        """
        한 통에 몰아 담으면 "어린이집 것" 하나를 찾으려고 회사 일정까지 훑어야
        한다. 폰에서는 통 단위로 접히고 지워지므로 공간이 통이어야 한다.
        """
        second = Zone.objects.create(owner=self.user, name="회사")
        self.make(dt.date(2026, 9, 14), "어린이집_일")
        Event.objects.create(
            zone=second, event_date=dt.date(2026, 9, 15), title="회사_일", content="", priority=4
        )

        with patch("notices.views.timezone.localdate", return_value=dt.date(2026, 9, 13)):
            rows = self.client.get("/events/weekly", headers={"x-api-key": "k"}).json()

        # 토픽은 사람마다 하나라 둘 다 같은 폰으로 간다
        self.assertEqual({row["topic"] for row in rows}, {self.user.ntfy_topic})
        self.assertEqual(len(rows), 2)

        by_zone = {row["title"].split("]")[0].lstrip("["): row["message"] for row in rows}
        self.assertEqual(set(by_zone), {"어린이집", "회사"})
        self.assertIn("어린이집_일", by_zone["어린이집"])
        self.assertNotIn("회사_일", by_zone["어린이집"])

    @override_settings(N8N_API_KEY="k")
    def test_제목이_공간을_말하므로_줄마다_다시_적지_않는다(self):
        self.make(dt.date(2026, 9, 14), "가을 운동회")

        with patch("notices.views.timezone.localdate", return_value=dt.date(2026, 9, 13)):
            row = self.client.get("/events/weekly", headers={"x-api-key": "k"}).json()[0]

        self.assertTrue(row["title"].startswith("[어린이집]"), row["title"])
        self.assertNotIn("[어린이집]", row["message"])

    @override_settings(N8N_API_KEY="k")
    def test_일정이_없는_공간은_통을_만들지_않는다(self):
        Zone.objects.create(owner=self.user, name="빈_공간")
        self.make(dt.date(2026, 9, 14), "가을 운동회")

        with patch("notices.views.timezone.localdate", return_value=dt.date(2026, 9, 13)):
            rows = self.client.get("/events/weekly", headers={"x-api-key": "k"}).json()

        self.assertEqual(len(rows), 1)
        self.assertNotIn("빈_공간", rows[0]["title"])

    # ── 매시 발송도 공간마다 한 통 ──────────────────────────────

    def due(self, zone, title, *, content="", priority=Priority.NORMAL, event_hour=None,
            on=None, code="D 08:00"):
        """방금 시각이 된 예약 하나. `on` 을 주면 그 날 일정에 걸린다."""
        event = Event.objects.create(
            zone=zone,
            event_date=on or timezone.localdate(),
            title=title,
            content=content,
            priority=priority,
            event_hour=event_hour,
        )
        return EventAlert.objects.create(
            event=event, code=code, due_at=timezone.now() - dt.timedelta(minutes=5)
        )

    def ready(self) -> dict:
        return self.client.get("/events/alerts", headers={"x-api-key": "k"}).json()

    @override_settings(N8N_API_KEY="k")
    def test_같은_공간의_예약은_한_통으로_묶인다(self):
        """
        예약 하나에 한 통씩 보내면 같은 시각에 잡아둔 다섯 개가 알림 다섯 개로
        쏟아진다.
        """
        self.due(self.zone, "체육복", content="흰 티셔츠")
        self.due(self.zone, "준비물")

        body = self.ready()
        self.assertEqual(len(body["data"]), 1)

        row = body["data"][0]
        self.assertEqual(row["title"], "[어린이집] 일정 2건")
        self.assertEqual(
            row["message"].splitlines(),
            [
                str(timezone.localdate()),
                " - 체육복",
                "   └ 흰 티셔츠",
                " - 준비물",
            ],
        )

        # 묶여도 발송으로 찍을 것은 낱개다 — 크론이 이 목록으로 update_alert 를 부른다
        self.assertEqual(len(body["ids"]), 2)

    @override_settings(N8N_API_KEY="k")
    def test_한_통_안은_날짜로_나뉜다(self):
        """
        "3일 전" 과 "1일 전" 은 서로 다른 날을 가리키면서도 같은 시각에 시각이 될
        수 있다. 날짜를 안 적으면 받는 쪽은 줄들이 언제 것인지 모른 채 읽는다.
        """
        today = timezone.localdate()
        soon, later = today + dt.timedelta(days=1), today + dt.timedelta(days=3)
        self.due(self.zone, "모레 것", on=later, code="D-3 20:00")
        self.due(self.zone, "내일 것", on=soon, code="D-1 20:00")

        message = self.ready()["data"][0]["message"]
        self.assertEqual(
            message.splitlines(),
            [str(soon), " - 내일 것", "", str(later), " - 모레 것"],
        )

    @override_settings(N8N_API_KEY="k")
    def test_한_일정에_걸린_예약_둘이_같은_창에_와도_한_번만_적는다(self):
        """크론이 한 번 걸러 따라잡으면 "1일 전" 과 "당일" 이 함께 온다."""
        alert = self.due(self.zone, "체육복")
        EventAlert.objects.create(
            event=alert.event, code="D-1 20:00", due_at=timezone.now() - dt.timedelta(minutes=10)
        )

        body = self.ready()
        self.assertEqual(body["data"][0]["message"].count("체육복"), 1)
        # 적는 것은 하나지만 발송으로 찍을 것은 둘이다
        self.assertEqual(len(body["ids"]), 2)

    @override_settings(N8N_API_KEY="k")
    def test_공간이_다르면_통도_나뉜다(self):
        other = Zone.objects.create(owner=self.user, name="회사")
        self.due(self.zone, "체육복")
        self.due(other, "회의 자료")

        rows = self.ready()["data"]
        self.assertEqual(len(rows), 2)
        self.assertEqual(
            {row["title"] for row in rows}, {"[어린이집] 체육복", "[회사] 회의 자료"}
        )

    @override_settings(N8N_API_KEY="k")
    def test_한_건이면_제목이_그_일정을_그대로_말한다(self):
        """"1건" 으로 접으면 잠금화면에서 무엇을 챙기라는 건지 열어봐야 안다."""
        self.due(self.zone, "체육복", content="흰 티셔츠", event_hour=7)

        row = self.ready()["data"][0]
        self.assertEqual(row["title"], "[어린이집] 07시 체육복")
        # 본문은 한 건일 때도 같은 모양이다 — 제목에 없는 날짜가 여기 있다
        self.assertEqual(
            row["message"].splitlines(),
            [str(timezone.localdate()), " - 07시 체육복", "   └ 흰 티셔츠"],
        )

    @override_settings(N8N_API_KEY="k")
    def test_묶인_통은_가장_급한_중요도를_따른다(self):
        """낮은 쪽을 따르면 긴급으로 잡아둔 일정이 방해금지에 막혀 조용히 도착한다."""
        self.due(self.zone, "조용한 것", priority=Priority.LOW)
        self.due(self.zone, "급한 것", priority=Priority.URGENT)

        self.assertEqual(self.ready()["data"][0]["priority"], Priority.URGENT)


class EventHourTests(ApiTestCase):
    """
    시각은 **선택**이다. 없이도 등록되고, 없으면 시각을 안 정한 것으로 본다.

    분은 받지 않는다 — 어린이집 준비물처럼 "오전 중" 이면 되는 일이 대부분이라,
    분까지 물으면 없는 정확도를 지어내게 된다.
    """

    def payload(self, **over):
        body = {
            "zone": self.zone.id,
            "event_date": str(self.today + dt.timedelta(days=3)),
            "title": "가을 운동회",
            "content": "",
            "priority": 4,
            "alerts": ["D-1 20:00"],
        }
        body.update(over)
        return body

    def test_시각_없이_등록된다(self):
        res = self.post(reverse("event-list"), self.payload())
        self.assertEqual(res.status_code, 201)
        self.assertIsNone(Event.objects.get(pk=res.json()["id"]).event_hour)

    def test_시각을_담아_등록된다(self):
        res = self.post(reverse("event-list"), self.payload(event_hour=9))
        self.assertEqual(res.status_code, 201)
        self.assertEqual(Event.objects.get(pk=res.json()["id"]).event_hour, 9)

    def test_자정과_23시는_받는다(self):
        for hour in (0, 23):
            with self.subTest(hour=hour):
                res = self.post(reverse("event-list"), self.payload(event_hour=hour))
                self.assertEqual(res.status_code, 201, res.json())

    def test_범위_밖은_거부한다(self):
        for hour in (-1, 24, 100):
            with self.subTest(hour=hour):
                res = self.post(reverse("event-list"), self.payload(event_hour=hour))
                self.assertEqual(res.status_code, 400, f"{hour} 가 통과했다")

    def test_나중에_지울_수_있다(self):
        """한번 넣은 시각을 되돌릴 길이 없으면 잘못 고른 사람이 갇힌다."""
        event_id = self.post(reverse("event-list"), self.payload(event_hour=9)).json()["id"]

        res = self.client.patch(
            reverse("event-detail", args=[event_id]),
            {"event_hour": None},
            content_type="application/json",
            headers=self.auth,
        )
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(Event.objects.get(pk=event_id).event_hour)

    def test_목록에도_실려_온다(self):
        self.post(reverse("event-list"), self.payload(event_hour=15))
        res = self.get(reverse("event-list") + "?filter=upcoming")
        self.assertEqual(res.json()[0]["event_hour"], 15)

    def test_같은_날_안에서_시각_순이고_시각_없는_것이_앞이다(self):
        day = str(self.today + dt.timedelta(days=2))
        self.post(reverse("event-list"), self.payload(event_date=day, title="오후3시", event_hour=15))
        self.post(reverse("event-list"), self.payload(event_date=day, title="하루종일"))
        self.post(reverse("event-list"), self.payload(event_date=day, title="오전9시", event_hour=9))

        res = self.get(reverse("event-list") + f"?date={day}")
        self.assertEqual(
            [row["title"] for row in res.json()],
            ["하루종일", "오전9시", "오후3시"],
        )

    def test_기간_목록도_같은_순서다(self):
        day = str(self.today + dt.timedelta(days=2))
        self.post(reverse("event-list"), self.payload(event_date=day, title="저녁", event_hour=20))
        self.post(reverse("event-list"), self.payload(event_date=day, title="아침", event_hour=7))

        res = self.get(reverse("event-list") + f"?from={day}&to={day}")
        self.assertEqual([row["title"] for row in res.json()], ["아침", "저녁"])


class MultiDayEventTests(ApiTestCase):
    """
    여행·행사처럼 며칠에 걸치는 일정.

    경계가 전부 "겹치는가" 로 바뀌는 자리다 — 하루 보기, 주간 창, 다가올/지난,
    달력 띠, 주간 정리까지. 한 군데만 옛 규칙(시작일이 창 안인가)으로 남으면
    여행 둘째 날 아침에 목록이 비어 보인다.
    """

    def payload(self, **over):
        return {
            "zone": self.zone.id,
            "event_date": str(self.today + dt.timedelta(days=1)),
            "title": "제주 여행",
            "content": "",
            "priority": 4,
            "alerts": ["D-1 20:00"],
            **over,
        }

    def make(self, start: int, days: int, title="제주 여행", **over) -> Event:
        """오늘로부터 `start`일 뒤에 시작해 `days`일 이어지는 일정."""
        first = self.today + dt.timedelta(days=start)
        return Event.objects.create(
            zone=self.zone,
            event_date=first,
            end_date=first + dt.timedelta(days=days - 1),
            title=title,
            **over,
        )

    def titles(self, query: str) -> list[str]:
        return [n["title"] for n in self.get(f"{reverse('event-list')}{query}").json()]

    # ── 저장 ────────────────────────────────────────────────────

    def test_an_event_without_an_end_date_is_a_single_day(self):
        """대부분은 하루짜리다. 폼이 안 보내도 마지막 날은 시작일로 채워진다."""
        body = self.post(reverse("event-list"), self.payload()).json()
        self.assertEqual(body["end_date"], body["event_date"])

    def test_a_span_round_trips(self):
        start = self.today + dt.timedelta(days=1)
        body = self.post(
            reverse("event-list"),
            self.payload(end_date=str(start + dt.timedelta(days=2))),
        ).json()
        self.assertEqual(body["event_date"], str(start))
        self.assertEqual(body["end_date"], str(start + dt.timedelta(days=2)))
        self.assertEqual(Event.objects.get(pk=body["id"]).span_days, 3)

    def test_an_end_before_the_start_is_refused(self):
        res = self.post(reverse("event-list"), self.payload(end_date=str(self.today)))
        self.assertEqual(res.status_code, 400)
        self.assertIn("end_date", res.json())

    def test_an_absurdly_long_span_is_refused(self):
        """연도를 잘못 골라 몇 달치 달력이 통째로 칠해지는 사고를 여기서 잡는다."""
        far = self.today + dt.timedelta(days=MAX_SPAN_DAYS + 5)
        res = self.post(reverse("event-list"), self.payload(end_date=str(far)))
        self.assertEqual(res.status_code, 400)

    def test_moving_the_start_carries_the_end_along(self):
        """3일짜리 여행을 다음 주로 미루면 3일짜리인 채로 옮겨간다."""
        trip = self.make(1, 3)
        moved = self.today + dt.timedelta(days=8)

        res = self.client.patch(
            reverse("event-detail", args=[trip.id]),
            {"event_date": str(moved)},
            content_type="application/json",
            headers=self.auth,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["end_date"], str(moved + dt.timedelta(days=2)))

    def test_alerts_are_anchored_to_the_first_day(self):
        """
        "1일 전 20:00" 은 떠나기 전날 밤이다. 마지막 날을 기준으로 재면
        여행이 다 끝나갈 때 짐 싸라는 알림이 온다.
        """
        trip = self.make(3, 4)
        trip.sync_alerts(["D-1 20:00"])
        alert = trip.alerts.get()
        self.assertEqual(
            timezone.localtime(alert.due_at).date(), trip.event_date - dt.timedelta(days=1)
        )

    def test_a_span_gets_one_alert_per_code_not_one_per_day(self):
        """
        나흘짜리 여행이라고 알림이 나흘 오지 않는다. 같은 일을 두고 며칠 내리
        울리면 받는 쪽은 어느 날이 진짜 챙길 날인지 알 수 없다.
        """
        trip = self.make(3, 4)
        trip.sync_alerts(["D-1 20:00", "D 08:00"])

        self.assertEqual(trip.alerts.count(), 2)
        self.assertEqual(
            sorted(timezone.localtime(a.due_at).date() for a in trip.alerts.all()),
            [trip.event_date - dt.timedelta(days=1), trip.event_date],
        )

    def test_stretching_the_end_date_adds_no_alerts(self):
        """마지막 날을 미뤄도 예약은 시작일에 걸린 그대로다."""
        trip = self.make(3, 2)
        trip.sync_alerts(["D-1 20:00"])
        before = timezone.localtime(trip.alerts.get().due_at)

        res = self.client.patch(
            reverse("event-detail", args=[trip.id]),
            {"end_date": str(trip.event_date + dt.timedelta(days=6))},
            content_type="application/json",
            headers=self.auth,
        )
        self.assertEqual(res.status_code, 200)

        trip.refresh_from_db()
        self.assertEqual(trip.alerts.count(), 1)
        self.assertEqual(timezone.localtime(trip.alerts.get().due_at), before)

    @override_settings(N8N_API_KEY="right-key")
    def test_the_hourly_run_finds_nothing_on_a_middle_day(self):
        """
        매시 발송은 시각이 된 예약만 집는다. 예약이 시작일에만 걸리므로 여행
        둘째 날에는 집을 것이 없다 — 여기가 "중간에는 안 보낸다"가 지켜지는 자리다.
        """
        trip = self.make(-1, 3)  # 어제 떠나 내일 돌아온다
        trip.sync_alerts(["D 08:00"])  # 어제 아침에 이미 나갔어야 할 예약

        res = self.client.get("/events/alerts", headers={"x-api-key": "right-key"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["data"], [])

    @override_settings(N8N_API_KEY="right-key")
    def test_the_hourly_run_fires_once_at_the_start(self):
        """반대쪽 못. 시작점의 예약은 시각이 되면 담겨야 한다."""
        trip = self.make(0, 3)
        alert = EventAlert.objects.create(
            event=trip, code="D 08:00", due_at=timezone.now() - dt.timedelta(minutes=5)
        )

        res = self.client.get("/events/alerts", headers={"x-api-key": "right-key"})
        self.assertEqual(res.json()["ids"], [alert.id])
        self.assertEqual(len(res.json()["data"]), 1)

    # ── 하루 보기 ───────────────────────────────────────────────

    def test_a_middle_day_shows_the_trip(self):
        """여행 둘째 날 아침에 달력을 펼치면 그 날도 여행 중이어야 한다."""
        self.make(0, 3)
        middle = self.today + dt.timedelta(days=1)
        self.assertEqual(self.titles(f"?date={middle}"), ["제주 여행"])

    def test_the_last_day_is_inside_and_the_next_one_is_not(self):
        self.make(0, 3)
        last = self.today + dt.timedelta(days=2)
        self.assertEqual(self.titles(f"?date={last}"), ["제주 여행"])
        self.assertEqual(self.titles(f"?date={last + dt.timedelta(days=1)}"), [])

    # ── 창·필터 ─────────────────────────────────────────────────

    def test_a_window_catches_a_trip_that_began_before_it(self):
        """지난주에 떠나 이번 주에 돌아오는 여행은 이번 주 목록에도 있어야 한다."""
        self.make(-2, 5)
        start = self.today
        self.assertEqual(self.titles(f"?from={start}&to={start + dt.timedelta(days=6)}"), ["제주 여행"])

    def test_upcoming_keeps_a_trip_that_is_already_under_way(self):
        self.make(-1, 3)
        self.assertEqual(self.titles("?filter=upcoming"), ["제주 여행"])

    def test_past_waits_until_the_last_day_is_over(self):
        """오늘까지 이어지는 여행은 아직 지난 일정이 아니다."""
        self.make(-2, 3)  # 오늘이 마지막 날
        self.assertEqual(self.titles("?filter=past"), [])

        self.make(-9, 3, title="지난 여행")  # 엿새 전에 끝났다
        self.assertEqual(self.titles("?filter=past"), ["지난 여행"])

    def test_completing_an_ongoing_trip_takes_it_out_of_upcoming(self):
        self.make(-1, 3, completed_at=timezone.now())
        self.assertEqual(self.titles("?filter=upcoming"), [])

    # ── 달력 띠 ─────────────────────────────────────────────────

    def calendar(self, query: str) -> list:
        return self.get(f"{reverse('calendar')}{query}").json()

    def test_the_span_comes_back_whole_not_cut_into_days(self):
        """
        여기서 날마다 잘라 보내면 웹이 그것을 다시 붙일 수 없다 — 사흘짜리 여행이
        하루짜리 셋과 구별되지 않고, 띠가 아니라 점 셋으로 그려진다.
        """
        trip = self.make(1, 3)
        rows = self.calendar(f"?from={self.today}&to={self.today + dt.timedelta(days=7)}")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["event_date"], str(trip.event_date))
        self.assertEqual(rows[0]["end_date"], str(trip.end_date))

    def test_a_trip_that_began_before_the_window_still_comes(self):
        """창 밖에서 시작한 여행도 창 안의 날들을 지나므로 담겨야 한다."""
        trip = self.make(-3, 10)
        rows = self.calendar(f"?from={self.today}&to={self.today + dt.timedelta(days=2)}")
        self.assertEqual(len(rows), 1)
        # 자르지 않고 원래 양끝을 준다. 어디까지 이어지는지는 웹이 창에 맞춰 자른다.
        self.assertEqual(rows[0]["event_date"], str(trip.event_date))
        self.assertEqual(rows[0]["end_date"], str(trip.end_date))

    def test_a_trip_that_ends_before_the_window_does_not_come(self):
        self.make(-9, 3)
        self.assertEqual(self.calendar(f"?from={self.today}&to={self.today}"), [])

    def test_two_events_on_the_same_day_are_two_rows(self):
        """예전에는 공간별로 접었다. 띠는 일정마다 하나씩 그려지므로 접지 않는다."""
        self.make(0, 3)
        self.make(1, 1, title="같은 날 다른 일")
        day = str(self.today + dt.timedelta(days=1))
        self.assertEqual(len(self.calendar(f"?from={day}&to={day}")), 2)

    # ── 주간 정리(ntfy) ─────────────────────────────────────────

    def trip_in_next_week(self, days: int, title="제주 여행") -> Event:
        """주간 정리가 담는 창(다음 주) 첫날부터 `days`일 이어지는 일정."""
        start, _ = next_week()
        return Event.objects.create(
            zone=self.zone,
            event_date=start,
            end_date=start + dt.timedelta(days=days - 1),
            title=title,
        )

    @override_settings(N8N_API_KEY="right-key")
    def test_the_weekly_digest_writes_the_trip_on_each_day_it_covers(self):
        """
        묶음은 날짜별이라, 여행이 시작한 날에만 적히면 둘째 날 줄이 비어 보인다.
        어느 날이 며칠째인지도 함께 적는다.
        """
        # 창은 views.next_week() 이 정한다. 여기서 다시 세면 그쪽이 바뀔 때
        # 이 테스트만 조용히 창 밖을 가리키게 된다.
        self.trip_in_next_week(3)
        res = self.client.get("/events/weekly", headers={"x-api-key": "right-key"})
        self.assertEqual(res.status_code, 200)

        lines = [line for line in res.json()[0]["message"].splitlines() if "제주 여행" in line]
        self.assertEqual(len(lines), 3)
        self.assertTrue(all("/3일차)" in line for line in lines), lines)
        # 같은 줄이 반복되면 며칠째인지 표시가 붙지 않은 것이다
        self.assertEqual(len(set(lines)), len(lines))

    @override_settings(N8N_API_KEY="right-key")
    def test_a_single_day_event_gets_no_day_marker(self):
        self.trip_in_next_week(1, title="상담")
        res = self.client.get("/events/weekly", headers={"x-api-key": "right-key"})
        line = next(line for line in res.json()[0]["message"].splitlines() if "상담" in line)
        self.assertNotIn("일차", line)


class WebPushTests(TestCase):
    """
    웹 푸시. ntfy 옆에 선 두 번째 길이라, **이쪽이 실패해도 저쪽이 멀쩡해야 한다**는
    것이 대부분의 경계다.
    """

    def setUp(self):
        from accounts.models import PushSubscription

        self.model = PushSubscription
        self.user = User.objects.create_user(username="push-owner", password="pw-strong-1234")
        self.zone = Zone.objects.create(owner=self.user, name="어린이집")
        self.today = timezone.localdate()
        self.phone = self.subscribe("phone")

    def subscribe(self, name):
        return self.model.objects.create(
            user=self.user,
            endpoint=f"https://fcm.googleapis.com/fcm/send/{name}",
            p256dh="key-material",
            auth="auth-secret",
        )

    def make_due_alert(self, title="체육복", priority=4):
        event = Event.objects.create(
            zone=self.zone, event_date=self.today, title=title, priority=priority
        )
        event.sync_alerts(["D 07:00"])
        alert = event.alerts.get()
        # 창(지난 6시간) 안으로 끌어다 놓는다 — 코드가 가리키는 시각은 오늘 07시라
        # 테스트를 언제 돌리느냐에 따라 창 밖일 수 있다.
        alert.due_at = timezone.now() - dt.timedelta(minutes=5)
        alert.save(update_fields=["due_at"])
        return alert

    # ── 보내는 쪽 ──────────────────────────────────────────────

    @override_settings(**{"VAPID_PUBLIC_KEY": "pub", "VAPID_PRIVATE_KEY": "priv"})
    def test_켜둔_기기_전부로_간다(self):
        from notices.webpush import send_to_user

        self.subscribe("pc")
        with patch("notices.webpush.webpush") as sender:
            delivered = send_to_user(
                self.user, title="[어린이집] 체육복", message="9월 10일", priority=4, tag="t"
            )

        self.assertEqual(delivered, 2)
        self.assertEqual(sender.call_count, 2)
        body = json.loads(sender.call_args.kwargs["data"])
        self.assertEqual(body["title"], "[어린이집] 체육복")
        self.assertEqual(body["tag"], "t")

    @override_settings(**{"VAPID_PUBLIC_KEY": "pub", "VAPID_PRIVATE_KEY": "priv"})
    def test_죽은_구독은_그_자리에서_지운다(self):
        """
        브라우저를 다시 깔거나 권한을 끄면 구독은 말없이 죽는다. 남겨두면 보낼
        때마다 실패가 쌓이고, 사람은 알림이 안 오는 까닭을 알 수 없다.
        """
        from pywebpush import WebPushException

        from notices.webpush import send_to_user

        gone = WebPushException("gone")
        gone.response = SimpleNamespace(status_code=410)

        with patch("notices.webpush.webpush", side_effect=gone):
            delivered = send_to_user(self.user, title="t", message="m", priority=4, tag="t")

        self.assertEqual(delivered, 0)
        self.assertFalse(self.model.objects.exists())

    @override_settings(**{"VAPID_PUBLIC_KEY": "pub", "VAPID_PRIVATE_KEY": "priv"})
    def test_저쪽_사정으로_실패한_구독은_남긴다(self):
        """500·타임아웃은 푸시 서비스의 장애다. 그걸로 지우면 멀쩡한 기기를 잃는다."""
        from pywebpush import WebPushException

        from notices.webpush import send_to_user

        broken = WebPushException("server error")
        broken.response = SimpleNamespace(status_code=500)

        with patch("notices.webpush.webpush", side_effect=broken):
            send_to_user(self.user, title="t", message="m", priority=4, tag="t")

        self.assertTrue(self.model.objects.filter(pk=self.phone.pk).exists())

    @override_settings(**{"VAPID_PUBLIC_KEY": "", "VAPID_PRIVATE_KEY": ""})
    def test_키가_없으면_조용히_아무것도_하지_않는다(self):
        """웹 푸시를 안 켠 서버에서도 ntfy 는 그대로 돌아야 한다."""
        from notices.webpush import send_to_user

        with patch("notices.webpush.webpush") as sender:
            self.assertEqual(
                send_to_user(self.user, title="t", message="m", priority=4, tag="t"), 0
            )
        sender.assert_not_called()

    @override_settings(**{"VAPID_PUBLIC_KEY": "pub", "VAPID_PRIVATE_KEY": "priv"})
    def test_긴급은_기기를_바로_깨우라고_적는다(self):
        from notices.webpush import send_to_user

        with patch("notices.webpush.webpush") as sender:
            send_to_user(self.user, title="t", message="m", priority=Priority.URGENT, tag="t")

        self.assertEqual(sender.call_args.kwargs["headers"]["Urgency"], "high")

    # ── 크론이 부르는 자리 ─────────────────────────────────────

    def hourly(self, key="right-key"):
        """매시 크론이 부르는 자리. 부르는 것만으로 웹 푸시가 나간다."""
        return self.client.get("/events/alerts", headers={"x-api-key": key})

    @override_settings(N8N_API_KEY="right-key", VAPID_PUBLIC_KEY="pub", VAPID_PRIVATE_KEY="priv")
    def test_조회하면_그_자리에서_웹_푸시가_나간다(self):
        """
        웹 푸시는 본문을 기기 공개키로 암호화해야 해서 n8n 이 대신 못 쏜다. 그래서
        조회하는 자리가 발송까지 겸한다 — 크론을 한 번 더 부르게 해서 얻을 것이 없다.
        """
        self.make_due_alert("체육복")

        with patch("notices.webpush.webpush") as sender:
            res = self.hourly()

        self.assertEqual(res.status_code, 200)
        sender.assert_called_once()
        body = json.loads(sender.call_args.kwargs["data"])
        self.assertIn("체육복", body["body"])

    @override_settings(N8N_API_KEY="right-key", VAPID_PUBLIC_KEY="pub", VAPID_PRIVATE_KEY="priv")
    def test_웹_푸시로_닿은_묶음은_ntfy_목록에서_빠진다(self):
        """
        둘 다 보내면 두 길을 켜둔 사람이 같은 알림을 두 번 받는다. ntfy 는 뒤를
        받는 길이라, 닿은 묶음은 크론에게 건네지 않는다.
        """
        self.make_due_alert("체육복")

        with patch("notices.webpush.webpush"):
            res = self.hourly()

        self.assertEqual(res.json()["data"], [])

    @override_settings(N8N_API_KEY="right-key", VAPID_PUBLIC_KEY="pub", VAPID_PRIVATE_KEY="priv")
    def test_닿은_것도_ids_에는_남는다(self):
        """
        여기서 빼면 웹 푸시로 받은 예약이 pending 으로 남아 다음 시간에 ntfy 로
        한 번 더 나간다. 발송으로 찍힐 것은 어느 길로 갔든 같다.
        """
        due = self.make_due_alert("체육복")

        with patch("notices.webpush.webpush"):
            res = self.hourly()

        self.assertEqual(res.json()["ids"], [due.id])

    @override_settings(N8N_API_KEY="right-key", VAPID_PUBLIC_KEY="pub", VAPID_PRIVATE_KEY="priv")
    def test_기기가_다_죽었으면_ntfy_가_뒤를_받는다(self):
        from pywebpush import WebPushException

        broken = WebPushException("nope")
        broken.response = SimpleNamespace(status_code=500)

        self.make_due_alert("체육복")

        with patch("notices.webpush.webpush", side_effect=broken):
            res = self.hourly()

        data = res.json()["data"]
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["topic"], self.user.ntfy_topic)
        self.assertIn("체육복", data[0]["message"])

    @override_settings(N8N_API_KEY="right-key", VAPID_PUBLIC_KEY="", VAPID_PRIVATE_KEY="")
    def test_웹_푸시가_꺼진_서버는_전부_ntfy_로_간다(self):
        """VAPID 키를 안 넣은 서버에서도 알림은 그대로 나가야 한다."""
        self.make_due_alert("체육복")

        with patch("notices.webpush.webpush") as sender:
            res = self.hourly()

        sender.assert_not_called()
        self.assertEqual(len(res.json()["data"]), 1)

    @override_settings(N8N_API_KEY="right-key", VAPID_PUBLIC_KEY="pub", VAPID_PRIVATE_KEY="priv")
    def test_같은_공간_여러_건은_한_통으로_묶인다(self):
        """예약마다 한 통씩 보내면 같은 시각에 잡아둔 것들이 알림 다섯 개로 쏟아진다."""
        self.make_due_alert("체육복")
        self.make_due_alert("도시락")

        with patch("notices.webpush.webpush") as sender:
            self.hourly()

        self.assertEqual(sender.call_count, 1)
        body = json.loads(sender.call_args.kwargs["data"])
        self.assertEqual(body["title"], "[어린이집] 일정 2건")
        self.assertIn("체육복", body["body"])
        self.assertIn("도시락", body["body"])

    @override_settings(N8N_API_KEY="right-key", VAPID_PUBLIC_KEY="pub", VAPID_PRIVATE_KEY="priv")
    def test_보냈다고_발송_표시를_하지_않는다(self):
        """
        찍는 곳은 `PATCH /events/alerts/status` 한 곳뿐이다. 여기서 찍으면 크론이
        ntfy 를 쏘기도 전에 나간 것으로 남고, 그 사이에 죽으면 아무도 못 받는다.
        """
        due = self.make_due_alert()

        with patch("notices.webpush.webpush"):
            self.hourly()

        due.refresh_from_db()
        self.assertEqual(due.status, EventAlert.Status.PENDING)
        self.assertIsNone(due.sent_at)


class SendAlertFallbackTests(ApiTestCase):
    """상세 화면의 "보내기" 도 웹 푸시가 먼저고 ntfy 가 뒤를 받는다."""

    def setUp(self):
        super().setUp()
        from accounts.models import PushSubscription

        self.event = Event.objects.create(
            zone=self.zone, event_date=self.today + dt.timedelta(days=1), title="준비물"
        )
        self.event.sync_alerts(["D-1 20:00"])
        self.alert = self.event.alerts.get()
        self.subscription = PushSubscription.objects.create(
            user=self.user,
            endpoint="https://fcm.googleapis.com/fcm/send/phone",
            p256dh="key-material",
            auth="auth-secret",
        )
        self.url = reverse("alert-send", args=[self.event.id, self.alert.id])

    @override_settings(VAPID_PUBLIC_KEY="pub", VAPID_PRIVATE_KEY="priv")
    def test_웹_푸시로_닿으면_ntfy_는_부르지_않는다(self):
        """
        둘 다 보내면 같은 알림이 폰에 두 번 쌓인다. 닿았으면 발송이고, ntfy 를
        건너뛴 것이지 못 보낸 것이 아니다.
        """
        with patch("notices.ntfy.publish") as ntfy, patch("notices.webpush.webpush") as push:
            res = self.post(self.url, {})

        self.assertEqual(res.status_code, 200)
        push.assert_called_once()
        ntfy.assert_not_called()

        self.alert.refresh_from_db()
        self.assertEqual(self.alert.status, EventAlert.Status.SENT)
        self.assertIsNotNone(self.alert.sent_at)

    @override_settings(VAPID_PUBLIC_KEY="pub", VAPID_PRIVATE_KEY="priv")
    def test_웹_푸시가_막히면_ntfy_가_뒤를_받는다(self):
        from pywebpush import WebPushException

        broken = WebPushException("nope")
        broken.response = SimpleNamespace(status_code=500)

        with patch("notices.ntfy.publish") as ntfy, patch(
            "notices.webpush.webpush", side_effect=broken
        ):
            res = self.post(self.url, {})

        self.assertEqual(res.status_code, 200)
        ntfy.assert_called_once()
        self.alert.refresh_from_db()
        self.assertEqual(self.alert.status, EventAlert.Status.SENT)

    @override_settings(VAPID_PUBLIC_KEY="pub", VAPID_PRIVATE_KEY="priv")
    def test_어느_길로_가든_같은_문구다(self):
        """한쪽이 막혀 넘어갔을 때 말이 달라지면 알림이 다른 것이 된다."""
        from pywebpush import WebPushException

        broken = WebPushException("nope")
        broken.response = SimpleNamespace(status_code=500)

        with patch("notices.webpush.webpush") as push:
            self.post(self.url, {})
        pushed = json.loads(push.call_args.kwargs["data"])

        self.alert.refresh_from_db()
        self.alert.status = EventAlert.Status.PENDING
        self.alert.save(update_fields=["status"])

        with patch("notices.ntfy.publish") as ntfy, patch(
            "notices.webpush.webpush", side_effect=broken
        ):
            self.post(self.url, {})

        self.assertEqual(pushed["title"], ntfy.call_args.kwargs["title"])
        self.assertEqual(pushed["body"], ntfy.call_args.kwargs["message"])

    @override_settings(VAPID_PUBLIC_KEY="pub", VAPID_PRIVATE_KEY="priv")
    def test_둘_다_막히면_실패다(self):
        from pywebpush import WebPushException

        broken = WebPushException("nope")
        broken.response = SimpleNamespace(status_code=500)

        with patch("notices.ntfy.publish", side_effect=NtfyError("닿지 못했어요")), patch(
            "notices.webpush.webpush", side_effect=broken
        ):
            res = self.post(self.url, {})

        self.assertEqual(res.status_code, 502)
        self.alert.refresh_from_db()
        self.assertEqual(self.alert.status, EventAlert.Status.FAILED)

    @override_settings(VAPID_PUBLIC_KEY="", VAPID_PRIVATE_KEY="")
    def test_웹_푸시가_꺼진_서버에서도_ntfy_는_그대로다(self):
        with patch("notices.ntfy.publish") as ntfy, patch("notices.webpush.webpush") as push:
            res = self.post(self.url, {})

        self.assertEqual(res.status_code, 200)
        ntfy.assert_called_once()
        push.assert_not_called()
