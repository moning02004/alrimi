"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import type {IconType} from "react-icons";
import {
    HiCog6Tooth,
    HiHome,
    HiOutlineCog6Tooth,
    HiOutlineHome,
    HiPlus,
} from "react-icons/hi2";
import {pageUrl} from "@/constants/routeUrl";
import {useAddSheet} from "@/store/ui";

/**
 * 등록 버튼을 탭바 가운데에 둔다.
 * 플로팅 버튼은 목록 마지막 항목을 가려서 쓰지 않는다.
 *
 * 높이는 안쪽 줄이 갖고, 안전영역 여백(`safe-bottom`)은 그 아래에 따로 붙인다.
 * 바깥 한 겹에 높이와 padding-bottom 을 같이 주면 border-box 라 여백이 높이
 * 안에서 깎인다. 안드로이드 제스처 내비게이션은 그 여백이 30px 안팎이어서,
 * 아이콘이 남은 자리 가운데로 밀려 올라가고 아래에는 빈 띠가 남는다.
 *
 * 높이에 vh 를 쓰지 않는 것도 같은 이유다 — 작은 폰에서는 좁고 큰 폰에서는
 * 두꺼워진다. 탭바는 화면 크기가 아니라 손가락 크기에 맞추는 자리다.
 */
export function TabBar() {
    const pathname = usePathname();
    const openAdd = useAddSheet((s) => s.openAdd);

    return (
        <div className="flex flex-row justify-between mt-auto py-3  bg-card border-t border-line">
            <Tab
                href={pageUrl.home}
                label="홈"
                active={pathname.startsWith(pageUrl.home)}
                On={HiHome}
                Off={HiOutlineHome}
            />

            <div className="flex-1 text-center">
                <button
                    onClick={() => openAdd()}
                    aria-label="일정 등록"
                    className="mx-auto flex h-11 w-11 items-center justify-center rounded-full
                       bg-pine text-white active:bg-pine/90"
                >
                    <HiPlus className="h-6 w-6" aria-hidden="true"/>
                </button>
            </div>

            <Tab
                href={pageUrl.settings}
                label="설정"
                active={pathname.startsWith(pageUrl.settings)}
                On={HiCog6Tooth}
                Off={HiOutlineCog6Tooth}
            />
        </div>
    );
}

/**
 * 글씨 대신 아이콘 하나만 둔다. 이름은 `aria-label` 로만 남기므로 눈으로는
 * 읽히지 않는다 — 지금 어디인지는 색과 채움이 말한다. 색만으로 나누면 색약에서
 * 두 칸이 같아 보이므로, 선 그림(Off)과 꽉 찬 그림(On)으로 모양까지 다르게 둔다.
 */
function Tab({
                 href,
                 label,
                 active,
                 On,
                 Off,
             }: {
    href: string;
    label: string;
    active: boolean;
    On: IconType;
    Off: IconType;
}) {
    const Icon = active ? On : Off;

    return (
        <Link
            href={href}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className="flex flex-1 items-center justify-center self-stretch"
        >
            <Icon className={`h-6 w-6 ${active ? "text-pine" : "text-muted"}`} aria-hidden="true"/>
        </Link>
    );
}
