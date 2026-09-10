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


VAPID_KEYS = {
    # 시험용 한 쌍. 실제로 쏘지 않으므로 값의 내용은 상관없지만, 형식이 맞아야
    # "키가 설정됐는가" 를 보는 자리들이 진짜처럼 동작한다.
    "VAPID_PUBLIC_KEY": "BJ8W3ADoOxAM7qlEFlIGsxRBPq03yIGvXSIk0gcvrPLHCfr0mVq1lMGD5-IqdQ3KoVNUvMC_iTnxxbU80II09aY",
    "VAPID_PRIVATE_KEY": "519GVRBYQGJp1WkOymwx7FvW_KZVpTkoAMafTqBLhs0",
}


@override_settings(**VAPID_KEYS)
class PushSubscriptionApiTests(TestCase):
    """
    /push/* — 브라우저가 만든 구독을 등록하고 지운다.

    ntfy 토픽과 달리 이쪽은 기기마다 하나라, "누가" 말고 "어느 기기" 를 다루는
    경계가 제대로 서 있는지를 본다.
    """

    def setUp(self):
        from accounts.models import PushSubscription

        self.model = PushSubscription
        self.user = User.objects.create_user("hoon", password="pw-strong-1234")
        self.other = User.objects.create_user("nam", password="pw-strong-1234")
        self.auth = self.login("hoon")

    def login(self, username):
        res = self.client.post(
            reverse("obtain-token"),
            {"username": username, "password": "pw-strong-1234"},
            content_type="application/json",
        )
        return {"authorization": f"Bearer {res.json()['access_token']}"}

    def body(self, endpoint="https://fcm.googleapis.com/fcm/send/abc"):
        return {"endpoint": endpoint, "keys": {"p256dh": "key-material", "auth": "auth-secret"}}

    def subscribe(self, body=None, auth=None):
        return self.client.post(
            reverse("push-subscriptions"),
            body or self.body(),
            content_type="application/json",
            headers=auth or self.auth,
        )

    def test_구독을_등록하면_그_사람_기기로_남는다(self):
        res = self.subscribe()

        self.assertEqual(res.status_code, 201)
        subscription = self.model.objects.get()
        self.assertEqual(subscription.user, self.user)
        self.assertEqual(subscription.p256dh, "key-material")

    def test_같은_기기가_다시_등록해도_늘지_않는다(self):
        """
        브라우저는 구독을 되살릴 때마다 다시 보낸다. 여기서 막거나 새로 쌓으면
        기기 하나에 알림이 두 번 간다.
        """
        self.subscribe()
        res = self.subscribe(self.body())

        self.assertEqual(res.status_code, 201)
        self.assertEqual(self.model.objects.count(), 1)

    def test_다른_사람_기기로_넘어가면_주인도_바뀐다(self):
        """
        한 기기를 두 사람이 번갈아 쓰면 endpoint 는 같고 주인만 바뀐다.
        옛 주인에게 남겨두면 로그아웃한 사람의 일정이 이 폰으로 계속 온다.
        """
        self.subscribe()
        self.subscribe(auth=self.login("nam"))

        self.assertEqual(self.model.objects.get().user, self.other)

    def test_해지는_그_기기만_지운다(self):
        self.subscribe()
        self.subscribe(self.body("https://fcm.googleapis.com/fcm/send/pc"))

        res = self.client.delete(
            reverse("push-subscriptions"),
            self.body(),
            content_type="application/json",
            headers=self.auth,
        )

        self.assertEqual(res.status_code, 204)
        self.assertEqual(
            [s.endpoint for s in self.model.objects.all()],
            ["https://fcm.googleapis.com/fcm/send/pc"],
        )

    def test_남의_기기는_지우지_못한다(self):
        self.subscribe(auth=self.login("nam"))

        res = self.client.delete(
            reverse("push-subscriptions"),
            self.body(),
            content_type="application/json",
            headers=self.auth,
        )

        # 없는 것으로 보고 같게 답하되, 남의 것은 그대로 남아 있어야 한다
        self.assertEqual(res.status_code, 204)
        self.assertEqual(self.model.objects.count(), 1)

    def test_로그인하지_않으면_등록할_수_없다(self):
        res = self.client.post(
            reverse("push-subscriptions"), self.body(), content_type="application/json"
        )
        self.assertEqual(res.status_code, 401)

    def test_키가_모자라면_받지_않는다(self):
        """p256dh 나 auth 가 빠진 구독으로는 암호화를 못 해 보낼 수 없다."""
        res = self.subscribe({"endpoint": "https://fcm.googleapis.com/x", "keys": {"auth": "a"}})
        self.assertEqual(res.status_code, 400)

    def test_공개키를_내준다(self):
        res = self.client.get(reverse("push-key"), headers=self.auth)

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["public_key"], VAPID_KEYS["VAPID_PUBLIC_KEY"])
        self.assertTrue(res.json()["enabled"])

    @override_settings(VAPID_PUBLIC_KEY="", VAPID_PRIVATE_KEY="")
    def test_서버에_키가_없으면_꺼진_것으로_알린다(self):
        """웹은 이 값을 보고 알림 켜기 자리를 아예 내주지 않는다."""
        res = self.client.get(reverse("push-key"), headers=self.auth)

        self.assertFalse(res.json()["enabled"])
        self.assertIsNone(res.json()["public_key"])

    def test_시험_발송은_기기가_없으면_까닭을_말한다(self):
        res = self.client.post(reverse("push-test"), headers=self.auth)

        self.assertEqual(res.status_code, 502)
        self.assertIn("기기가 없어요", res.json()["detail"])

    def test_시험_발송은_등록된_기기로_간다(self):
        from unittest.mock import patch

        self.subscribe()
        with patch("notices.webpush.webpush") as sender:
            res = self.client.post(reverse("push-test"), headers=self.auth)

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["delivered"], 1)
        sent = sender.call_args.kwargs["subscription_info"]
        self.assertEqual(sent["endpoint"], self.body()["endpoint"])
