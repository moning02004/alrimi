"""
ntfy 구독 링크.

토픽은 곧 비밀번호다. 그래서 사람이 옮겨 적을 일이 없도록 링크와 QR로 건넨다 —
스캔하면 앱이 열리면서 구독까지 끝난다.

ntfy 문서 기준으로 두 가지를 지킨다.

- **`ntfy://` 여야 한다.** `https://<host>/<topic>` 로는 구독이 안 된다.
  안드로이드의 http/https 딥링크가 제한적이라 ntfy 가 자체 스킴을 쓴다.
- **http 로 띄운 서버는 `?secure=false` 가 필요하다.** 없으면 앱이 https 로 붙는다.

자격 증명은 링크에 실을 수 없다(ntfy#244, not planned). 서버에 ACL 을 걸면
이 링크만으로는 구독이 끝나지 않고 앱에서 로그인을 따로 해야 한다.
"""

from urllib.parse import quote, urlparse

from django.conf import settings

# 앱의 구독 목록에 16진수 대신 이 이름이 보인다
DISPLAY_NAME = "일정 알리미"


def subscribe_link(topic: str) -> str:
    """스캔하거나 탭하면 그 토픽을 구독하는 링크."""
    parsed = urlparse(settings.NTFY_BASE_URL)
    host = parsed.netloc or parsed.path  # 스킴 없이 적어도 동작하게

    link = f"ntfy://{host}/{topic}?display={quote(DISPLAY_NAME)}"
    if parsed.scheme == "http":
        link += "&secure=false"
    return link


def web_link(topic: str) -> str:
    """브라우저에서 여는 주소. 구독은 안 되고 확인용이다."""
    return f"{settings.NTFY_BASE_URL}/{topic}"


# 모니터에서 폰으로 찍는 거리를 감안한 크기. 기본값(약 120px)은 초점이 잘 안 맞는다.
QR_PIXELS = 220


def qr_svg(data: str, size: int = QR_PIXELS) -> str:
    """
    QR 을 직접 그린다. 외부 QR 서비스에 맡기지 않는 이유는 토픽이 곧 비밀번호라서다 —
    남의 서버 로그에 남을 일을 만들지 않는다.
    """
    import re

    import qrcode
    import qrcode.image.svg

    image = qrcode.make(data, image_factory=qrcode.image.svg.SvgPathImage, border=2)
    svg = image.to_string(encoding="unicode")

    # 라이브러리가 mm 로 내보낸다. 화면에서는 px 로 고정해야 크기가 예측된다.
    return re.sub(r'width="[^"]*"\s+height="[^"]*"', f'width="{size}" height="{size}"', svg, count=1)


def qr_data_uri(data: str, size: int = QR_PIXELS) -> str:
    """`<img src>` 에 그대로 넣는 형태. 마크업을 DOM 에 주입하지 않아도 된다."""
    from base64 import b64encode

    encoded = b64encode(qr_svg(data, size).encode()).decode()
    return f"data:image/svg+xml;base64,{encoded}"
