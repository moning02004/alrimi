import datetime as dt

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from notices.filters import upcoming_end
from notices.models import Notice

from .models import Zone

User = get_user_model()


class ZoneApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("hoon", password="pw-strong-1234")
        self.other = User.objects.create_user("nam", password="pw-strong-1234")
        self.today = timezone.localdate()

        res = self.client.post(
            reverse("obtain-token"),
            {"username": "hoon", "password": "pw-strong-1234"},
            content_type="application/json",
        )
        self.auth = {"authorization": f"Bearer {res.json()['access_token']}"}

    def test_colors_are_assigned_from_the_palette_without_repeating(self):
        from zones.palette import PALETTE

        for name in ("우리집", "어린이집", "회사"):
            self.client.post(
                reverse("zone-list"), {"name": name},
                content_type="application/json", headers=self.auth,
            )
        colors = [z["color"] for z in self.client.get(reverse("zone-list"), headers=self.auth).json()]
        self.assertEqual(colors, PALETTE[:3])

    def test_color_cannot_be_set_by_the_client(self):
        res = self.client.post(
            reverse("zone-list"), {"name": "우리집", "color": "#000000"},
            content_type="application/json", headers=self.auth,
        )
        self.assertNotEqual(res.json()["color"], "#000000")

    def test_each_owner_starts_at_the_top_of_the_palette(self):
        from zones.palette import PALETTE

        mine = Zone.objects.create(owner=self.user, name="우리집")
        theirs = Zone.objects.create(owner=self.other, name="남의집")
        self.assertEqual(mine.color, PALETTE[0])
        self.assertEqual(theirs.color, PALETTE[0])

    def test_create_assigns_the_owner(self):
        res = self.client.post(
            reverse("zone-list"), {"name": "우리집"}, content_type="application/json", headers=self.auth
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(Zone.objects.get(pk=res.json()["id"]).owner, self.user)

    def test_duplicate_name_for_the_same_owner_is_rejected(self):
        Zone.objects.create(owner=self.user, name="우리집")
        res = self.client.post(
            reverse("zone-list"), {"name": "우리집"}, content_type="application/json", headers=self.auth
        )
        self.assertEqual(res.status_code, 400)

    def test_list_only_shows_own_zones(self):
        Zone.objects.create(owner=self.user, name="우리집")
        Zone.objects.create(owner=self.other, name="남의집")

        names = [z["name"] for z in self.client.get(reverse("zone-list"), headers=self.auth).json()]
        self.assertEqual(names, ["우리집"])

    def test_upcoming_count_includes_later(self):
        zone = Zone.objects.create(owner=self.user, name="우리집")
        beyond = upcoming_end(self.today) + dt.timedelta(days=30)

        Notice.objects.create(zone=zone, event_date=self.today, title="오늘")
        Notice.objects.create(zone=zone, event_date=beyond, title="한참 뒤")
        Notice.objects.create(zone=zone, event_date=self.today - dt.timedelta(days=1), title="어제")

        row = self.client.get(reverse("zone-list"), headers=self.auth).json()[0]
        self.assertEqual(row["upcoming_count"], 2)
        self.assertEqual(row["past_count"], 1)

    def test_list_requires_auth(self):
        self.assertEqual(self.client.get(reverse("zone-list")).status_code, 401)


class ZoneColorTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("hoon", password="pw-strong-1234")
        self.other = User.objects.create_user("nam", password="pw-strong-1234")
        self.zone = Zone.objects.create(owner=self.user, name="우리집")

        res = self.client.post(
            reverse("obtain-token"),
            {"username": "hoon", "password": "pw-strong-1234"},
            content_type="application/json",
        )
        self.auth = {"authorization": f"Bearer {res.json()['access_token']}"}

    def patch(self, color):
        return self.client.patch(
            reverse("zone-detail", args=[self.zone.id]),
            {"color": color},
            content_type="application/json",
            headers=self.auth,
        )








    def test_palette_is_offered_to_the_client(self):
        from zones.palette import PALETTE

        res = self.client.get(reverse("zone-palette"), headers=self.auth)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["colors"], PALETTE)

    def test_palette_route_is_not_swallowed_by_the_detail_route(self):
        self.assertEqual(self.client.get(reverse("zone-palette"), headers=self.auth).status_code, 200)

    def test_a_palette_colour_can_be_chosen(self):
        from zones.palette import PALETTE

        res = self.patch(PALETTE[3])
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["color"], PALETTE[3])

    def test_lowercase_is_accepted(self):
        from zones.palette import PALETTE

        self.assertEqual(self.patch(PALETTE[2].lower()).json()["color"], PALETTE[2])

    def test_a_colour_outside_the_palette_is_refused(self):
        """흰 글씨를 얹는 칩 배경이라 아무 색이나 받으면 글씨가 안 읽힌다."""
        for bad in ("#FFFFFF", "#123456", "red", ""):
            self.assertEqual(self.patch(bad).status_code, 400, msg=bad)

    def test_two_zones_may_share_a_colour_if_the_owner_wants(self):
        from zones.palette import PALETTE

        other = Zone.objects.create(owner=self.user, name="어린이집")
        self.patch(PALETTE[0])
        res = self.client.patch(
            reverse("zone-detail", args=[other.id]),
            {"color": PALETTE[0]},
            content_type="application/json",
            headers=self.auth,
        )
        self.assertEqual(res.status_code, 200)

    def test_another_owners_zone_cannot_be_recoloured(self):
        stranger = Zone.objects.create(owner=self.other, name="남의집")
        res = self.client.patch(
            reverse("zone-detail", args=[stranger.id]),
            {"color": "#1D4ED8"},
            content_type="application/json",
            headers=self.auth,
        )
        self.assertEqual(res.status_code, 404)

    def test_palette_survives_colour_blindness(self):
        """
        색상만 벌려 놓는 것으로는 부족하다. 적록색약에서는 빨강·주황·갈색·초록이
        한데 뭉쳐서, 색상환에서 아무리 떨어뜨려도 같은 색이 된다.
        이전 팔레트가 제2색맹에서 ΔE00 2.0 이었던 것이 그래서다.
        """
        from zones.cvd import closest_pair
        from zones.palette import PALETTE

        distance, a, b, kind = closest_pair(PALETTE)
        self.assertGreaterEqual(distance, 12.0, f"{kind}에서 {a} 와 {b} 가 너무 닮았다 ({distance:.1f})")

    def test_the_first_colours_are_the_furthest_apart(self):
        """
        공간을 두세 개만 쓰는 사람이 대부분이다. 앞쪽 색이 서로 가까우면
        대다수가 구분 안 되는 조합을 받는다.
        """
        from zones.cvd import closest_pair
        from zones.palette import PALETTE

        for count, floor in ((2, 40.0), (3, 25.0), (4, 17.0)):
            distance = closest_pair(PALETTE[:count])[0]
            self.assertGreaterEqual(distance, floor, f"앞 {count}색이 너무 가깝다 ({distance:.1f})")

    def test_the_old_palette_would_fail_that_check(self):
        """검사가 실제로 무언가를 잡는지 확인한다."""
        from zones.cvd import closest_pair

        old = ["#2F7A63", "#0E7490", "#1D4ED8", "#7E22CE", "#BE185D", "#B91C1C", "#B45309", "#4D7C0F"]
        self.assertLess(closest_pair(old)[0], 12.0)

    def test_every_colour_is_visible_as_a_dot_on_a_white_card(self):
        """목록 카드의 3px 막대와 달력 점은 흰 배경 위에 놓인다."""
        from zones.cvd import contrast
        from zones.palette import PALETTE

        for color in PALETTE:
            self.assertGreaterEqual(contrast(color, "#FFFFFF"), 3.0, msg=color)

    def test_every_colour_can_carry_readable_text(self):
        """
        칩 배경으로도 쓴다. 명도 축을 살리려고 밝은 색까지 넣었으므로
        흰 글씨 하나로는 안 되고, 웹이 둘 중 대비가 큰 쪽을 골라 얹는다.
        """
        from zones.cvd import contrast
        from zones.palette import PALETTE

        for color in PALETTE:
            best = max(contrast(color, "#FFFFFF"), contrast(color, "#16283C"))
            self.assertGreaterEqual(best, 4.5, msg=color)
