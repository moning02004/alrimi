import datetime as dt

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.test import TestCase
from django.urls import reverse

from .models import Invite

User = get_user_model()

PASSWORD = "pw-strong-1234"


class UserManagementTestCase(TestCase):
    def setUp(self):
        self.root = User.objects.create_user(
            "root", password=PASSWORD, is_staff=True, is_superuser=True
        )
        self.staff = User.objects.create_user("staff", password=PASSWORD, is_staff=True)
        self.plain = User.objects.create_user("plain", password=PASSWORD)

    def auth(self, username, password=PASSWORD):
        res = self.client.post(
            reverse("obtain-token"),
            {"username": username, "password": password},
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        return {"authorization": f"Bearer {res.json()['access_token']}"}

    def add(self, as_user, username="newbie", name="새 사람"):
        return self.client.post(
            reverse("users"),
            {"username": username, "name": name},
            content_type="application/json",
            headers=self.auth(as_user),
        )


class AddUserTests(UserManagementTestCase):
    def test_관리자가_추가하면_초대_링크를_한_번_준다(self):
        res = self.add("staff")

        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["name"], "새 사람")
        self.assertTrue(res.json()["invite_pending"])
        self.assertFalse(res.json()["has_password"])

        token = res.json()["invite"]["token"]
        user = User.objects.get(username="newbie")
        self.assertEqual(Invite.objects.get(user=user).token, token)
        # 링크를 쓰기 전에는 어떤 비밀번호로도 못 들어온다 — 아이디를 아는 사람도 마찬가지다
        self.assertFalse(user.has_usable_password())
        # 목록에는 열쇠가 안 실린다 — 보여줄 기회는 만든 그 순간뿐이다
        listed = self.client.get(reverse("users"), headers=self.auth("staff")).json()
        self.assertNotIn("invite", listed[0])
        # 추가한 사람은 늘 일반 사용자로 시작한다
        self.assertFalse(user.is_staff or user.is_superuser)

    def test_목록이_초대_상태를_말해준다(self):
        self.add("staff")
        listed = self.client.get(reverse("users"), headers=self.auth("staff")).json()
        rows = {u["username"]: u for u in listed}

        self.assertTrue(rows["newbie"]["invite_pending"])
        self.assertFalse(rows["newbie"]["has_password"])
        # 이미 들어와 있는 사람은 둘 다 반대다
        self.assertFalse(rows["plain"]["invite_pending"])
        self.assertTrue(rows["plain"]["has_password"])

    def test_최고_관리자도_추가할_수_있다(self):
        self.assertEqual(self.add("root").status_code, 201)

    def test_일반_사용자는_추가도_목록도_못_본다(self):
        self.assertEqual(self.add("plain").status_code, 403)
        res = self.client.get(reverse("users"), headers=self.auth("plain"))
        self.assertEqual(res.status_code, 403)

    def test_추가하면서_권한이나_비밀번호를_정할_수_없다(self):
        """관리자가 추가하면서 관리자를 만들 수 있으면 "관리자는 추가만" 이 뚫린다."""
        self.client.post(
            reverse("users"),
            {"username": "sneaky", "name": "몰래", "is_staff": True, "is_superuser": True, "password": "x"},
            content_type="application/json",
            headers=self.auth("staff"),
        )
        user = User.objects.get(username="sneaky")
        self.assertFalse(user.is_staff or user.is_superuser)
        self.assertFalse(user.check_password("x"))
        self.assertFalse(user.has_usable_password())

    def test_이름과_아이디가_모두_있어야_한다(self):
        res = self.client.post(
            reverse("users"),
            {"username": "noname", "name": "  "},
            content_type="application/json",
            headers=self.auth("staff"),
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("name", res.json())

    def test_대소문자만_다른_아이디는_같은_아이디다(self):
        res = self.add("staff", username="STAFF")
        self.assertEqual(res.status_code, 400)
        self.assertIn("username", res.json())


class RoleAndDeleteTests(UserManagementTestCase):
    def patch(self, as_user, target, body):
        return self.client.patch(
            reverse("user-detail", args=[target.pk]),
            body,
            content_type="application/json",
            headers=self.auth(as_user),
        )

    def delete(self, as_user, target):
        return self.client.delete(reverse("user-detail", args=[target.pk]), headers=self.auth(as_user))

    def test_관리자는_권한을_주지도_지우지도_못한다(self):
        self.assertEqual(self.patch("staff", self.plain, {"is_staff": True}).status_code, 403)
        self.assertEqual(self.delete("staff", self.plain).status_code, 403)
        self.assertTrue(User.objects.filter(pk=self.plain.pk).exists())

    def test_최고_관리자는_관리자_권한을_준다(self):
        res = self.patch("root", self.plain, {"is_staff": True})

        self.assertEqual(res.status_code, 200)
        self.plain.refresh_from_db()
        self.assertTrue(self.plain.is_staff)
        self.assertFalse(self.plain.is_superuser)

    def test_최고_관리자를_켜면_관리자도_켜지고_관리자를_끄면_함께_꺼진다(self):
        self.patch("root", self.plain, {"is_superuser": True})
        self.plain.refresh_from_db()
        self.assertTrue(self.plain.is_staff and self.plain.is_superuser)

        self.patch("root", self.plain, {"is_staff": False})
        self.plain.refresh_from_db()
        self.assertFalse(self.plain.is_staff or self.plain.is_superuser)

    def test_자기_권한은_못_바꾸고_자기_계정은_못_지운다(self):
        """마지막 최고 관리자가 스스로 내려오면 권한을 되돌려줄 사람이 없다."""
        self.assertEqual(self.patch("root", self.root, {"is_superuser": False}).status_code, 400)
        self.assertEqual(self.delete("root", self.root).status_code, 400)
        self.root.refresh_from_db()
        self.assertTrue(self.root.is_superuser)

    def test_최고_관리자는_지울_수_있고_일정도_함께_지워진다(self):
        from zones.models import Zone

        Zone.objects.create(owner=self.plain, name="우리집")

        res = self.delete("root", self.plain)

        self.assertEqual(res.status_code, 204)
        self.assertFalse(User.objects.filter(pk=self.plain.pk).exists())
        self.assertFalse(Zone.objects.filter(owner_id=self.plain.pk).exists())


class InviteTests(UserManagementTestCase):
    """링크를 누르고 비밀번호를 정하면 그 자리에서 로그인된다."""

    def setUp(self):
        super().setUp()
        self.token = self.add("staff").json()["invite"]["token"]

    def url(self, token=None):
        return reverse("invite", args=[token or self.token])

    def accept(self, password, token=None):
        return self.client.post(
            self.url(token), {"password": password}, content_type="application/json"
        )

    def test_링크는_누구를_맞이하는지_알려준다(self):
        res = self.client.get(self.url())

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"name": "새 사람", "username": "newbie"})

    def test_비밀번호를_정하면_바로_로그인된다(self):
        res = self.accept("새-비밀번호-5678")

        self.assertEqual(res.status_code, 200)
        user = User.objects.get(username="newbie")
        self.assertTrue(user.check_password("새-비밀번호-5678"))
        self.assertIsNotNone(user.last_login)

        # 받은 토큰으로 곧바로 앱을 쓴다 — 들어와서 또 바꾸라는 화면이 없다
        headers = {"authorization": f"Bearer {res.json()['access_token']}"}
        self.assertEqual(self.client.get(reverse("zone-list"), headers=headers).status_code, 200)
        # 새로고침해도 이어지도록 refresh 쿠키도 함께 받는다
        self.assertTrue(res.cookies[settings.REFRESH_COOKIE["name"]].value)
        self.assertEqual(self.client.post(reverse("refresh-token")).status_code, 200)

    def test_쓴_링크는_다시_열리지_않는다(self):
        self.accept("새-비밀번호-5678")

        self.assertFalse(Invite.objects.exists())
        self.assertEqual(self.client.get(self.url()).status_code, 404)
        # 두 번째 사람이 같은 링크로 비밀번호를 바꿔칠 수 없다
        self.assertEqual(self.accept("가로채기-9999").status_code, 404)
        self.assertTrue(User.objects.get(username="newbie").check_password("새-비밀번호-5678"))

    def test_기한이_지난_링크는_열리지_않는다(self):
        Invite.objects.update(expires_at=timezone.now() - dt.timedelta(seconds=1))

        self.assertEqual(self.client.get(self.url()).status_code, 404)
        self.assertEqual(self.accept("새-비밀번호-5678").status_code, 404)

    def test_없는_링크도_있었는지_알려주지_않는다(self):
        res = self.client.get(self.url("아무거나"))
        self.assertEqual(res.status_code, 404)
        self.assertIn("만료", str(res.json()))

    def test_너무_쉬운_비밀번호는_거절한다(self):
        res = self.accept("1234")

        self.assertEqual(res.status_code, 400)
        self.assertTrue(Invite.objects.exists())

    def test_틀린_링크를_잇달아_두드리면_잠긴다(self):
        from .models import LoginThrottle

        for _ in range(LoginThrottle.MAX_FAILURES):
            self.client.get(self.url("아무거나"), HTTP_X_FORWARDED_FOR="9.9.9.9")

        blocked = self.client.get(self.url(), HTTP_X_FORWARDED_FOR="9.9.9.9")
        self.assertEqual(blocked.status_code, 429)


