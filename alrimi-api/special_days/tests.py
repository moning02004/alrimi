import datetime as dt

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse

from .models import DEFAULT_COLOR, Kind, MarkStyle, SpecialDay, styles_for
from .palette import COLORS, PALETTE

User = get_user_model()

KEY = "n8n-test-key"


class AuthedTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("hoon", password="pw-strong-1234")
        res = self.client.post(
            reverse("obtain-token"),
            {"username": "hoon", "password": "pw-strong-1234"},
            content_type="application/json",
        )
        self.auth = {"authorization": f"Bearer {res.json()['access_token']}"}

    def get(self, url):
        return self.client.get(url, headers=self.auth)

    def patch(self, url, body):
        return self.client.patch(url, body, content_type="application/json", headers=self.auth)


@override_settings(N8N_API_KEY=KEY)
class SyncTests(TestCase):
    """
    `POST /special-days/sync` 는 **그 기간의 그 종류는 이게 전부다** 라는 선언이다.
    부르고 나면 기간 안의 그 종류가 보낸 것과 똑같아진다.
    """

    url = reverse("special-day-sync")

    def sync(self, items, kind="holiday", start="2026-01-01", end="2026-12-31", **params):
        query = {"kind": kind, "from": start, "to": end, **params}
        return self.client.post(
            f"{self.url}?" + "&".join(f"{k}={v}" for k, v in query.items()),
            {"days": items},
            content_type="application/json",
            headers={"x-api-key": KEY},
        )

    def rows(self, kind=None):
        found = SpecialDay.objects.all()
        if kind:
            found = found.filter(kind=kind)
        return [(str(r.date), r.kind, r.name) for r in found]

    def test_it_creates_what_is_missing(self):
        res = self.sync([{"date": "2026-01-01", "name": "1월 1일"}])

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["added"], 1)
        self.assertEqual(self.rows(), [("2026-01-01", "holiday", "1월 1일")])

    def test_running_it_twice_changes_nothing(self):
        items = [{"date": "2026-01-01", "name": "1월 1일"}]
        self.sync(items)
        res = self.sync(items)

        self.assertEqual(
            {k: res.json()[k] for k in ("added", "updated", "removed", "kept")},
            {"added": 0, "updated": 0, "removed": 0, "kept": 1},
        )

    def test_a_renamed_day_is_corrected(self):
        SpecialDay.objects.create(date=dt.date(2026, 3, 2), kind="holiday", name="삼일절")
        res = self.sync([{"date": "2026-03-02", "name": "대체공휴일"}])

        self.assertEqual(res.json()["updated"], 1)
        self.assertEqual(self.rows(), [("2026-03-02", "holiday", "대체공휴일")])

    def test_a_day_that_vanished_is_removed(self):
        SpecialDay.objects.create(date=dt.date(2026, 3, 2), kind="holiday", name="대체공휴일")
        res = self.sync([{"date": "2026-01-01", "name": "1월 1일"}])

        self.assertEqual(res.json()["removed"], 1)
        self.assertEqual(self.rows(), [("2026-01-01", "holiday", "1월 1일")])

    def test_it_never_touches_outside_the_range(self):
        SpecialDay.objects.create(date=dt.date(2025, 12, 25), kind="holiday", name="기독탄신일")
        self.sync([{"date": "2026-01-01", "name": "1월 1일"}])

        self.assertIn(("2025-12-25", "holiday", "기독탄신일"), self.rows())

    # ── 종류마다 따로 돈다 ────────────────────────────────────────────

    def test_syncing_one_kind_leaves_the_others_alone(self):
        """공휴일을 맞췄다고 같은 기간의 절기가 지워지면, 둘 중 하나만 돌린 순간 달력이 빈다."""
        SpecialDay.objects.create(date=dt.date(2026, 3, 20), kind="term", name="춘분")

        self.sync([{"date": "2026-01-01", "name": "1월 1일"}], kind="holiday")

        self.assertEqual(self.rows("term"), [("2026-03-20", "term", "춘분")])

    def test_the_same_day_can_be_two_kinds_at_once(self):
        """추분이 추석과 겹치는 해가 있다. 하나가 다른 하나를 덮으면 안 된다."""
        self.sync([{"date": "2026-09-23", "name": "추석"}], kind="holiday")
        self.sync([{"date": "2026-09-23", "name": "추분"}], kind="term")

        self.assertEqual(SpecialDay.objects.filter(date=dt.date(2026, 9, 23)).count(), 2)

    def test_terms_go_in_as_their_own_kind(self):
        res = self.sync(
            [{"locdate": 20260320, "dateName": "춘분", "isHoliday": "N"}], kind="term"
        )

        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.rows(), [("2026-03-20", "term", "춘분")])

    def test_an_unknown_kind_is_400(self):
        self.assertEqual(self.sync([], kind="birthday").status_code, 400)

    def test_kind_defaults_to_holiday(self):
        res = self.client.post(
            f"{self.url}?from=2026-01-01&to=2026-12-31",
            {"days": [{"date": "2026-01-01", "name": "1월 1일"}]},
            content_type="application/json",
            headers={"x-api-key": KEY},
        )
        self.assertEqual(res.json()["kind"], "holiday")

    # ── 특일 정보 API 의 응답을 그대로 받는다 ──────────────────────────

    def test_it_accepts_the_public_api_shape_as_is(self):
        res = self.sync(
            [
                {"locdate": 20260101, "dateName": "1월 1일", "isHoliday": "Y"},
                {"locdate": "20260302", "dateName": "삼일절", "isHoliday": "Y"},
            ]
        )

        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            self.rows(), [("2026-01-01", "holiday", "1월 1일"), ("2026-03-02", "holiday", "삼일절")]
        )

    def test_the_old_field_name_still_works(self):
        """`holidays` 로 짜둔 워크플로가 있으면 그대로 돌아야 한다."""
        res = self.client.post(
            f"{self.url}?from=2026-01-01&to=2026-12-31",
            {"holidays": [{"date": "2026-01-01", "name": "1월 1일"}]},
            content_type="application/json",
            headers={"x-api-key": KEY},
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["added"], 1)

    def test_days_that_are_not_public_holidays_are_dropped(self):
        """
        `getHoliDeInfo` 는 공휴일과 쉬지 않는 기념일을 한 배열에 섞어 준다. 이 앱은
        쉬는 날만 담으므로, 그 응답을 그대로 넘겨도 기념일은 걸러져야 한다.
        """
        self.sync(
            [
                {"locdate": 20260301, "dateName": "삼일절", "isHoliday": "Y"},
                {"locdate": 20260405, "dateName": "식목일", "isHoliday": "N"},
            ],
            kind="holiday",
        )
        self.assertEqual(self.rows(), [("2026-03-01", "holiday", "삼일절")])

    def test_terms_ignore_the_holiday_flag(self):
        """절기는 전부 isHoliday=N 으로 오지만 그것이 '안 쉬는 기념일' 이라는 뜻은 아니다."""
        res = self.sync(
            [{"locdate": 20260320, "dateName": "춘분", "isHoliday": "N"}], kind="term"
        )
        self.assertEqual(res.json()["added"], 1)

    def test_a_malformed_date_is_400(self):
        self.assertEqual(self.sync([{"date": "2026/01/01", "name": "x"}]).status_code, 400)

    def test_the_error_points_at_the_right_line_the_way_people_count(self):
        """0부터 세면 "1번째 줄" 이 두 번째 줄을 가리켜, 엉뚱한 자리를 들여다보게 된다."""
        res = self.sync(
            [
                {"date": "2026-01-01", "name": "멀쩡한 줄"},
                {"date": "2026/01/02", "name": "틀린 줄"},
            ]
        )
        self.assertIn("2번째 줄", res.json()["days"][0])

    def test_the_error_reads_as_a_sentence_not_python_innards(self):
        """이 메시지는 n8n 로그에 남아 사람이 읽는다. ErrorDetail(...) 이 섞이면 안 된다."""
        message = self.sync([{"date": "2026/01/01", "name": "x"}]).json()["days"][0]

        self.assertNotIn("ErrorDetail", message)
        self.assertIn("날짜 형식이 올바르지 않습니다", message)

    def test_a_row_without_a_name_is_400(self):
        self.assertEqual(self.sync([{"date": "2026-01-01"}]).status_code, 400)

    def test_a_date_outside_the_range_is_400(self):
        self.assertEqual(self.sync([{"date": "2027-01-01", "name": "x"}]).status_code, 400)

    def test_the_same_day_with_two_names_is_400(self):
        res = self.sync(
            [
                {"date": "2026-01-01", "name": "1월 1일"},
                {"date": "2026-01-01", "name": "신정"},
            ]
        )
        self.assertEqual(res.status_code, 400)

    # ── 빈 응답으로 한 해를 날리지 않는다 ─────────────────────────────

    def test_an_empty_list_is_refused(self):
        SpecialDay.objects.create(date=dt.date(2026, 1, 1), kind="holiday", name="1월 1일")
        res = self.sync([])

        self.assertEqual(res.status_code, 400)
        self.assertEqual(len(self.rows()), 1, "빈 응답에 기존 자료가 지워졌다")

    def test_an_empty_list_goes_through_when_asked_for(self):
        SpecialDay.objects.create(date=dt.date(2026, 1, 1), kind="holiday", name="1월 1일")
        res = self.sync([], allow_empty="true")

        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.rows(), [])

    def test_a_list_filtered_down_to_nothing_is_also_refused(self):
        """섞인 응답에서 쉬는 날이 하나도 없었던 경우. 결과는 빈 목록이라 같은 이유로 막는다."""
        SpecialDay.objects.create(date=dt.date(2026, 1, 1), kind="holiday", name="1월 1일")
        res = self.sync([{"locdate": 20260405, "dateName": "식목일", "isHoliday": "N"}])

        self.assertEqual(res.status_code, 400)
        self.assertEqual(len(self.rows()), 1)

    # ── 기간·열쇠 ────────────────────────────────────────────────────

    def test_a_missing_range_is_400(self):
        res = self.client.post(
            self.url, {"days": []}, content_type="application/json", headers={"x-api-key": KEY}
        )
        self.assertEqual(res.status_code, 400)

    def test_a_reversed_range_is_400(self):
        self.assertEqual(self.sync([], start="2026-12-31", end="2026-01-01").status_code, 400)

    def test_an_absurd_range_is_refused(self):
        self.assertEqual(self.sync([], start="2020-01-01", end="2030-01-01").status_code, 400)

    #  막힌 응답은 403 이다 — `authentication_classes([])` 라 DRF 가 "어떻게
    #  인증하라" 를 적어줄 수 없어 401 대신 403 으로 내려간다. 크론이 부르는
    #  다른 자리들과 같은 규칙이다.

    def test_without_the_key_it_is_shut(self):
        res = self.client.post(
            f"{self.url}?from=2026-01-01&to=2026-12-31",
            {"days": []},
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 403)

    @override_settings(N8N_API_KEY="")
    def test_a_server_without_a_key_does_not_leave_it_open(self):
        self.assertEqual(self.sync([{"date": "2026-01-01", "name": "x"}]).status_code, 403)


