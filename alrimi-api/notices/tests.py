import datetime as dt
import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from zones.models import Zone

from .filters import UPCOMING_DAYS, upcoming_end
from .models import Alert, Notice, due_at_for, parse_code
from .ntfy import NtfyError, compose, publish

User = get_user_model()


class CodeTests(TestCase):
    def test_parse(self):
        self.assertEqual(parse_code("D-1 20:00"), (1, 20))
        self.assertEqual(parse_code("D 07:00"), (0, 7))

    def test_bad_codes_are_rejected(self):
        from django.core.exceptions import ValidationError

        for bad in ["X-1 20:00", "D-1 20:30", "D-1", "D-1 25:00", ""]:
            with self.assertRaises(ValidationError, msg=bad):
                parse_code(bad)

    def test_due_at_is_local_time(self):
        due = due_at_for(dt.date(2026, 9, 11), "D-1 20:00")
        self.assertEqual(timezone.localtime(due).strftime("%Y-%m-%d %H:%M"), "2026-09-10 20:00")


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


class NoticeCrudTests(ApiTestCase):
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
        res = self.post(reverse("notice-list"), self.payload())
        self.assertEqual(res.status_code, 201)

        body = res.json()
        self.assertEqual(body["zone_name"], "우리집")
        self.assertEqual(body["zone_id"], self.zone.id)
        self.assertEqual(body["zone_color"], self.zone.color)
        self.assertEqual([a["code"] for a in body["alerts"]], ["D-1 20:00", "D 07:00"])
        self.assertTrue(all(a["sent_at"] is None for a in body["alerts"]))

    def test_bad_alert_code_is_400(self):
        res = self.post(reverse("notice-list"), self.payload(alerts=["오늘"]))
        self.assertEqual(res.status_code, 400)

    def test_a_past_date_is_refused(self):
        """
        지난 날짜로 등록되면 알림 시각이 이미 지나 있어
        보내는 쪽이 저장 직후 그 일정의 예약을 전부 집어 들고 한꺼번에 쏘게 된다.
        """
        past = str(self.today - dt.timedelta(days=1))
        res = self.post(reverse("notice-list"), self.payload(event_date=past))
        self.assertEqual(res.status_code, 400)
        self.assertIn("event_date", res.json())

    def test_today_is_allowed(self):
        res = self.post(reverse("notice-list"), self.payload(event_date=str(self.today)))
        self.assertEqual(res.status_code, 201)

    def test_an_existing_past_notice_stays_editable(self):
        notice = Notice.objects.create(
            zone=self.zone, event_date=self.today - dt.timedelta(days=5), title="지난 것"
        )
        notice.sync_alerts(["D 07:00"])

        res = self.client.patch(
            reverse("notice-detail", args=[notice.id]),
            {"title": "이름만 고침"},
            content_type="application/json",
            headers=self.auth,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["title"], "이름만 고침")

    def test_moving_a_notice_into_the_past_is_refused(self):
        notice_id = self.post(
            reverse("notice-list"), self.payload()
        ).json()["id"]

        res = self.client.patch(
            reverse("notice-detail", args=[notice_id]),
            {"event_date": str(self.today - dt.timedelta(days=1))},
            content_type="application/json",
            headers=self.auth,
        )
        self.assertEqual(res.status_code, 400)

    def test_empty_alerts_is_400(self):
        res = self.post(reverse("notice-list"), self.payload(alerts=[]))
        self.assertEqual(res.status_code, 400)

    def test_update_keeps_sent_alerts_and_replaces_the_rest(self):
        notice_id = self.post(
            reverse("notice-list"), self.payload()
        ).json()["id"]

        sent = Alert.objects.get(notice_id=notice_id, code="D-1 20:00")
        sent.mark_sent()

        res = self.client.patch(
            reverse("notice-detail", args=[notice_id]),
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
        notice_id = self.post(
            reverse("notice-list"), self.payload()
        ).json()["id"]
        moved = self.today + dt.timedelta(days=10)

        self.client.patch(
            reverse("notice-detail", args=[notice_id]),
            {"event_date": str(moved)},
            content_type="application/json",
            headers=self.auth,
        )
        alert = Alert.objects.get(notice_id=notice_id, code="D 07:00")
        self.assertEqual(timezone.localtime(alert.due_at).date(), moved)

    def test_other_users_notice_is_404(self):
        notice = Notice.objects.create(
            zone=Zone.objects.create(owner=self.other, name="남의집"),
            event_date=self.today,
            title="비밀",
        )
        self.assertEqual(self.get(reverse("notice-detail", args=[notice.id])).status_code, 404)

    def test_delete_removes_alerts(self):
        notice_id = self.post(
            reverse("notice-list"), self.payload()
        ).json()["id"]

        res = self.client.delete(reverse("notice-detail", args=[notice_id]), headers=self.auth)
        self.assertEqual(res.status_code, 204)
        self.assertFalse(Alert.objects.filter(notice_id=notice_id).exists())


class NoticeListTests(ApiTestCase):
    def make(self, offset_days: int, title: str) -> Notice:
        return Notice.objects.create(
            zone=self.zone,
            event_date=self.today + dt.timedelta(days=offset_days),
            title=title,
        )

    def titles(self, filter_name: str) -> list[str]:
        url = f"{reverse('notice-list')}?filter={filter_name}"
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
        notice = self.make(1, "점 확인")
        Alert.objects.create(notice=notice, code="D-1 20:00", due_at=timezone.now()).mark_sent()
        Alert.objects.create(notice=notice, code="D 07:00", due_at=timezone.now()).mark_failed()
        Alert.objects.create(notice=notice, code="D-2 20:00", due_at=timezone.now())

        url = f"{reverse('notice-list')}?filter=upcoming"
        row = next(n for n in self.get(url).json() if n["title"] == "점 확인")
        self.assertEqual(row["alerts"], {"total": 3, "sent": 1})

    def test_a_failed_alert_is_not_counted_as_sent(self):
        """실패는 나간 것이 아니다. 점이 초록으로 차면 온 줄 알게 된다."""
        notice = self.make(1, "실패 확인")
        Alert.objects.create(notice=notice, code="D 07:00", due_at=timezone.now()).mark_failed()

        url = f"{reverse('notice-list')}?filter=upcoming"
        row = next(n for n in self.get(url).json() if n["title"] == "실패 확인")
        self.assertEqual(row["alerts"], {"total": 1, "sent": 0})


class CrossZoneListTests(ApiTestCase):
    """목록의 축은 날짜다 — 공간은 좁히는 필터일 뿐."""

    def setUp(self):
        super().setUp()
        self.other_zone = Zone.objects.create(owner=self.user, name="어린이집")
        self.mine = Notice.objects.create(zone=self.zone, event_date=self.today, title="우리집 일")
        self.theirs = Notice.objects.create(
            zone=self.other_zone, event_date=self.today, title="어린이집 일"
        )
        # 남의 계정 것은 절대 섞이면 안 된다
        Notice.objects.create(
            zone=Zone.objects.create(owner=self.other, name="남의집"),
            event_date=self.today,
            title="남의 일",
        )

    def titles(self, query: str = "") -> list[str]:
        return [n["title"] for n in self.get(f"{reverse('notice-list')}{query}").json()]

    def test_default_spans_every_zone_of_the_owner(self):
        self.assertEqual(sorted(self.titles("?filter=upcoming")), ["어린이집 일", "우리집 일"])

    def test_zone_query_narrows_the_list(self):
        self.assertEqual(self.titles(f"?filter=upcoming&zone={self.zone.id}"), ["우리집 일"])

    def test_zone_of_another_owner_yields_nothing(self):
        stranger = Zone.objects.filter(owner=self.other).first()
        self.assertEqual(self.titles(f"?filter=upcoming&zone={stranger.id}"), [])

    def test_non_numeric_zone_is_400(self):
        res = self.get(f"{reverse('notice-list')}?filter=upcoming&zone=abc")
        self.assertEqual(res.status_code, 400)

    def test_same_day_groups_by_zone(self):
        rows = self.get(f"{reverse('notice-list')}?filter=upcoming").json()
        self.assertEqual([r["zone_id"] for r in rows], sorted(r["zone_id"] for r in rows))

    def test_rows_carry_the_zone_colour_for_the_card_bar(self):
        row = next(r for r in self.get(f"{reverse('notice-list')}?filter=upcoming").json())
        self.assertTrue(row["zone_color"].startswith("#"))

    def test_date_query_returns_just_that_day(self):
        Notice.objects.create(
            zone=self.zone, event_date=self.today + dt.timedelta(days=1), title="내일 일"
        )
        self.assertEqual(sorted(self.titles(f"?date={self.today}")), ["어린이집 일", "우리집 일"])

    def test_date_wins_over_filter(self):
        past = self.today - dt.timedelta(days=3)
        Notice.objects.create(zone=self.zone, event_date=past, title="지난 일")
        # filter=upcoming 이어도 date 가 이긴다
        self.assertEqual(self.titles(f"?date={past}&filter=upcoming"), ["지난 일"])

    def test_malformed_date_is_400(self):
        self.assertEqual(self.get(f"{reverse('notice-list')}?date=8월19일").status_code, 400)


class CreateNoticeZoneTests(ApiTestCase):
    def body(self, zone_id):
        return {
            "zone": zone_id,
            "event_date": str(self.today),
            "title": "본문으로 공간 지정",
            "content": "",
            "priority": 3,
            "alerts": ["D 07:00"],
        }

    def test_zone_comes_from_the_body(self):
        res = self.post(reverse("notice-list"), self.body(self.zone.id))
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["zone_id"], self.zone.id)

    def test_cannot_plant_a_notice_in_someone_elses_zone(self):
        stranger = Zone.objects.create(owner=self.other, name="남의집")
        res = self.post(reverse("notice-list"), self.body(stranger.id))
        self.assertEqual(res.status_code, 400)

    def test_zone_is_required(self):
        payload = self.body(self.zone.id)
        del payload["zone"]
        self.assertEqual(self.post(reverse("notice-list"), payload).status_code, 400)

    def test_a_notice_can_be_moved_to_another_zone(self):
        notice_id = self.post(reverse("notice-list"), self.body(self.zone.id)).json()["id"]
        target = Zone.objects.create(owner=self.user, name="회사")

        res = self.client.patch(
            reverse("notice-detail", args=[notice_id]),
            {"zone": target.id},
            content_type="application/json",
            headers=self.auth,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["zone_id"], target.id)


class CalendarTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.other_zone = Zone.objects.create(owner=self.user, name="어린이집")
        Notice.objects.create(zone=self.zone, event_date=self.today, title="a")
        Notice.objects.create(zone=self.zone, event_date=self.today, title="b")
        Notice.objects.create(zone=self.other_zone, event_date=self.today, title="c")

    def calendar(self, query: str) -> dict:
        return self.get(f"{reverse('calendar')}{query}").json()

    def span(self, days: int = 7) -> str:
        return f"?from={self.today}&to={self.today + dt.timedelta(days=days)}"

    def test_returns_one_row_per_zone_not_per_notice(self):
        """같은 공간에 일정이 두 개여도 표시는 하나다."""
        data = self.calendar(self.span())
        self.assertEqual(
            data[str(self.today)],
            [
                {"zone": self.zone.id, "color": self.zone.color},
                {"zone": self.other_zone.id, "color": self.other_zone.color},
            ],
        )

    def test_each_row_says_which_zone_not_just_a_colour(self):
        """색약이면 색만으로는 어느 공간인지 못 읽는다. 웹이 머리글자를 그린다."""
        row = self.calendar(self.span())[str(self.today)][0]
        self.assertEqual(row["zone"], self.zone.id)

    def test_days_without_notices_are_absent(self):
        data = self.calendar(self.span())
        self.assertEqual(list(data), [str(self.today)])

    def test_zone_query_narrows_the_dots(self):
        data = self.calendar(f"{self.span()}&zone={self.zone.id}")
        self.assertEqual(data[str(self.today)], [{"zone": self.zone.id, "color": self.zone.color}])

    def test_range_is_inclusive_on_both_ends(self):
        edge = self.today + dt.timedelta(days=3)
        Notice.objects.create(zone=self.zone, event_date=edge, title="끝날")
        data = self.calendar(f"?from={edge}&to={edge}")
        self.assertEqual(list(data), [str(edge)])

    def test_other_owners_notices_never_appear(self):
        Notice.objects.create(
            zone=Zone.objects.create(owner=self.other, name="남의집"),
            event_date=self.today,
            title="남의 일",
        )
        self.assertEqual(len(self.calendar(self.span())[str(self.today)]), 2)

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
            offset: Notice.objects.create(
                zone=self.zone,
                event_date=self.today + dt.timedelta(days=offset),
                title=f"D{offset:+d}",
            )
            for offset in (-1, 0, 6, 7, 13)
        }

    def titles(self, query: str) -> list[str]:
        return [n["title"] for n in self.get(f"{reverse('notice-list')}{query}").json()]

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

    def test_previous_window_reaches_past_notices(self):
        self.assertIn("D-1", self.titles(self.span(-UPCOMING_DAYS)))

    def test_range_is_inclusive_on_both_ends(self):
        edge = self.today + dt.timedelta(days=6)
        self.assertEqual(self.titles(f"?from={edge}&to={edge}"), ["D+6"])

    def test_zone_query_still_narrows_it(self):
        other = Zone.objects.create(owner=self.user, name="어린이집")
        Notice.objects.create(zone=other, event_date=self.today, title="남의 공간")
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
        self.assertEqual(self.get(f"{reverse('notice-list')}?to={self.today}").status_code, 400)

    def test_calendar_still_needs_both_ends(self):
        res = self.get(f"{reverse('calendar')}?from={self.today}")
        self.assertEqual(res.status_code, 400)

    def test_reversed_range_is_400(self):
        back = self.today - dt.timedelta(days=1)
        self.assertEqual(
            self.get(f"{reverse('notice-list')}?from={self.today}&to={back}").status_code, 400
        )

    def test_absurd_range_is_refused(self):
        far = self.today + dt.timedelta(days=500)
        self.assertEqual(
            self.get(f"{reverse('notice-list')}?from={self.today}&to={far}").status_code, 400
        )