class LoginThrottleTests(UserManagementTestCase):
    """아이디를 아는 사람이 비밀번호를 찍어 맞히는 것을 막는다."""

    def login(self, password, ip="1.2.3.4"):
        return self.client.post(
            reverse("obtain-token"),
            {"username": "plain", "password": password},
            content_type="application/json",
            HTTP_X_FORWARDED_FOR=ip,
        )

    def test_다섯_번_틀리면_잠기고_맞는_비밀번호도_막힌다(self):
        from .models import LoginThrottle

        for _ in range(LoginThrottle.MAX_FAILURES):
            self.assertEqual(self.login("틀린-비밀번호").status_code, 400)

        locked = self.login(PASSWORD)
        self.assertEqual(locked.status_code, 429)
        self.assertIn("여러 번", str(locked.json()))

    def test_잠긴_뒤_시간이_지나면_다시_된다(self):
        from .models import LoginThrottle

        for _ in range(LoginThrottle.MAX_FAILURES):
            self.login("틀린-비밀번호")

        # 잠금이 끝난 것으로 옮긴다 — 기다리지 않고 경계만 확인한다
        LoginThrottle.objects.update(locked_until=timezone.now() - dt.timedelta(seconds=1))
        self.assertEqual(self.login(PASSWORD).status_code, 200)

    def test_들어오면_센_것이_지워진다(self):
        from .models import LoginThrottle

        self.login("틀린-비밀번호")
        self.assertEqual(self.login(PASSWORD).status_code, 200)
        self.assertFalse(LoginThrottle.objects.exists())

    def test_다른_아이디로_바꿔도_같은_IP_면_막힌다(self):
        from .models import LoginThrottle

        for _ in range(LoginThrottle.MAX_FAILURES):
            self.login("틀린-비밀번호")

        res = self.client.post(
            reverse("obtain-token"),
            {"username": "staff", "password": PASSWORD},
            content_type="application/json",
            HTTP_X_FORWARDED_FOR="1.2.3.4",
        )
        self.assertEqual(res.status_code, 429)