class ListTests(AuthedTestCase):
    """읽기는 로그인한 사람 몫이다. 고치는 길은 여기에 없다."""

    def setUp(self):
        super().setUp()
        SpecialDay.objects.create(date=dt.date(2026, 9, 16), kind="holiday", name="추석")
        SpecialDay.objects.create(date=dt.date(2026, 9, 23), kind="term", name="추분")
        SpecialDay.objects.create(date=dt.date(2026, 10, 3), kind="holiday", name="개천절")

    def rows(self, query):
        return self.get(f"{reverse('special-day-list')}?{query}").json()

    def test_it_returns_the_days_in_the_window(self):
        rows = self.rows("from=2026-09-01&to=2026-09-30")
        self.assertEqual(
            rows,
            [
                {"date": "2026-09-16", "kind": "holiday", "name": "추석"},
                {"date": "2026-09-23", "kind": "term", "name": "추분"},
            ],
        )

    def test_a_missing_range_is_400(self):
        self.assertEqual(self.get(f"{reverse('special-day-list')}?from=2026-09-01").status_code, 400)

    def test_an_absurd_range_is_refused(self):
        self.assertEqual(self.rows.__self__.get(
            f"{reverse('special-day-list')}?from=2020-01-01&to=2026-12-31"
        ).status_code, 400)

    def test_it_needs_a_login(self):
        res = self.client.get(f"{reverse('special-day-list')}?from=2026-09-01&to=2026-09-30")
        self.assertEqual(res.status_code, 401)

    def test_there_is_no_way_to_change_it_from_here(self):
        url = f"{reverse('special-day-list')}?from=2026-09-01&to=2026-09-30"
        for method in (self.client.post, self.client.patch, self.client.delete, self.client.put):
            self.assertEqual(method(url, headers=self.auth).status_code, 405)


