import type { CSSProperties } from "react";
import { addDays, toDate, toISO } from "./date";
import type { MarkKind, MarkStyle, SpecialDay } from "@/types";

/**
 * 달력 한 칸에 찍힐 표시 하나. 자료(`SpecialDay`)에 보는 사람의 색을 얹은 것이다.
 */
export interface DayMark {
  kind: MarkKind;
  name: string;
  color: string;
}

/** 날짜(ISO) → 그 날의 표시들. 없는 날은 키 자체가 없다 */
export type MarkMap = Record<string, DayMark[]>;

/**
 * 종류 사이의 서열. 한 날에 둘이 겹칠 때(추분이 추석과 겹치는 해가 있다) 날짜
 * 숫자를 무슨 색으로 칠할지, 좁은 칸에 어느 이름을 적을지가 이 순서로 정해진다.
 *
 * 공휴일이 앞인 것은 그것만이 "쉬는 날" 이라는, 하루의 쓰임을 바꾸는 정보라서다.
 * 서버도 같은 순서를 쓴다 (`special_days/models.py` KIND_ORDER) — 한쪽만 바꾸면
 * 설정 화면의 줄 순서와 달력이 고르는 순서가 어긋난다.
 */
const ORDER: MarkKind[] = ["holiday", "term"];

/**
 * 받아온 특일에 보는 사람의 색을 얹어 날짜별로 묶는다.
 *
 * 색을 못 찾은 종류는 그리지 않는다. 설정이 아직 안 왔을 때와, 서버에 옛 종류가
 * 남아 있을 때가 그렇다 — 어느 쪽이든 아무 색으로나 그려두는 것보다 낫다.
 *
 * 같은 날에 여럿이면 `ORDER` 순으로 세운다. 좁은 칸은 맨 앞 하나만 쓴다.
 */
export function buildMarks(days: SpecialDay[], styles: MarkStyle[]): MarkMap {
  const byKind = new Map(styles.map((style) => [style.kind, style]));
  const marks: MarkMap = {};

  for (const day of days) {
    const style = byKind.get(day.kind);
    // 설정이 늦게 오는 동안 잠깐 안 보이는 편이, 기본 색으로 그렸다가 색이
    // 튀는 것보다 낫다.
    if (!style) continue;

    (marks[day.date] ??= []).push({ kind: day.kind, name: day.name, color: style.color });
  }

  for (const list of Object.values(marks)) {
    list.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  }
  return marks;
}

/**
 * 좁은 칸이 쓰는 값 — 색 하나와 이름 하나. 둘 다 맨 앞 표시에서 온다.
 *
 * 겹친 날에 이름을 다 적을 자리는 없다(달력 한 칸이 48px 남짓이다). 나머지는
 * `title`·`aria-label` 이 받는다 — `allNames` 참고.
 */
export const leadMark = (marks: DayMark[] | undefined) => marks?.[0];

/** 겹친 것까지 전부. 마우스 설명과 낭독기에 쓴다 — 색은 그쪽에 안 읽힌다 */
export const allNames = (marks: DayMark[] | undefined) =>
  marks?.map((mark) => mark.name).join(" · ") ?? "";

/* ────────────────────────────────────────────────────────────────────
   이어지는 연휴를 한 덩이로

   설·추석은 사흘이고, 특일 정보 API 는 그 사흘을 **각각 "추석"** 으로 준다.
   칸마다 곧이곧대로 적으면 "추석 추석 추석" 이 되는데, 종이 달력은 그렇게 적지
   않는다 — 이어진 며칠은 한 번만 적고 가운데 놓는다. 이 앱의 여러 날짜리 일정을
   띠 하나로 긋는 것과도 같은 생각이다(`lib/calendar.ts`).
   ──────────────────────────────────────────────────────────────────── */

/** 한 줄(일~토) 안에서 이어지는 같은 표시의 덩이 */
export interface MarkRun {
  /** 덩이를 대표하는 표시. 이어지는 동안 이름도 색도 같다 */
    mark: DayMark;
  /** 이 줄에서 시작하는 칸 (0 = 맨 왼쪽) */
  col: number;
  /** 덮는 칸 수 (1 이상) */
  span: number;
  /** 이 줄에서 덮는 날들(ISO). 흐리게 그릴지는 부르는 쪽이 판단한다 */
  days: string[];
  /** 앞 줄에서 이어져 왔는가 — 끝을 각지게 잘라 이어짐을 보인다 */
  clippedStart: boolean;
  /** 뒤 줄로 이어지는가 */
  clippedEnd: boolean;
}

