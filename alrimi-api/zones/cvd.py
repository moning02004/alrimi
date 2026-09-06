"""
색각이상 시뮬레이션과 색차 계산.

팔레트가 "색약이어도 구분되는가"를 눈대중이 아니라 수치로 지키려고 둔다.
`zones/tests.py` 가 이 모듈로 팔레트를 검사하므로, 색을 바꾸면 테스트가 먼저 막는다.

- 시뮬레이션: Viénot·Brettel·Mollon (1999) 이색형 근사, 선형 RGB 위에서
- 색차: CIEDE2000 (사람이 느끼는 차이에 맞춘 표준)
"""

import itertools
import math

# 선형 RGB 에 곱하는 이색형 근사 행렬
CVD_MATRICES = {
    "정상": None,
    "제1색맹(적)": ((0.11238, 0.88762, 0.0), (0.11238, 0.88762, 0.0), (0.00401, -0.00401, 1.0)),
    "제2색맹(녹)": ((0.29275, 0.70725, 0.0), (0.29275, 0.70725, 0.0), (-0.02234, 0.02234, 1.0)),
    "제3색맹(청)": ((1.0, 0.14461, -0.14461), (0.0, 1.0, 0.0), (0.0, 0.15594, 0.84406)),
}

_XYZ = ((0.4124, 0.3576, 0.1805), (0.2126, 0.7152, 0.0722), (0.0193, 0.1192, 0.9505))
_WHITE_POINT = (0.95047, 1.0, 1.08883)


def _to_rgb(value: str) -> tuple[float, float, float]:
    return tuple(int(value[i : i + 2], 16) / 255 for i in (1, 3, 5))


def _linear(channel: float) -> float:
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def _mul(matrix, vector):
    return tuple(sum(matrix[i][j] * vector[j] for j in range(3)) for i in range(3))


def luminance(value: str) -> float:
    """WCAG 상대 휘도."""
    r, g, b = (_linear(c) for c in _to_rgb(value))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: str, b: str) -> float:
    x, y = luminance(a) + 0.05, luminance(b) + 0.05
    return max(x, y) / min(x, y)


def simulate(value: str, kind: str) -> tuple[float, float, float]:
    """선형 RGB 로 돌려준다. Lab 로 넘길 것이라 sRGB 로 되돌리지 않는다."""
    linear = tuple(_linear(c) for c in _to_rgb(value))
    matrix = CVD_MATRICES[kind]
    if matrix is None:
        return linear
    return tuple(max(0.0, min(1.0, c)) for c in _mul(matrix, linear))


def _lab(linear_rgb) -> tuple[float, float, float]:
    x, y, z = _mul(_XYZ, linear_rgb)

    def f(t):
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116

    fx, fy, fz = (f(v / w) for v, w in zip((x, y, z), _WHITE_POINT))
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def delta_e(linear_a, linear_b) -> float:
    """CIEDE2000. 대략 2 이하면 같은 색으로 보이고, UI 구분에는 10 이상이 필요하다."""
    l1, a1, b1 = _lab(linear_a)
    l2, a2, b2 = _lab(linear_b)

    c1, c2 = math.hypot(a1, b1), math.hypot(a2, b2)
    c_bar = (c1 + c2) / 2
    g = 0.5 * (1 - math.sqrt(c_bar**7 / (c_bar**7 + 25**7))) if c_bar else 0
    a1p, a2p = (1 + g) * a1, (1 + g) * a2
    c1p, c2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p = math.degrees(math.atan2(b1, a1p)) % 360
    h2p = math.degrees(math.atan2(b2, a2p)) % 360

    dlp, dcp = l2 - l1, c2p - c1p
    if c1p * c2p == 0:
        dhp = 0.0
    elif abs(h2p - h1p) <= 180:
        dhp = h2p - h1p
    else:
        dhp = h2p - h1p - 360 if h2p > h1p else h2p - h1p + 360
    dHp = 2 * math.sqrt(c1p * c2p) * math.sin(math.radians(dhp) / 2)

    l_bar, c_bar_p = (l1 + l2) / 2, (c1p + c2p) / 2
    if c1p * c2p == 0:
        h_bar = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        h_bar = (h1p + h2p) / 2
    elif h1p + h2p < 360:
        h_bar = (h1p + h2p + 360) / 2
    else:
        h_bar = (h1p + h2p - 360) / 2

    t = (
        1
        - 0.17 * math.cos(math.radians(h_bar - 30))
        + 0.24 * math.cos(math.radians(2 * h_bar))
        + 0.32 * math.cos(math.radians(3 * h_bar + 6))
        - 0.20 * math.cos(math.radians(4 * h_bar - 63))
    )
    rc = 2 * math.sqrt(c_bar_p**7 / (c_bar_p**7 + 25**7)) if c_bar_p else 0
    sl = 1 + 0.015 * (l_bar - 50) ** 2 / math.sqrt(20 + (l_bar - 50) ** 2)
    sc, sh = 1 + 0.045 * c_bar_p, 1 + 0.015 * c_bar_p * t
    rt = -math.sin(math.radians(2 * 30 * math.exp(-(((h_bar - 275) / 25) ** 2)))) * rc

    return math.sqrt(
        (dlp / sl) ** 2 + (dcp / sc) ** 2 + (dHp / sh) ** 2 + rt * (dcp / sc) * (dHp / sh)
    )


def closest_pair(colors: list[str]) -> tuple[float, str, str, str]:
    """정상 시야와 세 가지 색각이상 전부에서 가장 가까운 두 색. (거리, 색, 색, 시야)"""
    worst = (float("inf"), "", "", "")
    for kind in CVD_MATRICES:
        simulated = {c: simulate(c, kind) for c in colors}
        for a, b in itertools.combinations(colors, 2):
            distance = delta_e(simulated[a], simulated[b])
            if distance < worst[0]:
                worst = (distance, a, b, kind)
    return worst
