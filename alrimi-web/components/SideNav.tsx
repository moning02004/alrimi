"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { IconType } from "react-icons";
import { LuPanelLeftClose, LuPanelLeftOpen } from "react-icons/lu";
import {
  HiClock,
  HiCog6Tooth,
  HiHome,
  HiOutlineClock,
  HiOutlineCog6Tooth,
  HiOutlineHome,
  HiPlus,
} from "react-icons/hi2";
import { Logo } from "./Logo";
import { pageUrl } from "@/constants/routeUrl";
import { useAddSheet, useSideNav } from "@/store/ui";

/**
 * PC 에서 탭바 대신 쓰는 왼쪽 기둥. `lg`(1024px) 아래에서는 아예 없다.
 *
 * 아래 탭바는 엄지로 닿는 자리라서 아래에 있는 것이지, 마우스에는 그 이유가
 * 없다. 오히려 화면 아래 끝까지 커서를 내렸다 올리는 왕복이 생기고, 좁은 칸에
 * 아이콘만 넣느라 이름을 못 적는다. 여기서는 가로 공간이 남으므로 이름을 적고,
 * 등록 버튼도 아이콘 하나가 아니라 글자가 있는 큰 버튼으로 둔다.
 *
 * 접으면 아이콘만 남는다. 아예 감추지 않는 까닭은, 사라지면 다시 부를 자리가
 * 없어서다 — 좁은 기둥으로 남겨두면 이동도 되고 펴는 버튼도 그 자리에 있다.
 */
export function SideNav() {
  const pathname = usePathname();
  const openAdd = useAddSheet((s) => s.openAdd);
  const collapsed = useSideNav((s) => s.collapsed);
  const toggleCollapsed = useSideNav((s) => s.toggleCollapsed);

  return (
    <aside
      className={`hidden shrink-0 flex-col border-r border-line bg-card py-4 transition-[width] lg:flex ${
        collapsed ? "w-16 px-2" : "w-56 px-3"
      }`}
    >
      {/*
        접기 버튼은 머리 오른쪽 끝. 접는 대상(기둥)의 경계에 붙어 있어야 무엇을
        여닫는 버튼인지 읽힌다.

        접으면 48px 밖에 안 남아 로고와 나란히 설 수 없으므로 아래로 내려 세운다.
        그래도 여전히 맨 위, 같은 자리다.
      */}
      <div
        className={`flex pb-5 ${
          collapsed ? "flex-col items-center gap-2" : "items-center gap-2.5 px-2"
        }`}
      >
        <Logo size={30} />
        {!collapsed && (
          <span className="whitespace-nowrap text-base font-semibold tracking-tight">
            일정 알리미
          </span>
        )}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          aria-expanded={!collapsed}
          className={`flex h-8 w-8 items-center justify-center rounded-lg text-muted
                      transition-colors hover:bg-paper hover:text-ink ${
                        collapsed ? "" : "-mr-1 ml-auto"
                      }`}
        >
          {/*
            화살표(≪ ≫)가 아니라 기둥이 그려진 그림이다. 화살표는 "무엇이"
            움직이는지 말하지 않아서 페이지가 넘어갈 것처럼도 읽힌다. 이 그림은
            네모 왼쪽에 기둥이 붙어 있어, 움직이는 것이 옆 기둥이라고 말한다.
          */}
          {collapsed ? (
            <LuPanelLeftOpen className="h-5 w-5" aria-hidden="true" />
          ) : (
            <LuPanelLeftClose className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>

      <button
        onClick={() => openAdd()}
        title="일정 등록"
        aria-label={collapsed ? "일정 등록" : undefined}
        className={`flex w-full items-center justify-center gap-1.5 rounded-xl bg-pine
                    text-sm font-medium text-white transition-colors hover:bg-pine/90 ${
                      collapsed ? "h-10" : "py-2.5"
                    }`}
      >
        <HiPlus className="h-5 w-5 shrink-0" aria-hidden="true" />
        {!collapsed && "일정 등록"}
      </button>

      <nav className="mt-5 flex flex-col gap-0.5">
        <Item
          href={pageUrl.home}
          label="홈"
          active={pathname.startsWith(pageUrl.home)}
          collapsed={collapsed}
          On={HiHome}
          Off={HiOutlineHome}
        />
        <Item
          href={pageUrl.past}
          label="지난 일정"
          active={pathname.startsWith(pageUrl.past)}
          collapsed={collapsed}
          On={HiClock}
          Off={HiOutlineClock}
        />
        <Item
          href={pageUrl.settings}
          label="설정"
          active={pathname.startsWith(pageUrl.settings)}
          collapsed={collapsed}
          On={HiCog6Tooth}
          Off={HiOutlineCog6Tooth}
        />
      </nav>

    </aside>
  );
}

function Item({
  href,
  label,
  active,
  collapsed,
  On,
  Off,
}: {
  href: string;
  label: string;
  active: boolean;
  collapsed: boolean;
  On: IconType;
  Off: IconType;
}) {
  const Icon = active ? On : Off;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      /* 접었을 때는 이름이 안 보이니 마우스에는 툴팁으로, 화면 낭독기에는
         `aria-label` 로 남긴다 */
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={`flex items-center gap-2.5 rounded-lg py-2 text-sm transition-colors ${
        collapsed ? "justify-center px-0" : "px-2.5"
      } ${active ? "bg-pinelt font-medium text-pine" : "text-muted hover:bg-paper hover:text-ink"}`}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      {!collapsed && label}
    </Link>
  );
}
