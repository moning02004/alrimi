/** 밝기(WCAG relative luminance). 0=검정, 1=흰색 */
function luminance(hex: string) {
  const channels = [1, 3, 5].map((i) => {
    const x = parseInt(hex.slice(i, i + 2), 16) / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

const INK = "#16283C";

/**
 * 그 색 위에 얹을 글씨 색.
 *
 * 팔레트가 밝은 색까지 쓰는 이유는 **명도 차이가 색약에서 가장 믿을 수 있는
 * 구분 축**이기 때문이다. 전부 어둡게 맞추면 그 축을 잃는다. 대신 밝은 색 위에는
 * 흰 글씨가 안 읽히므로 대비가 큰 쪽을 고른다.
 */
export function onColor(hex: string) {
  if (!hex) return "#FFFFFF";
  const l = luminance(hex);
  const onWhite = 1.05 / (l + 0.05);
  const onInk = (l + 0.05) / (luminance(INK) + 0.05);
  return onWhite >= onInk ? "#FFFFFF" : INK;
}
