"use client";

import { useNotices } from "@/hooks/useNotices";
import { useZoneMark } from "@/hooks/useZones";
import { ZoneMark } from "./ZoneMark";
import { hourLabel, sectionLabel, spanDays, toDate, toISO } from "@/lib/date";

/** 좁은 칸이라 짧게. 가까운 날은 "오늘"·"내일", 나머지는 9/12 꼴 */
function when(iso: string) {
  const label = sectionLabel(iso);
  if (label.includes(" · ")) return label.split(" · ")[0];
  const d = toDate(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 언제인지 한 조각으로. 며칠에 걸치는 일정은 시작일만 적으면 어제 떠난 여행이
 * "다가오는 일정"에 어제 날짜로 앉아 있게 된다. 이미 시작했으면 그렇게 말한다.
 */
function whenSpan(start: string, end: string) {
  const span = spanDays(start, end);
  if (span < 2) return when(start);

  const today = toISO(new Date());
  if (start <= today && today <= end) return `진행 중 · ${span}일`;
  return `${when(start)}~ ${span}일`;
}

/**
 * 달력 아래 붙는 "다가오는 일정". PC 2단에서만 쓴다.
 *
 * 달력은 어느 날에 뭔가 있는지는 알려주지만 그게 무엇인지는 눌러봐야 안다.
 * 며칠 안에 뭐가 있는지 한눈에 훑는 자리가 따로 있어야 달력을 헤집지 않는다.
 *
 * 누르면 그 날로 옮겨간다 — 오른쪽 칸이 그 하루로 바뀐다.
 */
export function UpcomingList({
  zoneId,
  onPick,
  selected,
}: {
  zoneId: number | null;
  onPick: (iso: string) => void;
  selected: string;
}) {
  // 서버의 `upcoming` 은 오늘부터 7일. 완료한 것은 빠져서 "아직 남은 것"만 온다.
  const { data, isLoading, isError, refetch } = useNotices("upcoming", zoneId);
  const markOf = useZoneMark();
  const items = data ?? [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <p className="px-1 pb-2 text-xs font-medium text-muted">다가오는 일정</p>

      {isLoading ? (
        <p className="px-1 text-xs text-muted">불러오는 중</p>
      ) : isError ? (
        <button
          onClick={() => refetch()}
          className="px-1 text-left text-xs text-red-600 hover:underline"
        >
          불러오지 못했어요 · 다시 시도
        </button>
      ) : items.length === 0 ? (
        <p className="px-1 text-xs text-muted">앞으로 일주일은 비어 있어요</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((notice) => {
            const zone = markOf(notice.zone_id);
            const on = notice.event_date === selected;

            return (
              <li key={notice.id}>
                <button
                  onClick={() => onPick(notice.event_date)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left
                              transition-colors ${on ? "bg-pinelt" : "hover:bg-card"}`}
                >
                  <ZoneMark
                    mark={zone?.mark ?? ""}
                    color={zone?.color ?? notice.zone_color}
                    name={zone?.name}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{notice.title}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted">
                    {whenSpan(notice.event_date, notice.end_date)}
                    {notice.event_hour !== null && ` ${hourLabel(notice.event_hour)}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
