from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse

User = get_user_model()


class AuthFlowTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("hoon", password="pw-strong-1234", name="정훈")

    def login(self):
        return self.client.post(
            reverse("obtain-token"),
            {"username": "hoon", "password": "pw-strong-1234"},
            content_type="application/json",
        )

    def test_login_returns_access_in_body_and_refresh_in_httponly_cookie(self):
        res = self.login()
        self.assertEqual(res.status_code, 200)
        self.assertIn("access_token", res.json())
        self.assertNotIn("refresh", res.json())

        cookie = res.cookies["alrimi_refresh"]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["path"], "/auth")

    def test_wrong_password_is_rejected(self):
        res = self.client.post(
            reverse("obtain-token"),
            {"username": "hoon", "password": "nope"},
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)

    def test_refresh_uses_cookie_and_returns_a_new_access_token(self):
        self.login()

        res = self.client.post(reverse("refresh-token"))
        self.assertEqual(res.status_code, 200)
        self.assertIn("access_token", res.json())

    def test_the_same_refresh_cookie_can_be_used_repeatedly(self):
        """
        웹은 부트스트랩과 api.ts 재시도가 각각 refresh를 부르고 StrictMode에서
        두 번 실행되므로 같은 쿠키를 든 요청이 여러 개 뜬다. 토큰을 회전시키면
        그중 하나만 살아남아 프런트가 간헐적으로 로그아웃된다.
        """
        self.login()

        for _ in range(3):
            self.assertEqual(self.client.post(reverse("refresh-token")).status_code, 200)

    def test_refresh_without_cookie_is_401(self):
        self.assertEqual(self.client.post(reverse("refresh-token")).status_code, 401)

    def test_logout_revokes_refresh(self):
        self.login()
        self.assertEqual(self.client.delete(reverse("revoke-token")).status_code, 204)
        # 쿠키가 지워졌으므로 재발급도 막힌다
        self.assertEqual(self.client.post(reverse("refresh-token")).status_code, 401)

    def test_me_carries_the_subscribe_link(self):
        """
        토픽은 16진수라 손으로 옮겨 적을 수 없다. 웹은 이 링크를 그대로 걸어
        누르면 앱이 열리면서 구독까지 끝나게 한다.
        """
        token = self.login().json()["access_token"]
        body = self.client.get(reverse("me"), headers={"authorization": f"Bearer {token}"}).json()

        self.assertEqual(body["ntfy_topic"], self.user.ntfy_topic)
        self.assertTrue(body["ntfy_subscribe_url"].startswith("ntfy://"))
        self.assertIn(self.user.ntfy_topic, body["ntfy_subscribe_url"])

    @override_settings(NTFY_BASE_URL="http://192.168.0.10:8080")
    def test_a_plain_http_server_is_marked_insecure(self):
        """없으면 앱이 https 로 붙어서 연결이 안 된다."""
        token = self.login().json()["access_token"]
        body = self.client.get(reverse("me"), headers={"authorization": f"Bearer {token}"}).json()

        self.assertIn("192.168.0.10:8080", body["ntfy_subscribe_url"])
        self.assertIn("secure=false", body["ntfy_subscribe_url"])

    def test_me_requires_auth_and_reports_version(self):
        self.assertEqual(self.client.get(reverse("me")).status_code, 401)

        token = self.login().json()["access_token"]
        res = self.client.get(reverse("me"), headers={"authorization": f"Bearer {token}"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["name"], "정훈")
        self.assertIn("version", res.json())