const same = (a: DayMark | undefined, b: DayMark) =>
  a !== undefined && a.kind === b.kind && a.name === b.name;

const shift = (iso: string, by: number) => toISO(addDays(toDate(iso), by));

/**
 * 한 줄에 놓인 표시들을 이어지는 덩이로 묶는다.
 *
 * **이름과 종류가 같고 날이 맞붙어야 한 덩이다.** 추석 사흘은 하나가 되지만,
 * 개천절과 한글날은 같은 공휴일이어도 이름이 달라 따로 선다.
 *
 * 줄 밖으로 이어지는지도 함께 본다(`clippedStart`·`clippedEnd`). 연휴가 주를
 * 넘어가면 이름은 **주마다 한 번씩** 적힌다 — 뒷주에 이름이 없으면 빨간 숫자만
 * 덩그러니 남아 무슨 날인지 알 수 없다.
 */
export function markRuns(week: string[], marks: MarkMap): MarkRun[] {
  const runs: MarkRun[] = [];

  for (let i = 0; i < week.length; ) {
    const mark = leadMark(marks[week[i]]);
    if (!mark) {
      i += 1;
      continue;
    }

    let end = i;
    while (end + 1 < week.length && same(leadMark(marks[week[end + 1]]), mark)) end += 1;

    runs.push({
      mark,
      col: i,
      span: end - i + 1,
      days: week.slice(i, end + 1),
      clippedStart: same(leadMark(marks[shift(week[i], -1)]), mark),
      clippedEnd: same(leadMark(marks[shift(week[end], 1)]), mark),
    });
    i = end + 1;
  }

  return runs;
}

/* ────────────────────────────────────────────────────────────────────
   날짜 동그라미의 칠

   **Tailwind 로는 못 한다.** `bg-[${mark.color}]` 처럼 적으면 클래스가 아예
   만들어지지 않는다 — Tailwind 는 빌드할 때 소스를 글자로 훑어 그 자리에 적힌
   클래스만 뽑아내는데, `mark.color` 는 화면을 그리는 순간에야 정해지는 값이라
   훑는 눈에는 `bg-[${mark.color}]` 라는 글자로만 보인다. 존 색을 칠할 때
   `style` 을 쓰는 것도 같은 까닭이다(`EventCard`).

   그래서 **모양은 클래스로, 색은 style 로** 나눠 준다. 아래 셋이 그 짝을 만들어
   돌려주고, 어느 것을 쓸지는 부르는 쪽이 정한다 — 월간은 고른 날이 꽉 찬
   동그라미이고 오늘은 옅은 동그라미인데, 주간 스트립에는 고르는 개념이 없어서
   오늘이 꽉 찬 동그라미다.
   ──────────────────────────────────────────────────────────────────── */

/** 지난 날·이 달이 아닌 날. 흐리기는 한 값으로 둔다 — 자리마다 다르면 눈에 띈다 */
export const DIM = 0.45;

/** 클래스와 인라인 색의 짝 */
export interface Paint {
  className: string;
  style: CSSProperties;
}

/**
 * 꽉 찬 동그라미. 고른 날(월간)과 오늘(주간)이 쓴다.
 *
 * 특일이면 **그 특일 색으로** 찬다 — 고른 날이 추석인데 동그라미만 초록이면,
 * 그 칸에서 "무슨 날인지" 가 지워진다. 특일이 아니면 지금까지대로 pine 이다.
 */
export const filledCircle = (mark?: DayMark): Paint => ({
  className: "font-semibold text-white",
  style: { background: mark?.color ?? "var(--color-pine)" },
});

/**
 * 옅게 깔린 동그라미. 월간의 오늘이 쓴다.
 *
 * 글자가 그 위에 얹히므로 배경은 아주 옅어야 한다. pine 의 짝인 `--color-pinelt`
 * 가 흰 바탕에 pine 을 12% 섞은 값이라, 특일 색도 같은 비율로 섞어 같은 무게로
 * 보이게 한다.
 */
export const tintedCircle = (mark?: DayMark): Paint =>
  mark
    ? {
        className: "font-semibold",
        style: { background: `color-mix(in srgb, ${mark.color} 12%, #fff)`, color: mark.color },
      }
    : {
        className: "font-semibold",
        style: { background: "var(--color-pinelt)", color: "var(--color-pine)" },
      };

/** 칠하지 않고 글자만. 고른 날도 오늘도 아닌 특일이 쓴다 */
export const markText = (mark: DayMark, dim = false): Paint => ({
  className: "font-semibold",
  style: { color: mark.color, opacity: dim ? DIM : 1 },
});
