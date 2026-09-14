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
