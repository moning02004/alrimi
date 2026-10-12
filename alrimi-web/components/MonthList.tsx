"use client";

import { useEffect, useRef } from "react";
import { CenteredDialog } from "./BottomSheet";
import { ErrorBlock, LoadingBlock } from "./Loading";
import { ZoneMark } from "./ZoneMark";
import { useEventsInRange } from "@/hooks/useEvents";
import { useZoneMark } from "@/hooks/useZones";
import { dayName, groupByDate, hourLabel, spanDays, startOfDay, toDate, toISO } from "@/lib/date";
import type { ZoneScope } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "2026년 10월 일정" */
  title: string;
  /** 그 달의 1일과 말일 (YYYY-MM-DD) */
  from: string;
  to: string;
  scope: ZoneScope;
  /** 달력에서 고른 날. 열면 이 날 언저리부터 보인다 */
  selected: string;
  /** 줄을 누르면 그 날의 하루 보기로 옮겨간다. 닫는 것도 받는 쪽이 한다 */
  onPick: (iso: string) => void;
}

/** "10/3". 좁은 줄 끝에 붙는 기간이라 짧게 */
const shortDate = (iso: string) => {
  const d = toDate(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/**
 * 한 달의 일정을 날짜와 제목으로만 적은 창.
 *
 * 월간 달력은 어느 날에 뭔가 있는지만 말하고, 하루 보기는 한 날만 보여준다. 그 달에
 * 무엇이 있는지 훑으려면 날짜를 하나씩 눌러봐야 했다.
 *
 * **폰에서도 가운데 창이다**(`CenteredDialog`). 아래에서 올라오는 시트는 무언가를 적는
 * 자리의 것이고, 이것은 훑어보는 목록이다.
 *
 * **카드가 아니라 한 줄이다.** 완료 동그라미도 알림 점도 없다 — 한 화면에 많이
 * 들어오는 것이 먼저다. 줄을 누르면 창이 닫히고 그 날의 하루 보기로 옮겨가며, 고치고
 * 완료하는 것은 거기 있는 카드가 한다(`UpcomingList` 와 같은 약속이다).
 *
 * 며칠짜리는 걸치는 날마다가 아니라 **한 번만** 적고 기간을 뒤에 붙인다.
 * 완료·취소한 것도 뺀 것 없이 다 나온다 — 그 달에 무엇이 있었는지를 보는 자리다.
 */
export function MonthList({ open, onOpenChange, title, from, to, scope, selected, onPick }: Props) {
  // 열기 전에는 받지 않는다. 달을 넘길 때마다 쓰지도 않을 한 달치를 받게 된다
  const { data, isLoading, isError, refetch } = useEventsInRange(from, to, scope, open);
  const markOf = useZoneMark();
  const groups = groupByDate(data ?? [], { from, to, once: true });
  const today = toISO(startOfDay(new Date()));

  /*
    열면 고른 날(없으면 그 다음으로 일정이 있는 날)이 맨 위에 온다. 달 중순에 열었는데
    1일부터 시작하면 이미 지난 날들을 매번 밀어 올려야 한다.
  */
  const startAt = groups.find((group) => group.iso >= selected)?.iso;
  const startRef = useRef<HTMLElement>(null);
  const loaded = data !== undefined;
  useEffect(() => {
    if (open && loaded) startRef.current?.scrollIntoView({ block: "start" });
    // 고른 날이 바뀌는 것은 이 창을 닫으면서라, 열 때와 다 받았을 때만 맞춘다
  }, [open, loaded]);

  return (
    <CenteredDialog open={open} onOpenChange={onOpenChange} title={title}>
      {isLoading ? (
        <LoadingBlock />
      ) : isError ? (
        <ErrorBlock onRetry={() => refetch()} />
      ) : groups.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">이 달에는 일정이 없어요</p>
      ) : (
        <div className="rounded-2xl bg-card shadow-card px-1">
          {groups.map((group) => {
            const day = toDate(group.iso);

            return (
              <section
                key={group.iso}
                ref={group.iso === startAt ? startRef : undefined}
                className="flex gap-1 border-t border-line py-1.5 first:border-t-0"
              >
                {/* 날짜는 그 날의 첫 줄 옆에 한 번만 선다 */}
                <p
                  className={`w-16 shrink-0 py-2 pl-3 text-[13px] font-medium tabular-nums ${
                    group.iso === today ? "font-semibold text-pine" : "text-muted"
                  }`}
                >
                  {day.getDate()}일 {dayName(day)}
                </p>

                <ul className="min-w-0 flex-1">
                  {group.items.map((event) => {
                    const zone = markOf(event.zone_id);
                    const canceled = Boolean(event.canceled_at);
                    const finished = canceled || Boolean(event.completed_at);
                    const span = spanDays(event.event_date, event.end_date);

                    return (
                      <li key={event.id}>
                        <button
                          type="button"
                          onClick={() => onPick(group.iso)}
                          className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left
                                      transition-colors hover:bg-paper ${finished ? "opacity-55" : ""}`}
                        >
                          <ZoneMark
                            mark={zone?.mark ?? ""}
                            color={zone?.color ?? event.zone_color}
                            name={zone?.label}
                            size="sm"
                          />
                          {event.event_hour !== null && (
                            <span className="shrink-0 text-xs tabular-nums text-muted">
                              {hourLabel(event.event_hour)}
                            </span>
                          )}
                          <span className={`min-w-0 flex-1 truncate text-sm ${canceled ? "line-through" : ""}`}>
                            {event.title}
                          </span>
                          {span > 1 && (
                            <span className="shrink-0 text-[11px] tabular-nums text-muted">
                              {shortDate(event.event_date)}–{shortDate(event.end_date)}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </CenteredDialog>
  );
}