class ReissueInviteTests(UserManagementTestCase):
    """비밀번호를 잊은 사람에게 최고 관리자가 새 링크를 준다."""

    def reissue(self, as_user, target):
        return self.client.post(reverse("user-invite", args=[target.id]), headers=self.auth(as_user))

    def accept(self, token, password):
        return self.client.post(
            reverse("invite", args=[token]), {"password": password}, content_type="application/json"
        )

    def test_최고_관리자만_만든다(self):
        plain = User.objects.get(username="plain")

        self.assertEqual(self.reissue("staff", plain).status_code, 403)

        res = self.reissue("root", plain)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Invite.objects.get(user=plain).token, res.json()["token"])

    def test_링크를_만들어도_쓰던_비밀번호는_그대로다(self):
        """보내고 보니 필요 없었을 때 멀쩡한 계정을 잠가버리지 않는다."""
        plain = User.objects.get(username="plain")

        self.reissue("root", plain)

        self.assertEqual(self.auth("plain")["authorization"][:7], "Bearer ")

    def test_새로_만들면_앞의_링크는_죽는다(self):
        plain = User.objects.get(username="plain")
        first = self.reissue("root", plain).json()["token"]

        second = self.reissue("root", plain).json()["token"]

        self.assertNotEqual(first, second)
        self.assertEqual(self.accept(first, "새-비밀번호-5678").status_code, 404)
        self.assertEqual(self.accept(second, "새-비밀번호-5678").status_code, 200)

    def test_자기_자신은_여기서_만들지_않는다(self):
        root = User.objects.get(username="root")
        self.assertEqual(self.reissue("root", root).status_code, 400)

    def test_새_비밀번호를_정하는_순간_살아_있던_로그인이_끊긴다(self):
        plain = User.objects.get(username="plain")
        login = self.client.post(
            reverse("obtain-token"),
            {"username": "plain", "password": PASSWORD},
            content_type="application/json",
        )
        cookie = login.cookies[settings.REFRESH_COOKIE["name"]].value
        token = self.reissue("root", plain).json()["token"]

        self.assertEqual(self.accept(token, "새-비밀번호-5678").status_code, 200)

        self.client.cookies[settings.REFRESH_COOKIE["name"]] = cookie
        again = self.client.post(reverse("refresh-token"))
        self.assertEqual(again.status_code, 401)
