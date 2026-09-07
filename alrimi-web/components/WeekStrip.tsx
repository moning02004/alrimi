"use client";

import { dayName, startOfDay, toISO, windowDays } from "@/lib/date";
import type { CalendarMap } from "@/types";

interface Props {
  /** 창의 첫 날 */
  start: Date;
  calendar: CalendarMap;
  onJumpTo: (iso: string) => void;
}

/**
 * 아래 목록과 **같은 창**을 그린다. 앞뒤로 넘기면 목록도 같이 넘어간다.
 *
 * 달력 주(월~일)로 그리면 오늘이 금요일일 때 월·화·수·목 네 칸이 목록 밖으로
 * 나간다. 점은 찍혀 있는데 아래에는 없는 날이 생겨서 스트립을 목록의 미리보기로
 * 읽을 수 없게 된다. 그래서 요일 고정이 아니라 창의 첫 날부터 굴린다.
 *
 * 창이 목록과 같으니 "선택"이 필요 없다. 눌렀을 때 하는 일도 그 날짜 줄로
 * 스크롤하는 것뿐이고, 일정이 없는 날은 아예 누를 수 없다 — 눌러도 아무 일도
 * 안 일어나는 칸을 만들지 않으려고.
 */
export function WeekStrip({ start, calendar, onJumpTo }: Props) {
  const days = windowDays(start);
  const todayISO = toISO(startOfDay(new Date()));

  return (
    <div>
      <div className="flex pt-2 text-center">
        {days.map((day) => {
          const iso = toISO(day);
          const isToday = iso === todayISO;
          const hasItems = (calendar[iso] ?? []).length > 0;

          return (
            <button
              key={iso}
              onClick={() => onJumpTo(iso)}
              disabled={!hasItems}
              aria-label={`${day.getMonth() + 1}월 ${day.getDate()}일${hasItems ? "" : " · 일정 없음"}`}
              className={`min-w-0 flex-1 rounded-xl py-1 ${isToday ? "bg-pine" : ""}`}
            >
              <span className={`block text-[11px] ${isToday ? "text-white/70" : "text-muted"}`}>
                {dayName(day)}
              </span>
              <span
                className={`mt-1 block text-sm ${
                  isToday ? "font-semibold text-white" : hasItems ? "" : "text-muted/50"
                }`}
              >
                {day.getDate()}
              </span>
              <span className="mt-1 flex h-3.5 items-center justify-center gap-0.5">
                {hasItems && (
                  // 오늘 칸은 배경이 파인이라 같은 색 점이 묻는다. 흰 점으로 뒤집는다.
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${isToday ? "bg-white" : "bg-pine"}`}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
