import { addDays, toDate, toISO } from "./date";
import type { Repeat, RepeatFreq } from "@/types";

/**
 * 반복 일정. 서버(`notices/models.py` repeat_dates)와 같은 규칙으로 날을 센다.
 *
 * 서버가 날마다 일정을 미리 만들어 두므로(`EventSeries`), 폼은 저장하기 전에
 * "몇 개가 만들어지는지" 를 보여주고 한도를 넘으면 미리 막는다. 규칙이 한쪽만
 * 바뀌면 폼은 괜찮다는데 저장에서 되돌려받으므로 두 곳을 함께 고친다.
 */

/** 서버와 같은 한도 (`MAX_REPEAT_COUNT` · `MAX_REPEAT_YEARS`) */
export const MAX_REPEAT_COUNT = 366;
export const MAX_REPEAT_YEARS = 5;

export const FREQ_LABEL: Record<RepeatFreq, string> = {
  daily: "매일",
  weekly: "매주",
  monthly: "매월",
  yearly: "매년",
};

/** 월=0 … 일=6. 서버(파이썬 `weekday()`)와 같은 순서다 */
export const WEEKDAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"];

/** JS 의 `getDay()`(일=0) 를 서버 순서(월=0)로 */
export const serverWeekday = (d: Date) => (d.getDay() + 6) % 7;

/** 기본 끝나는 날. 석 달이면 한 학기의 반쯤이라 대개 한 번 더 늘리거나 그대로 끝난다 */
export function defaultUntil(start: string, freq: RepeatFreq) {
  const d = toDate(start);
  if (freq === "yearly") return toISO(new Date(d.getFullYear() + 3, d.getMonth(), d.getDate()));
  return toISO(new Date(d.getFullYear(), d.getMonth() + 3, d.getDate()));
}

/** 끝나는 날로 고를 수 있는 마지막 날 */
export function latestUntil(start: string) {
  const d = toDate(start);
  const limit = new Date(d.getFullYear() + MAX_REPEAT_YEARS, d.getMonth(), d.getDate());
  // 2월 29일에서 5년 뒤는 3월 1일로 넘어간다. 서버는 28일로 당긴다.
  if (limit.getMonth() !== d.getMonth()) limit.setDate(0);
  return toISO(limit);
}

/**
 * 규칙이 만드는 시작일들. 한도를 조금 넘으면 멈춘다 — 넘었는지만 알면 되고,
 * 매일 5년치를 끝까지 세며 멈칫할 까닭이 없다.
 *
 * 매월 31일·매년 2월 29일은 그 날이 없는 달·해를 건너뛴다(말일로 당기지 않는다).
 */
export function repeatDates(start: string, repeat: Repeat): string[] {
  const dates: string[] = [];
  const { freq, until } = repeat;
  if (!start || !until || until < start) return dates;

  if (freq === "daily" || freq === "weekly") {
    const wanted = new Set(repeat.weekdays);
    for (let day = toDate(start); toISO(day) <= until; day = addDays(day, 1)) {
      if (freq === "daily" || wanted.has(serverWeekday(day))) {
        dates.push(toISO(day));
        if (dates.length > MAX_REPEAT_COUNT) break;
      }
    }
    return dates;
  }

  const first = toDate(start);
  const step = freq === "yearly" ? 12 : 1;
  for (let months = 0; ; months += step) {
    const candidate = new Date(first.getFullYear(), first.getMonth() + months, first.getDate());
    const monthStart = new Date(first.getFullYear(), first.getMonth() + months, 1);
    if (toISO(monthStart) > until) break;
    // 날짜가 넘쳐 다음 달로 갔다 — 그 달에는 그 날이 없다
    if (candidate.getDate() !== first.getDate()) continue;
    if (toISO(candidate) > until) break;
    dates.push(toISO(candidate));
    if (dates.length > MAX_REPEAT_COUNT) break;
  }
  return dates;
}

/** "매주 수·금 · 12월 31일까지" */
export function repeatLabel(repeat: Repeat) {
  const until = toDate(repeat.until);
  const days =
    repeat.freq === "weekly" && repeat.weekdays.length > 0
      ? ` ${[...repeat.weekdays].sort().map((day) => WEEKDAY_NAMES[day]).join("·")}`
      : "";
  const year = until.getFullYear() !== new Date().getFullYear() ? `${until.getFullYear()}년 ` : "";
  return `${FREQ_LABEL[repeat.freq]}${days} · ${year}${until.getMonth() + 1}월 ${until.getDate()}일까지`;
}