class AlertStatusTests(ApiTestCase):
    """예약 → 발송됨 / 발송 실패."""

    def setUp(self):
        super().setUp()
        self.notice = Notice.objects.create(zone=self.zone, event_date=self.today, title="준비물")
        self.notice.sync_alerts(["D 07:00"])
        self.alert = self.notice.alerts.get()

    def detail(self) -> dict:
        rows = self.get(reverse("notice-detail", args=[self.notice.id])).json()["alerts"]
        return rows[0]

    def test_a_new_alert_is_pending(self):
        self.assertEqual(self.alert.status, Alert.Status.PENDING)
        self.assertIsNone(self.alert.sent_at)
        self.assertEqual(self.detail()["status"], "")

    def test_marking_sent_records_both_the_state_and_the_time(self):
        self.alert.mark_sent()

        self.alert.refresh_from_db()
        self.assertEqual(self.alert.status, Alert.Status.SENT)
        self.assertIsNotNone(self.alert.sent_at)

        row = self.detail()
        self.assertEqual(row["status"], "sent")
        self.assertIsNotNone(row["sent_at"])

    def test_marking_failed_leaves_sent_at_empty(self):
        """`sent_at` 이 차면 목록의 발송 점이 나간 것으로 센다."""
        self.alert.mark_failed()

        self.alert.refresh_from_db()
        self.assertEqual(self.alert.status, Alert.Status.FAILED)
        self.assertIsNone(self.alert.sent_at)

    def test_the_detail_screen_can_tell_failed_from_pending(self):
        """둘 다 sent_at 이 비어 있다. status 가 없으면 실패가 '대기 중'으로 보인다."""
        self.alert.mark_failed()
        self.assertEqual(self.detail()["status"], "fail")


