"use client";

import { useState } from "react";
import { useEvents } from "@/hooks/useEvents";
import { useZones } from "@/hooks/useZones";
import { groupByDate } from "@/lib/date";
import { EventGroups } from "@/components/EventGroups";
import { HeldList } from "@/components/HeldList";
import { ErrorBlock, LoadingBlock } from "@/components/Loading";
import { ZoneChips } from "@/components/ZoneChips";

type Tab = "past" | "held";

/**
 * 지금 목록에 없는 일정들. 두 탭이 서로 다른 까닭으로 빠져 있다.
 *
 * **지난 일정** — 날이 지나서 빠진 것. 기록이라 완료한 것도 그대로 남기고
 * (끝낸 것을 지워버리면 그 날 무엇이 있었는지가 틀리게 남는다) 화면에서만
 * 흐리게 그린다. 최근 것부터 — 오래된 것부터 쌓으면 방금 지난 일정을 찾으려고
 * 끝까지 스크롤해야 한다.
 *
 * **보류** — 날을 아직 안 잡아서 빠진 것. 지우는 대신 치워둔 자리다.
 *
 * 두 탭이 한 페이지에 있는 것은 둘 다 "지금 홈에 없는 것" 을 찾을 때 오는
 * 자리여서다. 아래 탭바에 칸을 하나 더 내주지 않은 것이기도 하다 — 폰에서
 * 늘 보이는 자리는 홈·등록·설정 셋이면 충분하다.
 */
export default function PastPage() {
  const { selectedZoneId } = useZones();
  const [tab, setTab] = useState<Tab>("past");

  const past = useEvents("past", selectedZoneId);
  /*
    보류함은 탭을 누르기 전에도 받아둔다 — 탭에 개수를 적어야 해서다.
    치워둔 것이 있다는 사실 자체가 여기 올 이유인데, 그 숫자가 탭을 눌러야만
    보이면 보류함이 비어 있는 사람과 구별되지 않는다. 한 줌짜리 목록이다.
  */
  const held = useEvents("held", selectedZoneId);
  const heldCount = held.data?.length ?? 0;

  const events = past.data ?? [];

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-card px-4 py-3">
        <div className="mx-auto w-full max-w-2xl">
          {/* 머리글은 탭이 겸한다 — 위에 "지난 일정" 을 또 적으면 같은 말이 두 줄이다 */}
          <h1 className="sr-only">지난 일정과 보류함</h1>

          {/*
            밑줄 탭이다. 알약 모양으로 하면 아래 공간 칩과 같은 생김새가 되어,
            두 줄이 같은 축(공간)을 두 번 고르는 것처럼 읽힌다.
          */}
          <div role="tablist" className="flex gap-4 border-b border-line">
            <TabButton on={tab === "past"} onClick={() => setTab("past")}>
              지난 일정
            </TabButton>
            <TabButton on={tab === "held"} onClick={() => setTab("held")}>
              보류
              {heldCount > 0 && <span className="ml-1.5 tabular-nums">{heldCount}</span>}
            </TabButton>
          </div>

          <div className="mt-2">
            <ZoneChips />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 pb-4">
        {tab === "held" ? (
          <HeldList zoneId={selectedZoneId} />
        ) : (
          <>
            {past.isLoading && <LoadingBlock />}
            {past.isError && <ErrorBlock onRetry={() => past.refetch()} />}

            {!past.isLoading &&
              !past.isError &&
              (events.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">지난 일정이 없어요</p>
              ) : (
                // 최근 것부터. 며칠짜리 일정은 걸친 날마다 한 번씩 나온다.
                <EventGroups groups={groupByDate(events, { desc: true })} />
              ))}
          </>
        )}
      </main>
    </>
  );
}

function TabButton({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={on}
      onClick={onClick}
      // 밑줄은 고르지 않은 쪽에도 투명으로 깔아둔다. 켤 때만 그리면 그만큼
      // 줄 높이가 달라져 탭을 옮길 때마다 아래 목록이 1px 씩 들썩인다.
      className={`-mb-px border-b-2 pb-2 text-base transition-colors ${
        on ? "border-pine font-semibold text-pine" : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
