/**
 * 달력 한 줄(7칸)에 일정을 눕히는 계산.
 *
 * **여러 날짜리만 띠고, 하루짜리는 점이다.** 며칠에 걸치는 일정은 한 건이라 칸을
 * 가로지르는 막대 하나로 그려야 이어진 일인 줄 안다. 반대로 하루짜리까지 층으로
 * 쌓으면 — 같은 날 세 건이면 점이 세로로 셋 — 칸이 잘게 나뉘어 무엇이 이어지는
 * 것이고 무엇이 하루인지가 도로 안 보인다. 그래서 점은 예전처럼 **한 줄에 나란히**
 * 둔다. 세로로 자리를 다투는 것은 띠뿐이다.
 *
 * 그리는 일과 자리를 잡는 일을 나눠둔다 — 자리 잡기는 순수한 계산이라 화면 없이
 * 시험할 수 있고, 주간 스트립과 월간 그리드가 같은 계산을 쓴다.
 */

import { toISO } from "./date";
import type { CalendarEvent } from "@/types";

/** 한 줄 안에 놓인 띠 하나. 줄 밖으로 이어지는 쪽은 `clipped` 로 표시된다 */
export interface Band {
  event: CalendarEvent;
  /** 이 줄에서 시작하는 칸 (0 = 맨 왼쪽) */
  col: number;
  /** 덮는 칸 수 (1 이상) */
  span: number;
  /** 왼쪽이 이 줄보다 앞에서 시작했는가 — 끝을 각지게 잘라 이어짐을 보인다 */
  clippedStart: boolean;
  /** 오른쪽이 이 줄보다 뒤까지 가는가 */
  clippedEnd: boolean;
  /** 몇 번째 줄에 눕는가 (0 = 맨 위) */
  lane: number;
}

export interface RowLayout {
  /** 여러 날짜리. 겹치지 않게 층으로 쌓인다 */
  bands: Band[];
  /** 실제로 쓰인 띠 줄 수 */
  bandLanes: number;
  /** 날짜(ISO) → 그 날 하루짜리들. 점 한 줄에 나란히 찍는다 */
  dots: Record<string, CalendarEvent[]>;
  /** 날짜(ISO) → 자리가 모자라 못 그린 개수. "+n" 으로 접어서 알린다 */
  hidden: Record<string, number>;
}

export interface Limits {
  /** 띠를 이만큼 줄까지만 쌓는다 */
  bands: number;
  /** 점을 한 줄에 이만큼까지만 찍는다 */
  dots: number;
}

/** 일정이 지금 어떤 상태로 보여야 하는가 */
export type Tone = "normal" | "past" | "done";

/**
 * 지난 일정은 흐리게, 완료한 것은 색을 잃는다.
 *
 * 둘을 같은 흐림으로 그리면 "아직 안 치웠는데 지나간 것"이 눈에 안 든다 —
 * 지난 주를 훑는 이유가 대개 그것이다. 아직 진행 중인 일정은 시작일이 지났어도
 * 흐리지 않다. 끝난 날을 기준으로 본다.
 */
export function toneOf(event: CalendarEvent, todayISO: string): Tone {
  if (event.completed) return "done";
  return (event.end_date || event.event_date) < todayISO ? "past" : "normal";
}

/** 그 일정이 이 날에 걸치는가 */
export const covers = (event: CalendarEvent, iso: string) =>
  event.event_date <= iso && iso <= (event.end_date || event.event_date);

/** 며칠에 걸치는가 — 하루짜리는 점, 그 밖은 띠다 */
const spans = (event: CalendarEvent) => (event.end_date || event.event_date) > event.event_date;

/**
 * 한 줄에 놓인 일정들의 자리를 잡는다.
 *
 * 띠는 긴 것이 먼저 위 줄을 잡는다(서버도 그 순서로 준다). 짧은 것이 위에 앉으면
 * 긴 띠가 그 아래에서 여러 줄로 꺾여 보여서, 같은 일정인데 층이 달라진다.
 *
 * 한도를 넘는 것은 그리지 않고 그 날의 `hidden` 으로 센다. 칸이 좁아 무한정 쌓을
 * 수 없는데, 그렇다고 조용히 버리면 달력에 없는 일정이 생긴다.
 */
export function layoutRow(days: Date[], events: CalendarEvent[], limits: Limits): RowLayout {
  const isos = days.map(toISO);
  const first = isos[0];
  const last = isos[isos.length - 1];

  const inWindow = events
    .filter((event) => event.event_date <= last && (event.end_date || event.event_date) >= first)
    // 서버가 이미 이 순서로 주지만, 캐시에 섞인 옛 응답이 와도 층이 흔들리지
    // 않도록 여기서 한 번 더 세운다.
    .sort((a, b) => {
      const end = (e: CalendarEvent) => e.end_date || e.event_date;
      return (
        a.event_date.localeCompare(b.event_date) ||
        end(b).localeCompare(end(a)) ||
        a.id - b.id
      );
    });

  // 줄마다 "여기까지 찼다"를 칸 번호로 들고 있는다. -1 은 빈 줄이다.
  const filledTo: number[] = [];
  const bands: Band[] = [];
  const dots: Record<string, CalendarEvent[]> = {};
  const hidden: Record<string, number> = {};
  const fold = (from: number, to: number) => {
    for (let i = from; i <= to; i += 1) hidden[isos[i]] = (hidden[isos[i]] ?? 0) + 1;
  };

  for (const event of inWindow) {
    const end = event.end_date || event.event_date;
    const col = Math.max(isos.indexOf(clamp(event.event_date, first, last)), 0);
    const endCol = isos.indexOf(clamp(end, first, last));

    if (!spans(event)) {
      const day = isos[col];
      const room = dots[day] ?? (dots[day] = []);
      if (room.length < limits.dots) room.push(event);
      else fold(col, col);
      continue;
    }

    let lane = filledTo.findIndex((until) => until < col);
    if (lane === -1) {
      lane = filledTo.length;
      filledTo.push(-1);
    }

    if (lane >= limits.bands) {
      fold(col, endCol);
      continue;
    }

    filledTo[lane] = endCol;
    bands.push({
      event,
      col,
      span: endCol - col + 1,
      clippedStart: event.event_date < first,
      clippedEnd: end > last,
      lane,
    });
  }

  return { bands, bandLanes: Math.min(filledTo.length, limits.bands), dots, hidden };
}

const clamp = (value: string, low: string, high: string) =>
  value < low ? low : value > high ? high : value;
