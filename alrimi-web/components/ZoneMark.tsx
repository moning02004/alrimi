import {onColor} from "@/lib/color";

// 이름이 겹치면 두 글자가 된다. 그때는 옆으로만 늘어나도록 너비를 최소값으로
// 두고 좌우 여백을 준다 — 높이가 바뀌면 줄 간격이 흔들린다.
const SIZES = {
    /** 카드·행 앞머리 */
    md: "h-6 min-w-6 rounded-lg px-1 text-[11px]",
    /** 칩 안, 알약 안 */
    sm: "h-4 min-w-4 rounded-[5px] px-0.5 text-[9px]",
    /** 달력 칸 */
    xs: "h-3.5 min-w-3.5 rounded-[4px] px-0.5 text-[9px]",
} as const;

/**
 * 공간 하나를 나타내는 머리글자 딱지.
 *
 * 색만 쓰던 자리(3px 막대·4px 점)를 대신한다. 색약에서 작은 면적의 색은 읽히지
 * 않아서, 글자를 얹고 색은 배경으로 남긴다 — 두 축이 같은 것을 가리킨다.
 */
export function ZoneMark({
                             mark,
                             color,
                             name,
                             size = "md",
                         }: {
    mark: string;
    color: string;
    /** 화면에는 안 보이고 읽어주는 이름. 딱지만으로는 무슨 공간인지 못 듣는다 */
    name?: string;
    size?: keyof typeof SIZES;
}) {
    return (
        // `relative` 는 장식이 아니라 필수다. 아래 `.sr-only` 가 position:absolute 라,
        // 여기가 static 이면 담길 상자를 저 위의 스크롤 칸에서 찾는다. 그러면 딱지가
        // 스크롤 안쪽 깊은 곳에 있을 때 그 1px 짜리 span 이 바깥 스크롤 범위를
        // 늘려서, 스크롤할 것이 없는 화면에 유령 스크롤이 생긴다.
        <span
            className={`relative inline-flex shrink-0 items-center justify-center font-semibold leading-none ${SIZES[size]}`}
            style={{background: color, color: onColor(color)}}
        >
      <span aria-hidden>{mark}</span>
      {name && <span className="sr-only">{name}</span>}
    </span>
    );
}
