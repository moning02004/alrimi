"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { IconType } from "react-icons";
import {
  HiClock,
  HiHome,
  HiOutlineClock,
  HiOutlineUser,
  HiOutlineHome,
  HiMagnifyingGlass,
  HiOutlineMagnifyingGlass,
  HiPlus,
  HiUser,
} from "react-icons/hi2";
import { pageUrl } from "@/constants/routeUrl";
import { useAddSheet } from "@/store/ui";

/**
 * 등록 버튼을 탭바 가운데에 둔다.
 * 플로팅 버튼은 목록 마지막 항목을 가려서 쓰지 않는다.
 *
 * **다섯 칸이다** — 홈·검색·＋·기록·내 정보. 검색과 지난 일정은 늘 같은 자리에 있어야 찾아갈 수
 * 있는데, 달력 머리글이나 필터 줄에 끼워 넣으면 그 화면의 조작처럼 읽혔다. 양옆을 둘씩 두면
 * 등록 버튼도 가운데에 그대로 선다.
 *
 * 폰 전용이다 — `md`(768px) 이상에서는 왼쪽 `SideNav` 가 대신한다. 그래서
 * hover 나 툴팁은 두지 않는다(마우스가 닿는 자리가 아니다).
 */
export function TabBar() {
  const pathname = usePathname();
  const openAdd = useAddSheet((s) => s.openAdd);

  return (
    /*
      아래 여백은 홈 인디케이터 높이와 12px 중 큰 쪽이다. 안전영역만 두면 인디케이터가
      없는 기기에서 아이콘이 바닥에 붙고, 12px 만 두면 아이폰에서 스와이프 자리에 물린다.
    */
    <div className="relative z-10 mt-auto flex flex-row items-center justify-between bg-card/95 px-1 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-float backdrop-blur md:hidden">
      <Tab
        href={pageUrl.home}
        label="홈"
        active={pathname.startsWith(pageUrl.home)}
        On={HiHome}
        Off={HiOutlineHome}
      />
      <Tab
        href={pageUrl.search}
        label="검색"
        active={pathname.startsWith(pageUrl.search)}
        On={HiMagnifyingGlass}
        Off={HiOutlineMagnifyingGlass}
      />

      <div className="flex-1 text-center">
        <button
          onClick={() => openAdd()}
          aria-label="일정 등록"
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-pine
                     text-white shadow-lg shadow-pine/30 transition-transform active:scale-95"
        >
          <HiPlus className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>

      <Tab
        href={pageUrl.past}
        label="기록"
        active={pathname.startsWith(pageUrl.past)}
        On={HiClock}
        Off={HiOutlineClock}
      />
      <Tab
        href={pageUrl.settings}
        label="내 정보"
        active={pathname.startsWith(pageUrl.settings)}
        On={HiUser}
        Off={HiOutlineUser}
      />
    </div>
  );
}

/**
 * 아이콘 아래에 이름을 작게 적는다. 아이콘만으로는 시계가 "지난 일정" 인 줄 눌러봐야
 * 알았다. 지금 어디인지는 색과 채움이 말한다 — 색만으로 나누면 색약에서 두 칸이 같아
 * 보이므로, 선 그림(Off)과 꽉 찬 그림(On)으로 모양까지 다르게 둔다.
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
      aria-current={active ? "page" : undefined}
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 self-stretch py-1 ${
        active ? "text-ink" : "text-muted/70"
      }`}
    >
      <Icon className="h-6 w-6" aria-hidden="true" />
      <span className={`text-[10px] leading-none ${active ? "font-semibold" : "font-medium"}`}>{label}</span>
    </Link>
  );
}
