"use client";

import Link from "next/link";
import { LuSearch } from "react-icons/lu";
import { pageUrl } from "@/constants/routeUrl";

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
                className="flex items-center gap-1 py-0.5 text-base font-semibold"
            >
                {label}
                <span className={`text-xs text-muted transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}>
          ▾
        </span>
            </button>

            <div className="flex items-center gap-1 text-sm text-muted">
                {/*
                  검색은 모바일에서 여기로 들어간다. 탭바는 홈·등록·설정 셋으로 두어 가운데
                  등록 버튼이 가운데에 선다. 머리글 오른쪽은 "다른 일정을 찾아가는" 자리라
                  기간 이동 옆이 어울린다.
                */}
                <Link
                    href={pageUrl.search}
                    aria-label="일정 검색"
                    className="mr-1 flex h-8 w-8 items-center justify-center rounded-full hover:bg-paper"
                >
                    <LuSearch className="h-4 w-4" aria-hidden="true"/>
                </Link>
                <button onClick={nav.onPrev} aria-label={nav.prevLabel} className="px-2 py-0.5">
                    ‹
                </button>
                <button onClick={nav.onToday} className="px-1.5 py-0.5 text-xs">
                    오늘
                </button>
                <button onClick={nav.onNext} aria-label={nav.nextLabel} className="px-2 py-0.5">
                    ›
                </button>
            </div>
        </div>
    );
}
