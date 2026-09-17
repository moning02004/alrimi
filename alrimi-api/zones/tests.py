import datetime as dt

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from notices.filters import upcoming_end
from notices.models import Event

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

        Event.objects.create(zone=zone, event_date=self.today, title="오늘")
        Event.objects.create(zone=zone, event_date=beyond, title="한참 뒤")
        Event.objects.create(zone=zone, event_date=self.today - dt.timedelta(days=1), title="어제")

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


class SharingTests(TestCase):
    """
    사람마다 한 번 정하는 공유. 주인이 함께 보는 사람을 두고, 공간은 `shared` 로 켜고 끈다.
    보는 사람은 **보기와 알림만** 함께한다 — 일정도 공간도 고치지 못한다.
    """

    def setUp(self):
        self.owner = User.objects.create_user("mom", password="pw-strong-1234", name="엄마")
        self.viewer = User.objects.create_user("dad", password="pw-strong-1234", name="아빠")
        self.stranger = User.objects.create_user("nam", password="pw-strong-1234")
        self.zone = Zone.objects.create(owner=self.owner, name="어린이집", shared=True)
        self.work = Zone.objects.create(owner=self.owner, name="회사")
        self.today = timezone.localdate()
        self.event = Event.objects.create(
            zone=self.zone, event_date=self.today + dt.timedelta(days=1), title="체육복"
        )
        self.private = Event.objects.create(
            zone=self.work, event_date=self.today + dt.timedelta(days=1), title="회의"
        )

    def login(self, username):
        res = self.client.post(
            reverse("obtain-token"),
            {"username": username, "password": "pw-strong-1234"},
            content_type="application/json",
        )
        return {"authorization": f"Bearer {res.json()['access_token']}"}

    def share(self):
        from .models import Sharing

        Sharing.objects.create(owner=self.owner, viewer=self.viewer)

    def post(self, url, body, as_user):
        return self.client.post(url, body, content_type="application/json", headers=self.login(as_user))

    # ── 함께 보는 사람 ─────────────────────────────────────────

    def test_찾아서_고른_사람을_더한다(self):
        res = self.post(reverse("sharing"), {"user_id": self.viewer.id}, "mom")

        self.assertEqual(res.status_code, 201)
        self.assertEqual([row["username"] for row in res.json()], ["dad"])

    def test_더할_수_없는_사람은_까닭을_말한다(self):
        self.share()
        for user_id, message in (
            (999999, "그런 사람이 없어요."),
            (self.owner.id, "나 자신은 더할 수 없어요."),
            (self.viewer.id, "이미 함께 보고 있는 사람이에요."),
        ):
            with self.subTest(user_id=user_id):
                res = self.post(reverse("sharing"), {"user_id": user_id}, "mom")
                self.assertEqual(res.status_code, 400)
                self.assertEqual(res.json()["user_id"], [message])

    def test_받는_쪽도_누가_보여주는지_보고_그만_볼_수_있다(self):
        self.share()
        auth = self.login("dad")

        received = self.client.get(reverse("sharing-received"), headers=auth).json()
        self.assertEqual([row["username"] for row in received], ["mom"])

        url = reverse("sharing-received-detail", args=[self.owner.id])
        self.assertEqual(self.client.delete(url, headers=auth).status_code, 204)
        self.assertEqual(self.client.get(reverse("zone-list"), headers=auth).json(), [])

    def test_주인은_보여주기를_그만둘_수_있다(self):
        self.share()
        url = reverse("sharing-detail", args=[self.viewer.id])
        self.assertEqual(self.client.delete(url, headers=self.login("mom")).status_code, 204)
        self.assertEqual(self.client.delete(url, headers=self.login("mom")).status_code, 400)

    # ── 보기 ────────────────────────────────────────────────────

    def test_함께_보기를_켠_공간만_보인다(self):
        self.share()
        rows = self.client.get(reverse("zone-list"), headers=self.login("dad")).json()

        self.assertEqual([(r["name"], r["role"], r["owner_name"]) for r in rows], [("어린이집", "member", "엄마")])

    def test_함께_보기를_끄면_사라진다(self):
        self.share()
        res = self.client.patch(
            reverse("zone-detail", args=[self.zone.id]), {"shared": False},
            content_type="application/json", headers=self.login("mom"),
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.client.get(reverse("zone-list"), headers=self.login("dad")).json(), [])

    def test_사람을_더하지_않으면_켜도_안_보인다(self):
        self.assertEqual(self.client.get(reverse("zone-list"), headers=self.login("dad")).json(), [])

    def test_보는_사람은_공유_공간_일정만_본다(self):
        self.share()
        auth = self.login("dad")
        day = str(self.event.event_date)

        listed = self.client.get(f"/events?from={day}&to={day}", headers=auth).json()
        self.assertEqual([(row["title"], row["can_edit"]) for row in listed], [("체육복", False)])

        calendar = self.client.get(f"/calendar?from={day}&to={day}", headers=auth).json()
        self.assertEqual([row["id"] for row in calendar], [self.event.id])

        self.assertEqual(
            self.client.get(reverse("event-detail", args=[self.private.id]), headers=auth).status_code, 404
        )

    def test_사람으로_좁히면_그_사람의_공유_공간_일정만_나온다(self):
        self.share()
        other = Zone.objects.create(owner=self.viewer, name="아빠 회사")
        Event.objects.create(zone=other, event_date=self.event.event_date, title="아빠 회의")
        auth = self.login("dad")
        day = str(self.event.event_date)

        rows = self.client.get(f"/events?from={day}&to={day}&owner={self.owner.id}", headers=auth).json()
        self.assertEqual([row["title"] for row in rows], ["체육복"])

        calendar = self.client.get(f"/calendar?from={day}&to={day}&owner={self.owner.id}", headers=auth).json()
        self.assertEqual([row["id"] for row in calendar], [self.event.id])

    def test_보는_사람은_공간도_일정도_고치지_못한다(self):
        self.share()
        auth = self.login("dad")

        zone_url = reverse("zone-detail", args=[self.zone.id])
        self.assertEqual(
            self.client.patch(zone_url, {"name": "x"}, content_type="application/json", headers=auth).status_code,
            403,
        )
        event_url = reverse("event-detail", args=[self.event.id])
        self.assertEqual(
            self.client.patch(event_url, {"completed": True}, content_type="application/json", headers=auth).status_code,
            403,
        )
        self.assertEqual(self.client.delete(event_url, headers=auth).status_code, 403)
        res = self.post(
            reverse("event-list"),
            {"zone": self.zone.id, "event_date": str(self.today), "title": "몰래", "alerts": []},
            "dad",
        )
        self.assertEqual(res.status_code, 400)

    # ── 함께 고치기 ─────────────────────────────────────────────

    def allow_edit(self):
        Zone.objects.filter(pk=self.zone.pk).update(viewers_can_edit=True)

    def test_주인이_허락하면_보는_사람도_일정을_넣고_고치고_지운다(self):
        self.share()
        self.allow_edit()
        auth = self.login("dad")

        zones = self.client.get(reverse("zone-list"), headers=auth).json()
        self.assertTrue(zones[0]["writable"])

        created = self.post(
            reverse("event-list"),
            {"zone": self.zone.id, "event_date": str(self.today), "title": "준비물", "alerts": []},
            "dad",
        )
        self.assertEqual(created.status_code, 201)
        self.assertTrue(created.json()["can_edit"])

        url = reverse("event-detail", args=[self.event.id])
        res = self.client.patch(url, {"title": "운동화"}, content_type="application/json", headers=auth)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.client.delete(url, headers=auth).status_code, 204)

        # 주인 목록에도 그대로 있다 — 같은 공간이다
        mine = self.client.get(f"/events?date={self.today}", headers=self.login("mom")).json()
        self.assertEqual([row["title"] for row in mine], ["준비물"])

    def test_허락해도_공간_설정은_주인만_바꾼다(self):
        self.share()
        self.allow_edit()
        res = self.client.patch(
            reverse("zone-detail", args=[self.zone.id]), {"viewers_can_edit": False},
            content_type="application/json", headers=self.login("dad"),
        )
        self.assertEqual(res.status_code, 403)

    def test_허락해도_내_공간으로_빼가지는_못한다(self):
        self.share()
        self.allow_edit()
        own = Zone.objects.create(owner=self.viewer, name="아빠 회사")
        res = self.client.patch(
            reverse("event-detail", args=[self.event.id]), {"zone": own.id},
            content_type="application/json", headers=self.login("dad"),
        )
        self.assertEqual(res.status_code, 400)

    def test_함께_보기를_끄면_허락도_소용없다(self):
        self.share()
        Zone.objects.filter(pk=self.zone.pk).update(viewers_can_edit=True, shared=False)
        res = self.client.patch(
            reverse("event-detail", args=[self.event.id]), {"title": "x"},
            content_type="application/json", headers=self.login("dad"),
        )
        self.assertEqual(res.status_code, 404)

    # ── 알림 ────────────────────────────────────────────────────

    @override_settings(N8N_API_KEY="k")
    def test_매시_알림은_공유_공간만_보는_사람에게도_간다(self):
        from notices.models import EventAlert

        self.share()
        for event in (self.event, self.private):
            event.sync_alerts(["D-1 20:00"])
        EventAlert.objects.update(due_at=timezone.now() - dt.timedelta(minutes=5))

        body = self.client.get("/events/alerts", headers={"x-api-key": "k"}).json()

        topics = sorted((row["topic"], row["title"]) for row in body["data"])
        self.assertEqual(
            topics,
            sorted([
                (self.owner.ntfy_topic, "[어린이집] 일정 1건"),
                (self.owner.ntfy_topic, "[회사] 일정 1건"),
                (self.viewer.ntfy_topic, "[어린이집] 일정 1건"),
            ]),
        )
        self.assertEqual(len(body["ids"]), 2)

    @override_settings(N8N_API_KEY="k")
    def test_주간_정리도_보는_사람에게_간다(self):
        from notices.views import next_week

        self.share()
        start, _ = next_week()
        Event.objects.filter(pk=self.event.pk).update(event_date=start, end_date=start)

        rows = self.client.get("/events/weekly", headers={"x-api-key": "k"}).json()
        self.assertEqual(
            sorted(row["topic"] for row in rows),
            sorted([self.owner.ntfy_topic, self.viewer.ntfy_topic]),
        )

    def test_손으로_보내기도_보는_사람에게_간다(self):
        from unittest.mock import patch

        self.share()
        self.event.sync_alerts(["D-1 20:00"])
        alert = self.event.alerts.get()

        with patch("notices.ntfy.publish") as publish:
            res = self.client.post(
                reverse("alert-send", args=[self.event.id, alert.id]), headers=self.login("mom")
            )

        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            sorted(call.args[0] for call in publish.call_args_list),
            sorted([self.owner.ntfy_topic, self.viewer.ntfy_topic]),
        )


