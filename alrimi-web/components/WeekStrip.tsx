"use client";

import { CalendarBands } from "./CalendarBands";
import { covers, layoutRow, type Limits } from "@/lib/calendar";
import { dayName, startOfDay, toISO, windowDays } from "@/lib/date";
import type { CalendarEvent } from "@/types";

/** 머리글 안이라 자리가 더 좁다 */
const LIMITS: Limits = { bands: 2, dots: 3 };

interface Props {
  /** 이 날이 속한 주를 그린다. 첫 날일 필요는 없다 — 주 시작일은 안에서 잡는다 */
  start: Date;
  events: CalendarEvent[];
  onJumpTo: (iso: string) => void;
  /**
   * 아래 목록이 이 날부터 그린다.
   *
   * 주간 목록은 오늘 앞을 잘라낸다(지난 일정이라 "지난 일정 보기" 로 넘긴다).
   * 그 날들은 여기 표시로는 남지만 스크롤해 갈 줄이 없으므로 누를 수 없어야 한다.
   */
  jumpFrom?: string;
}

/**
 * 달력 한 주(일~토)를 그린다. 아래 목록과 **같은 창**이라 앞뒤로 넘기면 목록도
 * 같이 넘어간다.
 *
 * 요일 자리가 고정이다 — 수요일 칸은 늘 세 번째다. 오늘부터 굴리면 오늘이 늘
 * 맨 왼쪽이라 "이번 주"가 날마다 다른 기간을 뜻하게 된다.
 *
 * 창이 목록과 같으니 "선택"이 필요 없다. 눌렀을 때 하는 일도 그 날짜 줄로
 * 스크롤하는 것뿐이고, 일정이 없는 날은 아예 누를 수 없다 — 눌러도 아무 일도
 * 안 일어나는 칸을 만들지 않으려고.
 *
 * 월간과 같은 띠를 쓴다. 주가 바뀌는 자리에서 여행이 끊겨 보이지 않도록, 창
 * 밖으로 이어지는 쪽은 끝을 각지게 둔다.
 */
export function WeekStrip({ start, events, onJumpTo, jumpFrom }: Props) {
  const days = windowDays(start);
  const todayISO = toISO(startOfDay(new Date()));
  const layout = layoutRow(days, events, LIMITS);

  return (
    <div className="relative">
      <div className="flex pt-2 text-center">
        {days.map((day) => {
          const iso = toISO(day);
          const isToday = iso === todayISO;
          const hasItems = events.some((event) => covers(event, iso));
          // 주 중반에는 이미 지난 날이 창 안에 들어온다. 띠만 흐리고 날짜가
          // 또렷하면 어디까지 지났는지가 두 곳에서 엇갈린다.
          const gone = iso < todayISO;

          return (
            <div key={iso} className="min-w-0 flex-1">
              <span className={`block text-[11px] ${gone ? "text-muted/50" : "text-muted"}`}>
                {dayName(day)}
              </span>
              <span className="mt-0.5 flex justify-center">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-sm ${
                    isToday
                      ? "bg-pine font-semibold text-white"
                      : gone
                        ? "text-muted/60"
                        : hasItems
                          ? ""
                          : "text-muted/50"
                  }`}
                >
                  {day.getDate()}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="pb-0.5 pt-1.5">
        <CalendarBands days={days} layout={layout} lanes={layout.bandLanes} />
      </div>

      {/* 과녁은 칸 전체다. 배경을 칠하지 않으므로 아래 띠를 덮지 않는다 */}
      <div className="absolute inset-0 flex">
        {days.map((day) => {
          const iso = toISO(day);
          const titles = events.filter((event) => covers(event, iso)).map((e) => e.title);
          // 아래에 줄이 있는 날만 누를 수 있다. 눌러도 아무 일도 안 일어나는
          // 칸을 만들지 않으려는 것이다.
          const jumpable = titles.length > 0 && (!jumpFrom || iso >= jumpFrom);

          return (
            <button
              key={iso}
              onClick={() => onJumpTo(iso)}
              disabled={!jumpable}
              aria-label={
                `${day.getMonth() + 1}월 ${day.getDate()}일` +
                (titles.length ? ` · ${titles.join(", ")}` : " · 일정 없음")
              }
              className="min-w-0 flex-1 rounded-xl transition-colors enabled:hover:bg-ink/5"
            />
          );
        })}
      </div>
    </div>
  );
}
