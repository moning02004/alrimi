"use client";

import {monthGridDays, startOfDay, toISO} from "@/lib/date";
import type {CalendarMap} from "@/types";

// 주간 창과 같이 월요일부터. 일요일이 맨 끝이라 붉은 칸도 마지막이다
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

/** 칸이 좁다. 넷 이상이면 세 개까지만 찍고 나머지는 "+n" 으로 접는다 */
const MAX_DOTS = 3;

interface Props {
    anchor: Date;
    selected: string;
    calendar: CalendarMap;
    onPickDay: (iso: string) => void;
    /** PC 2단에서는 칸을 크게 쓴다 */
    size?: "sm" | "lg";
}

/**
 * 한 달. 점은 그 날 일정이 있는 **공간의 색**이다 — 개수가 아니라 어느 공간
 * 일인지를 말한다. 색만으로는 색약에서 안 읽히지만, 이 화면은 칸이 좁아
 * 머리글자를 넣을 자리가 없다. 눌러서 하루를 펼치면 딱지와 이름이 나온다.
 */
export function MonthGrid({anchor, selected, calendar, onPickDay, size = "sm"}: Props) {
    const days = monthGridDays(anchor);
    const todayISO = toISO(startOfDay(new Date()));
    const month = anchor.getMonth();
    const big = size === "lg";

    return (
        <div>
            <div className="grid grid-cols-7 pt-2 text-center text-[11px] text-muted">
                {DAY_NAMES.map((name, i) => (
                    <span key={name} className={`py-1 ${i === 0 ? "text-red-400" : ""}`}>
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
                    const zones = calendar[iso] ?? [];
                    const shown = zones.slice(0, MAX_DOTS);

                    return (
                        <button
                            key={iso}
                            onClick={() => onPickDay(iso)}
                            aria-pressed={isSelected}
                            aria-label={`${day.getMonth() + 1}월 ${day.getDate()}일${
                                zones.length ? ` · 일정 ${zones.length}건` : ""
                            }`}
                            className={`rounded-lg transition-colors ${big ? "py-2" : "py-1"} ${
                                isSelected
                                    ? "bg-pine"
                                    : isToday
                                        ? "bg-pinelt hover:bg-pinelt"
                                        : "hover:bg-paper"
                            }`}
                        >
              <span
                  className={`block ${big ? "text-[15px]" : "text-sm"} ${
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
                {shown.map((z, i) => (
                    <span
                        key={`${z.zone}-${i}`}
                        className="h-1.5 w-1.5 rounded-full"
                        // 고른 칸은 배경이 파인이라 공간 색이 묻힌다. 흰 점으로 뒤집는다.
                        style={{background: isSelected ? "#fff" : z.color}}
                    />
                ))}
                                {zones.length > MAX_DOTS && (
                                    <span
                                        className={`text-[9px] leading-none ${
                                            isSelected ? "text-white/80" : "text-muted"
                                        }`}
                                    >
                    +{zones.length - MAX_DOTS}
                  </span>
                                )}
              </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
