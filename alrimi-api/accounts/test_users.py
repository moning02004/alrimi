from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from .models import INITIAL_PASSWORD

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
    def test_관리자는_추가할_수_있고_비밀번호는_0000_이다(self):
        res = self.add("staff")

        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["name"], "새 사람")
        self.assertTrue(res.json()["must_change_password"])
        user = User.objects.get(username="newbie")
        self.assertTrue(user.check_password(INITIAL_PASSWORD))
        # 추가한 사람은 늘 일반 사용자로 시작한다
        self.assertFalse(user.is_staff or user.is_superuser)

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
        self.assertTrue(user.check_password(INITIAL_PASSWORD))

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


class FirstLoginTests(UserManagementTestCase):
    def setUp(self):
        super().setUp()
        self.add("staff")
        self.newbie = self.auth("newbie", INITIAL_PASSWORD)

    def change(self, current, new, headers=None):
        return self.client.post(
            reverse("change-password"),
            {"current_password": current, "new_password": new},
            content_type="application/json",
            headers=headers or self.newbie,
        )

    def test_바꾸기_전에는_내_정보와_비밀번호_변경_말고는_막힌다(self):
        me = self.client.get(reverse("me"), headers=self.newbie)
        self.assertEqual(me.status_code, 200)
        self.assertTrue(me.json()["must_change_password"])

        blocked = self.client.get(reverse("zone-list"), headers=self.newbie)
        # 401 이 아니다 — 웹은 401 을 받으면 로그아웃시켜 바꾸러 갈 수도 없게 된다
        self.assertEqual(blocked.status_code, 403)

    def test_0000_으로는_바꿀_수_없다(self):
        res = self.change(INITIAL_PASSWORD, INITIAL_PASSWORD)
        self.assertEqual(res.status_code, 400)
        self.assertIn("0000", str(res.json()["new_password"]))

    def test_이미_바꾼_사람도_0000_으로_되돌릴_수_없다(self):
        res = self.change(PASSWORD, INITIAL_PASSWORD, headers=self.auth("plain"))
        self.assertEqual(res.status_code, 400)

    def test_바꾸면_풀리고_다시_로그인하지_않고_이어_쓴다(self):
        res = self.change(INITIAL_PASSWORD, "새-비밀번호-5678")

        self.assertEqual(res.status_code, 200)
        user = User.objects.get(username="newbie")
        self.assertFalse(user.must_change_password)
        self.assertTrue(user.check_password("새-비밀번호-5678"))

        # 받은 토큰으로 곧바로 앱을 쓴다
        headers = {"authorization": f"Bearer {res.json()['access_token']}"}
        self.assertEqual(self.client.get(reverse("zone-list"), headers=headers).status_code, 200)
        # 새로고침해도 이어지도록 refresh 쿠키도 새로 받는다
        self.assertTrue(res.cookies["alrimi_refresh"].value)
        self.assertEqual(self.client.post(reverse("refresh-token")).status_code, 200)

    def test_직접_만든_계정은_강제_변경이_없다(self):
        me = self.client.get(reverse("me"), headers=self.auth("plain")).json()
        self.assertFalse(me["must_change_password"])
