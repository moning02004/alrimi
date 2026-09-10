"""
웹 푸시용 VAPID 키 한 쌍을 만든다.

    python manage.py webpush_keys

**한 번만 만든다.** 브라우저의 구독은 발급 당시의 공개키에 묶여 있어서, 키를 갈면
그때까지 등록된 기기가 전부 조용히 죽는다(푸시 서비스가 403 을 준다). 이미 .env 에
값이 있으면 그것을 쓰고, 정말 새로 만들 때만 이 명령을 다시 부른다.
"""

from base64 import urlsafe_b64encode

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from django.core.management.base import BaseCommand


def b64url(raw: bytes) -> str:
    """웹 푸시 규격이 쓰는 base64url. 패딩(=)은 뺀다 — 브라우저가 그 형태를 받는다."""
    return urlsafe_b64encode(raw).decode().rstrip("=")


class Command(BaseCommand):
    help = "웹 푸시(VAPID) 키 한 쌍을 만들어 .env 에 붙일 형태로 찍는다"

    def handle(self, *args, **options):
        private_key = ec.generate_private_key(ec.SECP256R1())

        # 개인키는 32바이트 정수 하나("raw" 형식)다. pywebpush 가 이 형태를 그대로 읽는다.
        private_raw = private_key.private_numbers().private_value.to_bytes(32, "big")
        # 공개키는 비압축 점(0x04 + X + Y = 65바이트). 브라우저의 applicationServerKey 가
        # 이 형태만 받는다.
        public_raw = private_key.public_key().public_bytes(
            Encoding.X962, PublicFormat.UncompressedPoint
        )

        self.stdout.write("아래 두 줄을 .env 에 넣으세요. 개인키는 서버 밖으로 내보내지 마세요.\n")
        self.stdout.write(f"VAPID_PUBLIC_KEY={b64url(public_raw)}")
        self.stdout.write(f"VAPID_PRIVATE_KEY={b64url(private_raw)}")