class UserSearchTests(TestCase):
    def setUp(self):
        self.me = User.objects.create_user("mom", password="pw-strong-1234", name="엄마")
        User.objects.create_user("dad", password="pw-strong-1234", name="아빠")
        User.objects.create_user("granny", password="pw-strong-1234", name="할머니")
        User.objects.create_user("gone", password="pw-strong-1234", name="아무개", is_active=False)
        res = self.client.post(
            reverse("obtain-token"),
            {"username": "mom", "password": "pw-strong-1234"},
            content_type="application/json",
        )
        self.auth = {"authorization": f"Bearer {res.json()['access_token']}"}

    def search(self, q):
        from urllib.parse import quote

        return self.client.get(f"/users/search?q={quote(q)}", headers=self.auth)

    def test_이름이나_아이디로_찾는다(self):
        self.assertEqual([u["username"] for u in self.search("아빠").json()], ["dad"])
        self.assertEqual([u["username"] for u in self.search("gran").json()], ["granny"])

    def test_나와_비활성_계정은_안_나오고_빈_말로는_아무도_없다(self):
        self.assertEqual(self.search("엄마").json(), [])
        self.assertEqual(self.search("아무").json(), [])
        self.assertEqual(self.search("").json(), [])

    def test_찾기는_이름과_아이디만_준다(self):
        self.assertEqual(set(self.search("아빠").json()[0]), {"id", "username", "name"})

    def test_만들면서_함께_보기를_켠다(self):
        res = self.client.post(
            reverse("zone-list"), {"name": "어린이집", "shared": True},
            content_type="application/json", headers=self.auth,
        )
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.json()["shared"])
        self.assertIn("upcoming_count", res.json())
