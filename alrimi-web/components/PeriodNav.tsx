"use client";

import {HiChevronDown, HiChevronLeft, HiChevronRight} from "react-icons/hi2";

/**
 * 기간을 옮기는 버튼들. 글자(‹ ›)가 아니라 **바탕이 있는 동그라미**다 — 글자만 있으면
 * 어디까지가 누르는 자리인지 안 보이고, 손가락으로 겨냥하기에도 작았다.
 * PC 의 달력 머리글도 같은 것을 쓴다(`app/(main)/home/page.tsx`).
 */
export const navButtonCls =
    "flex h-8 w-8 items-center justify-center rounded-full bg-paper text-ink/70 transition-colors hover:bg-line";
export const todayButtonCls =
    "h-8 rounded-full bg-paper px-3 text-xs font-semibold text-ink/80 transition-colors hover:bg-line";

interface Props {
    label: string;
    expanded: boolean;
    onToggle: (expanded: boolean) => void;
    nav: {
        onPrev: () => void;
        onNext: () => void;
        onToday: () => void;
        prevLabel: string;
        nextLabel: string;
    };
}

/**
 * 주간·월간이 같은 머리글을 쓴다. 왼쪽은 지금 보고 있는 기간, 오른쪽은 그 기간을
 * 옮기는 버튼이다.
 *
 * 기간 이름 자체가 펼치기 버튼이다 — 손잡이보다 먼저 눈에 들어오는 자리라
 * 달력을 처음 여는 사람이 여기서 걸린다.
 *
 * 펼치면 오늘로 돌아가는 것은 여기가 아니라 `onToggle` 을 받는 쪽이 한다.
 * 스와이프로 펼쳐도 같아야 하는데, 그 제스처는 이 버튼을 거치지 않는다.
 */
export function PeriodNav({label, expanded, onToggle, nav}: Props) {
    return (
        <div className="flex items-center justify-between px-1">
            <button
                onClick={() => onToggle(!expanded)}
                aria-expanded={expanded}
                className="flex items-center gap-1 py-0.5 text-[22px] font-bold tracking-tight"
            >
                {label}
                <HiChevronDown
                    aria-hidden="true"
                    className={`h-4 w-4 text-muted transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
                />
            </button>

            <div className="flex items-center gap-1.5">
                <button onClick={nav.onPrev} aria-label={nav.prevLabel} className={navButtonCls}>
                    <HiChevronLeft className="h-4 w-4" aria-hidden="true"/>
                </button>
                <button onClick={nav.onToday} className={todayButtonCls}>
                    오늘
                </button>
                <button onClick={nav.onNext} aria-label={nav.nextLabel} className={navButtonCls}>
                    <HiChevronRight className="h-4 w-4" aria-hidden="true"/>
                </button>
            </div>
        </div>
    );
}
