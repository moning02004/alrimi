"use client";

import { CalendarBands } from "./CalendarBands";
import { MarkRunLabel } from "./MarkRunLabel";
import { covers, layoutRow, type Limits } from "@/lib/calendar";
import { dayName, startOfDay, toISO, windowDays } from "@/lib/date";
import {
  allNames,
  filledCircle,
  leadMark,
  markRuns,
  markText,
  type MarkMap,
} from "@/lib/marks";
import type { CalendarEvent } from "@/types";

/** 머리글 안이라 자리가 더 좁다 */
const LIMITS: Limits = { bands: 2, dots: 3 };

interface Props {
  /** 이 날이 속한 주를 그린다. 첫 날일 필요는 없다 — 주 시작일은 안에서 잡는다 */
  start: Date;
  events: CalendarEvent[];
  /** 날짜 → 그 날의 특일 표시. 색은 보는 사람이 정한 것이 이미 얹혀 있다 */
  marks?: MarkMap;
  onJumpTo: (iso: string) => void;
  /**
   * 아래 목록이 이 날부터 그린다.
   *
   * 주간 목록은 오늘 앞을 잘라낸다(지난 일정이라 "지난 일정/보류 보기" 로 넘긴다).
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
export function WeekStrip({ start, events, marks = {}, onJumpTo, jumpFrom }: Props) {
  const days = windowDays(start);
  const isos = days.map(toISO);
  const todayISO = toISO(startOfDay(new Date()));
  const layout = layoutRow(days, events, LIMITS);

  /*
    이어지는 연휴는 한 덩이다. 추석 사흘에 "추석 추석 추석" 을 적지 않고 가운데
    한 번만 적는다 — 월간 그리드도 같은 계산을 쓴다(`lib/marks.ts` markRuns).
  */
  const runs = markRuns(isos, marks);

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
          // 겹친 날(추분이 추석과 겹치는 해가 있다)은 맨 앞 하나가 칸을 대표한다
          const mark = leadMark(marks[iso]);

          /*
            이 칸의 칠. **오늘이 특일이면 동그라미도 그 색으로 찬다** — 초록으로만
            채우면 하필 오늘 자리에서 무슨 날인지가 지워진다.

            여기 오늘이 꽉 찬 동그라미인 것은, 주간 스트립에는 "고른 날" 이 없어
            오늘이 곧 이 줄의 표시라서다(월간은 고른 날이 꽉 차고 오늘은 옅다).
          */
          const paint = isToday ? filledCircle(mark) : mark ? markText(mark, gone) : null;

          return (
            <div key={iso} className="min-w-0 flex-1">
              <span className={`block text-[11px] ${gone ? "text-muted/50" : "text-muted"}`}>
                {dayName(day)}
              </span>
              <span className="mt-0.5 flex justify-center">
                <span
                  /*
                    특일은 **굵다**(위 `paint`). 색만으로는 안 된다 — 이만한 크기의
                    숫자에서 색은 잘 갈리지 않고, 애초에 무슨 색일지는 보는 사람이
                    정해서 먹색일 수도 있다. 굵기는 색과 상관없는 둘째 신호다.

                    지난 날은 특일이어도 같이 흐려진다. 여기서 흐림이 말하는 것은
                    "이미 지났다" 이고, 그 말은 무슨 날이든 그대로 맞다.
                  */
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-sm ${
                    paint?.className ??
                    (gone ? "text-muted/60" : hasItems ? "" : "text-muted/50")
                  }`}
                  style={paint?.style}
                >
                  {day.getDate()}
                </span>
              </span>

            </div>
          );
        })}
      </div>

      {/*
        특일 이름. **칸이 아니라 덩이마다 하나씩**, 그 덩이 한가운데에. 추석
        사흘이면 세 칸을 가로질러 가운데에 "추석" 하나다.

        날짜 줄 바로 아래이고 띠보다 위다 — 월간 그리드도 같은 자리에 같은 것을
        둔다. 두 달력이 어긋나면 한쪽을 고칠 때 다른 쪽이 따라오지 않는다.
        띠를 그리는 칸에 두지 않는 까닭도 같다: 그 칸은 일정이 차지하는 자리이고,
        특일은 그 날에 잡힌 일이 아니라 그 날의 성격이다.

        `grid grid-cols-7` 은 아래 `CalendarBands` 와 같은 자다. 위의 날짜 줄은
        flex 지만 둘 다 일곱 등분이라 세로줄이 맞는다.
      */}
      {runs.length > 0 && (
        <div className="grid grid-cols-7 pt-0.5 text-center">
          {runs.map((run) => (
            <MarkRunLabel
              key={run.days[0]}
              run={run}
              title={allNames(marks[run.days[0]])}
              // 덩이가 온통 지난 날일 때만 흐리게. 오늘에 걸쳐 있으면 또렷이 둔다.
              dim={run.days.every((day) => day < todayISO)}
              textCls="text-[9px]"
            />
          ))}
        </div>
      )}

      <div className="pb-0.5 pt-1.5">
        <CalendarBands days={days} layout={layout} lanes={layout.bandLanes} />
      </div>

      {/* 과녁은 칸 전체다. 배경을 칠하지 않으므로 아래 띠를 덮지 않는다 */}
      <div className="absolute inset-0 flex">
        {days.map((day) => {
          const iso = toISO(day);
          const isToday = iso === todayISO;
          const titles = events.filter((event) => covers(event, iso)).map((e) => e.title);
          // 아래에 줄이 있는 날만 누를 수 있다. 눌러도 아무 일도 안 일어나는
          // 칸을 만들지 않으려는 것이다.
          //
          // 오늘만은 비어 있어도 누를 수 있다 — 아래 목록이 오늘 칸을 비어 있어도
          // 그리기 때문이다(lib/date.ts `ensure`). 갈 줄이 있는데 막아두면,
          // 하필 오늘 자리에서만 탭이 안 먹는다.
          const jumpable = (titles.length > 0 || isToday) && (!jumpFrom || iso >= jumpFrom);

          return (
            <button
              key={iso}
              onClick={() => onJumpTo(iso)}
              disabled={!jumpable}
              aria-label={
                `${day.getMonth() + 1}월 ${day.getDate()}일` +
                // 색은 낭독기에 읽히지 않는다. 이름을 넣어야 무슨 날인지 안다.
                (allNames(marks[iso]) ? ` · ${allNames(marks[iso])}` : "") +
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
