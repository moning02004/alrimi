"use client";

import {monthGridDays, startOfDay, toISO} from "@/lib/date";
import type {CalendarMap} from "@/types";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

interface Props {
    anchor: Date;
    selected: string;
    calendar: CalendarMap;
    onPickDay: (iso: string) => void;
}

/** 펼쳤을 때만 보인다. 딱지만 보이고 제목은 안 보이므로 아래 목록이 하루치로 바뀐다 */
export function MonthGrid({anchor, selected, calendar, onPickDay}: Props) {
    const days = monthGridDays(anchor);
    const todayISO = toISO(startOfDay(new Date()));
    const month = anchor.getMonth();

    return (
        <div>
            <div className="grid grid-cols-7 pt-2 text-center text-[11px] text-muted">
                {DAY_NAMES.map((name) => (
                    <span key={name} className="py-1">
            {name}
          </span>
                ))}
            </div>

            <div className="grid grid-cols-7 text-center">
                {days.map((day) => {
                    const iso = toISO(day);
                    const outside = day.getMonth() !== month;
                    const isToday = iso === todayISO;
                    const isSelected = iso === selected;
                    // 칸이 좁아 셋까지만. 색약에서 색은 안 읽히므로 머리글자를 그린다.
                    const isNotice = (calendar[iso] ?? []).length > 0

                    return (
                        <button
                            key={iso}
                            onClick={() => onPickDay(iso)}
                            aria-pressed={isSelected}
                            aria-label={`${day.getMonth() + 1}월 ${day.getDate()}일`}
                            className={`rounded-lg py-1 ${isSelected ? "bg-pine" : isToday ? "bg-pine/25" : ""}`}
                        >
              <span
                  className={`block text-sm ${
                      isSelected
                          ? "font-semibold text-white"
                          : outside
                              ? "text-muted/40"
                              : isToday
                                  ? "font-semibold text-pine"
                                  : ""
                  }`}
              >
                {day.getDate()}
              </span>
                            <span className="mt-1 flex h-3.5 items-center justify-center gap-0.5">
                {isNotice && <span className={`h-1.5 w-1.5 rounded-full 
                ${isSelected ? "bg-white ": "bg-pine" } `}></span>}
              </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
