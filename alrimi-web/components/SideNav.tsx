"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { IconType } from "react-icons";
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
import { useAddSheet } from "@/store/ui";

/**
 * PC 에서 탭바 대신 쓰는 왼쪽 기둥. `lg`(1024px) 아래에서는 아예 없다.
 *
 * 아래 탭바는 엄지로 닿는 자리라서 아래에 있는 것이지, 마우스에는 그 이유가
 * 없다. 오히려 화면 아래 끝까지 커서를 내렸다 올리는 왕복이 생기고, 좁은 칸에
 * 아이콘만 넣느라 이름을 못 적는다. 여기서는 가로 공간이 남으므로 이름을 적고,
 * 등록 버튼도 아이콘 하나가 아니라 글자가 있는 큰 버튼으로 둔다.
 */
export function SideNav() {
  const pathname = usePathname();
  const openAdd = useAddSheet((s) => s.openAdd);

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-card px-3 py-4 lg:flex">
      <div className="flex items-center gap-2.5 px-2 pb-5">
        <Logo size={30} />
        <span className="text-base font-semibold tracking-tight">일정 알리미</span>
      </div>

      <button
        onClick={() => openAdd()}
        title="일정 등록 (N)"
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-pine py-2.5
                   text-sm font-medium text-white transition-colors hover:bg-pine/90"
      >
        <HiPlus className="h-5 w-5" aria-hidden="true" />
        일정 등록
      </button>

      <nav className="mt-5 flex flex-col gap-0.5">
        <Item
          href={pageUrl.home}
          label="홈"
          active={pathname.startsWith(pageUrl.home)}
          On={HiHome}
          Off={HiOutlineHome}
        />
        <Item
          href={pageUrl.past}
          label="지난 일정"
          active={pathname.startsWith(pageUrl.past)}
          On={HiClock}
          Off={HiOutlineClock}
        />
        <Item
          href={pageUrl.settings}
          label="설정"
          active={pathname.startsWith(pageUrl.settings)}
          On={HiCog6Tooth}
          Off={HiOutlineCog6Tooth}
        />
      </nav>

      {/* 단축키는 눌러볼 일이 없으면 영영 모른다. 늘 보이는 자리에 적어둔다 */}
      <dl className="mt-auto space-y-1.5 px-2 text-xs text-muted">
        <div className="flex items-center justify-between gap-2">
          <dt>일정 등록</dt>
          <dd>
            <Key>N</Key>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt>시트 닫기</dt>
          <dd>
            <Key>Esc</Key>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt>저장</dt>
          <dd>
            <Key>⌘</Key> <Key>Enter</Key>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt>날짜 이동</dt>
          <dd>
            <Key>←</Key> <Key>→</Key>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt>오늘로</dt>
          <dd>
            <Key>T</Key>
          </dd>
        </div>
      </dl>
    </aside>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-paper px-1.5 py-0.5 font-sans text-[11px] text-ink">
      {children}
    </kbd>
  );
}

function Item({
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
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
        active ? "bg-pinelt font-medium text-pine" : "text-muted hover:bg-paper hover:text-ink"
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      {label}
    </Link>
  );
}
