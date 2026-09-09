"use client";

import { CalendarBands } from "./CalendarBands";
import { covers, layoutRow, type Limits } from "@/lib/calendar";
import { monthGridDays, startOfDay, toISO, WEEK_DAYS } from "@/lib/date";
import type { CalendarEvent } from "@/types";

// 주간 창과 같이 일요일부터. 일요일이 맨 앞이라 붉은 칸도 첫 칸이다
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

/** 칸이 좁다. 이만큼까지만 그리고 나머지는 "+n" 으로 접는다 */
const LIMITS: Limits = { bands: 2, dots: 3 };

interface Props {
  anchor: Date;
  selected: string;
  events: CalendarEvent[];
  onPickDay: (iso: string) => void;
  /** PC 2단에서는 칸을 크게 쓴다 */
  size?: "sm" | "lg";
}

/**
 * 한 달.
 *
 * **며칠에 걸치는 일정은 칸을 가로지르는 띠**, 하루짜리는 점이다. 예전에는 둘 다
 * 점이었는데 그러면 사흘짜리 여행이 하루짜리 셋과 똑같이 보여서, 달력만 보고는
 * 이어진 일인지 알 수 없었다. 둘이 달라 보이는 것이 이 화면이 하는 말이다.
 *
 * 색은 공간을 말한다. 색만으로는 색약에서 안 읽히지만, 이 화면은 칸이 좁아
 * 이름을 넣을 자리가 없다. 눌러서 하루를 펼치면 딱지와 이름이 나온다.
 *
 * **고른 날은 칸 전체가 아니라 날짜에 동그라미로 표시한다.** 칸을 통째로 칠하면
 * 그 위에 놓인 띠가 배경색에 묻혀 어느 공간 일인지 못 읽는다.
 */
export function MonthGrid({ anchor, selected, events, onPickDay, size = "sm" }: Props) {
  const days = monthGridDays(anchor);
  const weeks = Array.from({ length: days.length / WEEK_DAYS }, (_, i) =>
    days.slice(i * WEEK_DAYS, (i + 1) * WEEK_DAYS),
  );
  const todayISO = toISO(startOfDay(new Date()));
  const month = anchor.getMonth();
  const big = size === "lg";

  /*
    띠 줄 수는 달 전체에서 가장 많이 쓴 주에 맞춘다. 주마다 필요한 만큼만 잡으면
    한 주에 여행이 하나 끼는 것만으로 그 줄만 키가 커져서, 달을 넘길 때 그리드가
    통째로 출렁인다.
  */
  const layouts = weeks.map((week) => layoutRow(week, events, LIMITS));
  const lanes = Math.max(0, ...layouts.map((row) => row.bandLanes));

  return (
    <div>
      <div className="grid grid-cols-7 pt-2 text-center text-[11px] text-muted">
        {DAY_NAMES.map((name, i) => (
          <span key={name} className={`py-1 ${i === 0 ? "text-red-400" : ""}`}>
            {name}
          </span>
        ))}
      </div>

      {weeks.map((week, i) => (
        <div key={toISO(week[0])} className="relative">
          {/* 보이는 것 — 날짜와 그 아래 표시 */}
          <div className={`grid grid-cols-7 text-center ${big ? "pt-1.5" : "pt-1"}`}>
            {week.map((day) => {
              const iso = toISO(day);
              const outside = day.getMonth() !== month;
              const isToday = iso === todayISO;
              const isSelected = iso === selected;

              return (
                <span key={iso} className="flex justify-center">
                  <span
                    className={`flex items-center justify-center rounded-full ${
                      big ? "h-7 w-7 text-[15px]" : "h-6 w-6 text-sm"
                    } ${
                      isSelected
                        ? "bg-pine font-semibold text-white"
                        : isToday
                          ? "bg-pinelt font-semibold text-pine"
                          : outside
                            ? "text-muted/40"
                            : ""
                    }`}
                  >
                    {day.getDate()}
                  </span>
                </span>
              );
            })}
          </div>

          <div className={big ? "pb-1.5 pt-1" : "pb-1 pt-0.5"}>
            <CalendarBands days={week} layout={layouts[i]} lanes={lanes} />
          </div>

          {/*
            누르는 자리는 줄 전체를 덮는 투명 버튼이다. 날짜 글자만 과녁으로 삼으면
            손가락으로 겨냥하기에 너무 작고, 배경을 칠하는 버튼으로 만들면 그 색이
            띠 위에 덮인다.
          */}
          <div className="absolute inset-0 grid grid-cols-7">
            {week.map((day) => {
              const iso = toISO(day);
              const titles = events.filter((event) => covers(event, iso)).map((e) => e.title);

              return (
                <button
                  key={iso}
                  onClick={() => onPickDay(iso)}
                  aria-pressed={iso === selected}
                  aria-label={
                    `${day.getMonth() + 1}월 ${day.getDate()}일` +
                    (titles.length ? ` · ${titles.join(", ")}` : "")
                  }
                  className="rounded-lg transition-colors hover:bg-ink/5"
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