class MarkStyleTests(AuthedTestCase):
    """종류별 색. 사람마다 다르다 — 빨강이 잘 안 갈리는 눈이 있다."""

    def styles(self):
        return self.get(reverse("mark-style-list")).json()

    def by_kind(self, rows):
        return {row["kind"]: row for row in rows}

    def test_a_fresh_account_gets_the_defaults(self):
        rows = self.by_kind(self.styles())

        self.assertEqual(rows["holiday"]["color"], DEFAULT_COLOR[Kind.HOLIDAY])
        self.assertEqual(rows["term"]["color"], DEFAULT_COLOR[Kind.TERM])

    def test_every_kind_comes_back_even_with_nothing_saved(self):
        """받는 쪽이 '없으면 기본값' 규칙을 다시 적지 않아도 되도록."""
        self.assertEqual({row["kind"] for row in self.styles()}, set(Kind.values))
        self.assertEqual(MarkStyle.objects.count(), 0)

    def test_rows_carry_a_korean_label(self):
        self.assertEqual(self.by_kind(self.styles())["term"]["label"], "절기")

    def test_the_order_is_holiday_first(self):
        """한 날에 둘이 겹칠 때 달력이 고르는 순서이기도 하다."""
        self.assertEqual([row["kind"] for row in self.styles()], ["holiday", "term"])

    def test_changing_the_colour_sticks(self):
        res = self.patch(reverse("mark-style-detail", args=["holiday"]), {"color": "#7C3AED"})

        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.by_kind(res.json())["holiday"]["color"], "#7C3AED")
        self.assertEqual(self.by_kind(self.styles())["holiday"]["color"], "#7C3AED")

    def test_it_answers_with_the_whole_list(self):
        """웹이 들고 있는 것이 목록이라, 한 줄만 받으면 끼워 넣는 코드가 화면마다 생긴다."""
        rows = self.patch(reverse("mark-style-detail", args=["term"]), {"color": "#15803D"}).json()
        self.assertEqual({row["kind"] for row in rows}, set(Kind.values))

    def test_each_kind_keeps_its_own_colour(self):
        self.patch(reverse("mark-style-detail", args=["holiday"]), {"color": "#7C3AED"})
        rows = self.by_kind(self.styles())

        self.assertEqual(rows["holiday"]["color"], "#7C3AED")
        self.assertEqual(rows["term"]["color"], DEFAULT_COLOR[Kind.TERM], "절기까지 따라 바뀌었다")

    def test_a_colour_outside_the_palette_is_refused(self):
        res = self.patch(reverse("mark-style-detail", args=["holiday"]), {"color": "#FF00FF"})
        self.assertEqual(res.status_code, 400)

    def test_an_empty_body_is_refused(self):
        self.assertEqual(
            self.patch(reverse("mark-style-detail", args=["holiday"]), {}).status_code, 400
        )

    def test_an_unknown_kind_is_400(self):
        res = self.patch(reverse("mark-style-detail", args=["memorial"]), {"color": "#15803D"})
        self.assertEqual(res.status_code, 400, "빼낸 종류가 아직 받아들여진다")

    def test_one_persons_choice_does_not_reach_another(self):
        other = User.objects.create_user("nam", password="pw-strong-1234")
        self.patch(reverse("mark-style-detail", args=["holiday"]), {"color": "#15803D"})

        rows = {row["kind"]: row for row in styles_for(other)}
        self.assertEqual(rows["holiday"]["color"], DEFAULT_COLOR[Kind.HOLIDAY])

    def test_it_needs_a_login(self):
        self.assertEqual(self.client.get(reverse("mark-style-list")).status_code, 401)


