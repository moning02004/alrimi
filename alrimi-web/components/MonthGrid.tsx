"use client";

import { CalendarBands } from "./CalendarBands";
import { MarkRunLabel } from "./MarkRunLabel";
import { covers, layoutRow, type Limits } from "@/lib/calendar";
import { monthGridDays, startOfDay, toDate, toISO, WEEK_DAYS } from "@/lib/date";
import {
  allNames,
  filledCircle,
  leadMark,
  markRuns,
  markText,
  tintedCircle,
  type MarkMap,
} from "@/lib/marks";
import type { CalendarEvent } from "@/types";

// 주간 창과 같이 일요일부터. 일요일이 맨 앞이라 붉은 칸도 첫 칸이다
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

/** 칸이 좁다. 이만큼까지만 그리고 나머지는 "+n" 으로 접는다 */
const LIMITS: Limits = { bands: 2, dots: 3 };

interface Props {
  anchor: Date;
  selected: string;
  events: CalendarEvent[];
  /**
   * 날짜 → 그 날의 특일 표시(공휴일·절기·기념일). 운영이 넣는 자료라 사용자
   * 일정과 섞이지 않고, 색은 보는 사람이 정한 것이 이미 얹혀 있다.
   */
  marks?: MarkMap;
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
export function MonthGrid({
  anchor,
  selected,
  events,
  marks = {},
  onPickDay,
  size = "sm",
}: Props) {
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

      {weeks.map((week, i) => {
        const isos = week.map(toISO);
        /*
          이어지는 연휴는 한 덩이다. 추석 사흘에 "추석 추석 추석" 을 적지 않고
          가운데 한 번만 적는다 — 종이 달력이 그렇게 적는다(`lib/marks.ts`).
        */
        const runs = markRuns(isos, marks);

        return (
        <div key={isos[0]} className="relative">
          {/* 보이는 것 — 날짜와 그 아래 표시 */}
          <div className={`grid grid-cols-7 text-center ${big ? "pt-1.5" : "pt-1"}`}>
            {week.map((day) => {
              const iso = toISO(day);
              const outside = day.getMonth() !== month;
              const isToday = iso === todayISO;
              const isSelected = iso === selected;
              // 겹친 날(추분이 추석과 겹치는 해가 있다)은 맨 앞 하나가 칸을 대표한다
              const mark = leadMark(marks[iso]);

              /*
                이 칸의 칠. **고른 날은 그 특일 색으로 찬다** — 고른 날이 추석인데
                동그라미만 초록이면 그 칸에서 "무슨 날인지" 가 지워진다.

                셋 다 아니면 `null` 이라, 아래에서 여느 날의 옷을 그대로 입는다.
                색이 클래스가 아니라 `style` 로 가는 까닭은 `lib/marks.ts` 참고 —
                보는 사람이 고른 값이라 Tailwind 가 미리 뽑아둘 수가 없다.
              */
              const paint = isSelected
                ? filledCircle(mark)
                : isToday
                  ? tintedCircle(mark)
                  : mark
                    ? markText(mark, outside)
                    : null;

              return (
                <span key={iso} className="flex min-w-0 flex-col items-center">
                  <span
                    className={`flex items-center justify-center rounded-full ${
                      big ? "h-7 w-7 text-[15px]" : "h-6 w-6 text-sm"
                    } ${
                      /*
                        특일은 **굵다**(위 `paint`). 색만으로는 안 된다 — 이만한
                        크기의 숫자에서 색은 잘 갈리지 않고, 애초에 무슨 색일지는
                        보는 사람이 정해서 먹색일 수도 있다. 굵기는 색과 상관없는
                        둘째 신호라, 색이 안 읽히는 눈에도 "여느 날이 아니다" 가 남는다.
                      */
                      paint?.className ?? (outside ? "text-muted/40" : "")
                    }`}
                    style={paint?.style}
                  >
                    {day.getDate()}
                  </span>

                </span>
              );
            })}
          </div>

          {/*
            특일 이름. **칸이 아니라 덩이마다 하나씩**, 그 덩이 한가운데에 놓는다.
            추석 사흘이면 세 칸을 가로질러 가운데에 "추석" 하나고, 양옆 가는 선이
            어디서 어디까지인지를 보여준다(`MarkRunLabel`).

            있는 주에만 그린다 — 빈 줄로 자리를 잡아두면 특일 없는 주마다 빈 줄이
            하나씩 남아 달의 대부분이 까닭 없이 벌어져 보인다.

            칸이 좁아(폰에서 48px 남짓) 한 칸짜리 "대체공휴일" 은 잘린다. 자르는
            편이 줄바꿈보다 낫다 — 두 줄이 되면 그 주만 키가 커진다. 잘린 이름과
            겹친 날의 나머지 이름은 마우스 설명과, 날짜를 눌러 펼친 하루 보기가 받는다.
          */}
          {runs.length > 0 && (
            <div className="grid grid-cols-7 text-center">
              {runs.map((run) => (
                <MarkRunLabel
                  key={run.days[0]}
                  run={run}
                  title={allNames(marks[run.days[0]])}
                  // 덩이가 온통 이 달 밖일 때만 흐리게. 걸쳐 있으면 또렷이 둔다.
                  dim={run.days.every((day) => toDate(day).getMonth() !== month)}
                  textCls={big ? "text-[10px]" : "text-[9px]"}
                />
              ))}
            </div>
          )}

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
              // 색은 낭독기에 읽히지 않는다. 이름을 넣어야 무슨 날인지 안다.
              const names = allNames(marks[iso]);

              return (
                <button
                  key={iso}
                  onClick={() => onPickDay(iso)}
                  aria-pressed={iso === selected}
                  aria-label={
                    `${day.getMonth() + 1}월 ${day.getDate()}일` +
                    (names ? ` · ${names}` : "") +
                    (titles.length ? ` · ${titles.join(", ")}` : "")
                  }
                  className="rounded-lg transition-colors hover:bg-ink/5"
                />
              );
            })}
          </div>
        </div>
        );
      })}
    </div>
  );
}
