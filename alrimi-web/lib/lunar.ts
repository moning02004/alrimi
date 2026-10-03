import KoreanLunarCalendar from "korean-lunar-calendar";
import { toDate, toISO } from "./date";

/**
 * 음력 날짜. 하루치 머리글 옆에 작게 붙인다 — 제사·생신을 음력으로 챙기는 집이 많다.
 *
 * **브라우저의 `Intl` 중국 달력(`ca-chinese`)을 쓰지 않는다.** 그것은 베이징 시각으로
 * 초하루를 정해서, 합삭이 자정 언저리인 달은 한국 음력과 하루씩 어긋난다(2000~2050년에
 * 2001년 4월·2005년 11월 등 몇 달). 이 라이브러리는 한국천문연구원 표(1000~2050년)를 담고 있다.
 */

export interface LunarDate {
  year: number;
  month: number;
  day: number;
  /** 윤달 */
  leap: boolean;
}

/** 양력 → 음력. 표가 닿지 않는 해면 null */
export function toLunar(iso: string): LunarDate | null {
  const d = toDate(iso);
  const calendar = new KoreanLunarCalendar();
  if (!calendar.setSolarDate(d.getFullYear(), d.getMonth() + 1, d.getDate())) return null;
  const { year, month, day, intercalation } = calendar.getLunarCalendar();
  return { year, month, day, leap: Boolean(intercalation) };
}

/** "음력 8.23" · 윤달은 "음력 윤6.1". 표가 닿지 않는 해면 null */
export function lunarLabel(iso: string): string | null {
  const lunar = toLunar(iso);
  if (!lunar) return null;
  return `음력 ${lunar.leap ? "윤" : ""}${lunar.month}.${lunar.day}`;
}

/**
 * 매년 음력 반복이 만드는 날들. 서버(`notices/models.py` `_lunar_yearly_dates`)와 같은 규칙이다.
 *
 * - 음력 30일이 없는 해(작은달)는 29일로 당긴다.
 * - 윤달에 시작했으면 이듬해부터는 평달이다.
 * - 표가 닿지 않는 해에서 멈춘다.
 */
export function lunarYearlyDates(start: string, until: string): string[] {
  const first = toLunar(start);
  if (!first || until < start) return [];

  const dates = [start];
  for (let year = first.year + 1; ; year++) {
    const calendar = new KoreanLunarCalendar();
    if (!calendar.setLunarDate(year, first.month, first.day, false)) {
      // 작은달이면 그믐으로. 그래도 안 되면 표 밖이다
      if (first.day !== 30 || !calendar.setLunarDate(year, first.month, 29, false)) break;
    }
    const { year: y, month, day } = calendar.getSolarCalendar();
    const iso = toISO(new Date(y, month - 1, day));
    if (iso > until) break;
    dates.push(iso);
  }
  return dates;
}