class PaletteTests(AuthedTestCase):
    """
    고를 수 있는 색. 흰 바탕에 놓이는 **작은 글씨**라, 공간 칩(배경)과 기준이 다르다.
    """

    def test_it_serves_colour_and_name(self):
        rows = self.get(reverse("special-day-palette")).json()

        self.assertEqual(rows, PALETTE)
        self.assertTrue(all({"color", "name"} <= row.keys() for row in rows))

    def test_names_exist_because_a_swatch_alone_says_nothing_aloud(self):
        self.assertTrue(all(row["name"].strip() for row in PALETTE))

    def test_every_colour_is_readable_on_white(self):
        """
        본문 크기 기준(4.5:1)을 넘겨야 한다. 밝은 색을 넣으면 9px 짜리 절기
        이름이 종이에 묻어 사라진다.
        """
        for color in COLORS:
            with self.subTest(color=color):
                self.assertGreaterEqual(contrast_on_white(color), 4.5)

    def test_the_defaults_are_all_in_the_palette(self):
        """기본값이 팔레트 밖이면 설정 화면에서 지금 색이 안 골라져 보인다."""
        for kind, color in DEFAULT_COLOR.items():
            with self.subTest(kind=kind):
                self.assertIn(color, COLORS)

    def test_no_two_colours_are_the_same(self):
        self.assertEqual(len(COLORS), len(set(COLORS)))

    def test_it_needs_a_login(self):
        self.assertEqual(self.client.get(reverse("special-day-palette")).status_code, 401)


def contrast_on_white(hex_color: str) -> float:
    """WCAG 명암비. 흰 바탕 기준이라 밝은 쪽이 늘 흰색(1.0)이다."""

    def channel(value: int) -> float:
        srgb = value / 255
        return srgb / 12.92 if srgb <= 0.03928 else ((srgb + 0.055) / 1.055) ** 2.4

    raw = hex_color.lstrip("#")
    r, g, b = (channel(int(raw[i : i + 2], 16)) for i in (0, 2, 4))
    luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return 1.05 / (luminance + 0.05)
