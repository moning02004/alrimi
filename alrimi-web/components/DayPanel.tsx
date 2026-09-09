"use client";

import { EventCard } from "./EventCard";
import { ErrorBlock, LoadingBlock } from "./Loading";
import { fullLabel, sectionLabel } from "@/lib/date";
import type { EventListItem } from "@/types";

interface Props {
  /** 보고 있는 하루 (YYYY-MM-DD) */
  date: string;
  items: EventListItem[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
  /** 지난 날에는 등록을 열지 않는다 — 알림 시각이 이미 지나 저장하자마자 다 나간다 */
  canAdd: boolean;
  onAdd: () => void;
  /** PC 2단에서 카드를 누르면 옆 칸에 펼친다. 없으면 상세 페이지로 이동한다 */
  onSelect?: (eventId: number) => void;
  /** PC 2단의 오른쪽 칸은 이 화면의 주인공이라 머리글을 크게 쓴다 */
  size?: "sm" | "lg";
}

/**
 * 하루치 목록. 달력에서 고른 날이 여기 펼쳐진다.
 *
 * 모바일에서 달력을 펼쳤을 때와 PC 2단의 오른쪽 칸이 같은 것을 그린다 —
 * 두 곳이 따로 놀면 한쪽만 고쳐지는 일이 생긴다.
 */
export function DayPanel({
  date,
  items,
  isLoading,
  isError,
  onRetry,
  canAdd,
  onAdd,
  onSelect,
  size = "sm",
}: Props) {
  const big = size === "lg";

  return (
    <section>
      <div className={`flex items-baseline justify-between gap-3 px-1 ${big ? "pb-3" : "pb-1.5 pt-4"}`}>
        {big ? (
          <h2 className="text-lg font-semibold tracking-tight">
            {fullLabel(date)}
            <span className="ml-2 text-sm font-normal text-muted">
              {items.length > 0 ? `${items.length}건` : "비어 있음"}
            </span>
          </h2>
        ) : (
          <p className="text-xs font-medium text-muted">{sectionLabel(date)}</p>
        )}
        {canAdd && items.length > 0 && (
          <button onClick={onAdd} className="shrink-0 text-xs text-pine hover:underline">
            + 추가
          </button>
        )}
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : isError ? (
        <ErrorBlock onRetry={onRetry} />
      ) : (
        <>
          <div className="space-y-1.5">
            {items.map((event) => (
              <EventCard key={event.id} event={event} onSelect={onSelect} on={date} />
            ))}
          </div>

          {canAdd ? (
            // 비어 있을 때만이 아니라 항상 둔다. 그 날에 하나 더 얹는 일이 흔한데
            // 탭바의 + 로 열면 날짜가 비어 있어 다시 골라야 한다.
            <button
              onClick={onAdd}
              className={`w-full rounded-xl border border-dashed border-line bg-card text-sm
                          text-muted transition-colors hover:border-pine/50 hover:text-pine ${
                            items.length === 0 ? "py-8" : "mt-1.5 py-3"
                          }`}
            >
              {items.length === 0 ? "이 날은 비어 있어요 · 일정 추가" : "이 날에 일정 추가"}
            </button>
          ) : (
            items.length === 0 && (
              <p className="py-8 text-center text-sm text-muted">등록된 일정이 없어요</p>
            )
          )}
        </>
      )}
    </section>
  );
}