class CompletionTests(ApiTestCase):
    """완료한 일정은 목록·달력 점·발송에서 모두 빠진다."""

    def setUp(self):
        super().setUp()
        self.notice = Notice.objects.create(
            zone=self.zone, event_date=self.today, title="체육복 챙기기", content="흰 티셔츠"
        )
        self.notice.sync_alerts(["D 07:00"])
        self.alert = self.notice.alerts.get()
        # 오늘 07:00 은 이미 지난 시각이라 발송 대상이다
        Alert.objects.filter(pk=self.alert.pk).update(due_at=timezone.now() - dt.timedelta(hours=1))

    def complete(self, value: bool):
        return self.client.patch(
            reverse("notice-detail", args=[self.notice.id]),
            {"completed": value},
            content_type="application/json",
            headers=self.auth,
        )

    def agenda(self) -> list[str]:
        url = f"{reverse('notice-list')}?from={self.today}"
        return [n["title"] for n in self.get(url).json()]

    def test_patch_completed_sets_and_clears_the_timestamp(self):
        res = self.complete(True)
        self.assertEqual(res.status_code, 200)
        self.assertIsNotNone(res.json()["completed_at"])

        self.assertIsNone(self.complete(False).json()["completed_at"])

    def test_completing_only_needs_the_flag(self):
        """알림 코드를 통째로 다시 보내지 않아도 된다."""
        self.complete(True)
        self.assertEqual(self.notice.alerts.count(), 1)

    def test_a_completed_past_notice_stays_in_the_list(self):
        """지난 일정은 기록이다. 끝낸 것을 지우면 그 날이 틀리게 남는다."""
        past = Notice.objects.create(
            zone=self.zone, event_date=self.today - dt.timedelta(days=3), title="독감 예방접종"
        )
        past.set_completed(True)

        start = self.today - dt.timedelta(days=7)
        url = f"{reverse('notice-list')}?from={start}&to={self.today}"
        rows = self.get(url).json()

        row = next(n for n in rows if n["title"] == "독감 예방접종")
        self.assertIsNotNone(row["completed_at"])

    def test_a_completed_past_notice_keeps_its_calendar_dot(self):
        day = self.today - dt.timedelta(days=3)
        past = Notice.objects.create(zone=self.zone, event_date=day, title="독감 예방접종")
        past.set_completed(True)

        data = self.get(f"{reverse('calendar')}?from={day}&to={day}").json()
        self.assertEqual(data[str(day)], [{"zone": self.zone.id, "color": self.zone.color}])

    def test_it_stays_in_the_window_but_is_marked_done(self):
        """
        기간 목록에서는 사라지지 않는다 — 웹이 흐리게 그리고 뒤로 민다.
        완료했다고 그 날에서 없어지면 "내가 뭘 했더라"를 못 본다.
        """
        self.assertIn("체육복 챙기기", self.agenda())

        self.complete(True)
        rows = self.get(f"{reverse('notice-list')}?from={self.today}").json()
        row = next(r for r in rows if r["title"] == "체육복 챙기기")
        self.assertIsNotNone(row["completed_at"])

    def test_it_drops_out_of_the_upcoming_filter(self):
        """`filter=upcoming` 은 '아직 남은 것'을 묻는 질문이라 빠진다."""
        url = f"{reverse('notice-list')}?filter=upcoming"
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
        url = f"{reverse('notice-list')}?date={self.today}"
        rows = self.get(url).json()
        self.assertEqual([n["title"] for n in rows], ["체육복 챙기기"])
        self.assertIsNotNone(rows[0]["completed_at"])

    def test_the_calendar_dot_disappears(self):
        span = f"?from={self.today}&to={self.today}"
        self.assertIn(str(self.today), self.get(f"{reverse('calendar')}{span}").json())

        self.complete(True)
        self.assertEqual(self.get(f"{reverse('calendar')}{span}").json(), {})

    def test_completing_keeps_the_alerts_so_undo_restores_them(self):
        """
        완료는 지우는 것이 아니라 덮는 것이다. 예약이 남아 있어야 취소했을 때
        되살아난다. 발송하는 쪽은 `completed_at` 이 빈 것만 골라 보내면 된다.
        """
        self.complete(True)
        self.assertEqual(self.notice.alerts.count(), 1)

        alert = self.notice.alerts.get()
        self.assertIsNone(alert.sent_at, "완료했다고 보낸 것으로 처리하면 안 된다")

        self.complete(False)
        self.notice.refresh_from_db()
        self.assertIsNone(self.notice.completed_at)
        self.assertEqual(self.notice.alerts.count(), 1)

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
    """POST /notices/{id}/alerts/{id}/send — 상세 화면의 '보내기'."""

    def setUp(self):
        super().setUp()
        self.notice = Notice.objects.create(
            zone=self.zone,
            event_date=self.today + dt.timedelta(days=1),
            title="준비물",
            content="흰 티셔츠",
        )
        self.notice.sync_alerts(["D-1 20:00"])
        self.alert = self.notice.alerts.get()

    def url(self, notice_id=None, alert_id=None):
        return reverse(
            "alert-send",
            args=[notice_id or self.notice.id, alert_id or self.alert.id],
        )

    def test_sending_goes_to_the_owners_topic_and_records_it(self):
        with patch("notices.ntfy.publish") as publish_mock:
            res = self.post(self.url(), {})

        self.assertEqual(res.status_code, 200)
        publish_mock.assert_called_once()
        topic = publish_mock.call_args.args[0]
        self.assertEqual(topic, self.user.ntfy_topic)
        # 우선순위는 일정의 것을 그대로 쓴다 — 값이 ntfy 등급(1~5)과 같은 축이다
        self.assertEqual(publish_mock.call_args.kwargs["priority"], self.notice.priority)

        self.alert.refresh_from_db()
        self.assertEqual(self.alert.status, Alert.Status.SENT)
        self.assertIsNotNone(self.alert.sent_at)
        self.assertEqual(res.json()["status"], "sent")

    def test_a_failure_is_recorded_and_the_reason_comes_back(self):
        with patch("notices.ntfy.publish", side_effect=NtfyError("ntfy 서버에 닿지 못했어요.")):
            res = self.post(self.url(), {})

        self.assertEqual(res.status_code, 502)
        self.assertIn("닿지 못했", res.json()["detail"])

        self.alert.refresh_from_db()
        self.assertEqual(self.alert.status, Alert.Status.FAILED)
        # 실패에 sent_at 이 차면 목록의 발송 점이 나간 것으로 센다
        self.assertIsNone(self.alert.sent_at)

    def test_other_peoples_alerts_are_not_reachable(self):
        theirs = Notice.objects.create(
            zone=Zone.objects.create(owner=self.other, name="남의집"),
            event_date=self.today + dt.timedelta(days=1),
            title="남의 일정",
        )
        theirs.sync_alerts(["D-1 20:00"])

        with patch("notices.ntfy.publish") as publish_mock:
            res = self.post(self.url(theirs.id, theirs.alerts.get().id), {})

        self.assertEqual(res.status_code, 404)
        publish_mock.assert_not_called()

    def test_the_alert_has_to_belong_to_that_notice(self):
        """경로의 두 id 가 어긋나면 남의 알림을 밀 수 있다."""
        elsewhere = Notice.objects.create(
            zone=self.zone, event_date=self.today + dt.timedelta(days=2), title="다른 일정"
        )
        elsewhere.sync_alerts(["D-1 20:00"])

        res = self.post(self.url(elsewhere.id, self.alert.id), {})
        self.assertEqual(res.status_code, 404)

    def test_the_message_says_which_space_and_when(self):
        """잠금화면에서 이것만 보고 판단한다."""
        title, message = compose(self.notice)

        self.assertEqual(title, "[우리집] 준비물")
        self.assertIn("흰 티셔츠", message)
        self.assertIn(str(self.notice.event_date.day), message)


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
        return Notice.objects.create(
            zone=self.zone, event_date=event_date, title=title, content="", priority=3
        )

    # ── 열쇠 ────────────────────────────────────────────────────

    @override_settings(N8N_API_KEY="right-key")
    def test_헤더가_없으면_막힌다(self):
        for url in ("/notices/weekly", "/notices/alerts"):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 403)

    @override_settings(N8N_API_KEY="right-key")
    def test_틀린_열쇠는_막힌다(self):
        res = self.client.get("/notices/weekly", headers={"x-api-key": "wrong-key"})
        self.assertEqual(res.status_code, 403)

    @override_settings(N8N_API_KEY="right-key")
    def test_맞는_열쇠는_통과한다(self):
        res = self.client.get("/notices/weekly", headers={"x-api-key": "right-key"})
        self.assertEqual(res.status_code, 200)

    @override_settings(N8N_API_KEY="")
    def test_서버에_열쇠가_없으면_열어두지_않는다(self):
        """설정이 비었을 때 통과시키면 아무나 들어온다. 막는 쪽이 맞다."""
        res = self.client.get("/notices/weekly", headers={"x-api-key": "anything"})
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
        self.assertEqual(self.client.get("/notices/weekly", headers=auth).status_code, 403)

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
            res = self.client.get("/notices/weekly", headers={"x-api-key": "k"})

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
                res = self.client.get("/notices/weekly", headers={"x-api-key": "k"})
            titles.add(res.json()[0]["title"])

        self.assertEqual(len(titles), 1, f"요일마다 기간이 달라졌다: {titles}")

    @override_settings(N8N_API_KEY="k")
    def test_완료한_일정은_빠진다(self):
        notice = self.make(dt.date(2026, 9, 14), "끝난_것")
        notice.completed_at = timezone.now()
        notice.save()

        with patch("notices.views.timezone.localdate", return_value=dt.date(2026, 9, 13)):
            res = self.client.get("/notices/weekly", headers={"x-api-key": "k"})

        self.assertEqual(res.json(), [])

    @override_settings(N8N_API_KEY="k")
    def test_토픽별로_묶인다(self):
        other = User.objects.create_user(username="cron-other", password="pw-strong-1234")
        other_zone = Zone.objects.create(owner=other, name="회사")
        self.make(dt.date(2026, 9, 14), "내_일정")
        Notice.objects.create(
            zone=other_zone, event_date=dt.date(2026, 9, 14), title="남_일정", content="", priority=3
        )

        with patch("notices.views.timezone.localdate", return_value=dt.date(2026, 9, 13)):
            res = self.client.get("/notices/weekly", headers={"x-api-key": "k"})

        topics = {item["topic"] for item in res.json()}
        self.assertEqual(len(topics), 2)
        self.assertIn(self.user.ntfy_topic, topics)
        self.assertIn(other.ntfy_topic, topics)


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
            "priority": 3,
            "alerts": ["D-1 20:00"],
        }
        body.update(over)
        return body

    def test_시각_없이_등록된다(self):
        res = self.post(reverse("notice-list"), self.payload())
        self.assertEqual(res.status_code, 201)
        self.assertIsNone(Notice.objects.get(pk=res.json()["id"]).event_hour)

    def test_시각을_담아_등록된다(self):
        res = self.post(reverse("notice-list"), self.payload(event_hour=9))
        self.assertEqual(res.status_code, 201)
        self.assertEqual(Notice.objects.get(pk=res.json()["id"]).event_hour, 9)

    def test_자정과_23시는_받는다(self):
        for hour in (0, 23):
            with self.subTest(hour=hour):
                res = self.post(reverse("notice-list"), self.payload(event_hour=hour))
                self.assertEqual(res.status_code, 201, res.json())

    def test_범위_밖은_거부한다(self):
        for hour in (-1, 24, 100):
            with self.subTest(hour=hour):
                res = self.post(reverse("notice-list"), self.payload(event_hour=hour))
                self.assertEqual(res.status_code, 400, f"{hour} 가 통과했다")

    def test_나중에_지울_수_있다(self):
        """한번 넣은 시각을 되돌릴 길이 없으면 잘못 고른 사람이 갇힌다."""
        notice_id = self.post(reverse("notice-list"), self.payload(event_hour=9)).json()["id"]

        res = self.client.patch(
            reverse("notice-detail", args=[notice_id]),
            {"event_hour": None},
            content_type="application/json",
            headers=self.auth,
        )
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(Notice.objects.get(pk=notice_id).event_hour)

    def test_목록에도_실려_온다(self):
        self.post(reverse("notice-list"), self.payload(event_hour=15))
        res = self.get(reverse("notice-list") + "?filter=upcoming")
        self.assertEqual(res.json()[0]["event_hour"], 15)

    def test_같은_날_안에서_시각_순이고_시각_없는_것이_앞이다(self):
        day = str(self.today + dt.timedelta(days=2))
        self.post(reverse("notice-list"), self.payload(event_date=day, title="오후3시", event_hour=15))
        self.post(reverse("notice-list"), self.payload(event_date=day, title="하루종일"))
        self.post(reverse("notice-list"), self.payload(event_date=day, title="오전9시", event_hour=9))

        res = self.get(reverse("notice-list") + f"?date={day}")
        self.assertEqual(
            [row["title"] for row in res.json()],
            ["하루종일", "오전9시", "오후3시"],
        )

    def test_기간_목록도_같은_순서다(self):
        day = str(self.today + dt.timedelta(days=2))
        self.post(reverse("notice-list"), self.payload(event_date=day, title="저녁", event_hour=20))
        self.post(reverse("notice-list"), self.payload(event_date=day, title="아침", event_hour=7))

        res = self.get(reverse("notice-list") + f"?from={day}&to={day}")
        self.assertEqual([row["title"] for row in res.json()], ["아침", "저녁"])
