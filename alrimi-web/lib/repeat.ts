import { addDays, toDate, toISO } from "./date";
import { lunarYearlyDates, toLunar } from "./lunar";
import type { Repeat, RepeatFreq } from "@/types";

/**
 * 반복 일정. 서버(`notices/models.py` rule_dates)와 같은 규칙으로 날을 센다.
 *
 * 서버는 규칙만 두고 가까운 날만 일정으로 만든다(`EventSeries`). 그래서 길이에 한도가
 * 없고, 끝나는 날을 비우면 끝이 없다. 폼은 끝나는 날이 있을 때 몇 번인지를 보여주고,
 * 규칙으로 만들어질 날이 하나도 없으면 미리 막는다. 규칙이 한쪽만 바뀌면 폼은 괜찮다는데
 * 저장에서 되돌려받으므로 두 곳을 함께 고친다.
 */

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

/**
 * 기본 끝나는 날. 매일·매주는 석 달 — 한 학기의 반쯤이라 대개 한 번 더 늘리거나 그대로
 * 끝난다(체육복·학원). 매월·매년은 **끝이 없다** — 관리비·생신은 끝나는 날이 없는 일이다.
 */
export function defaultUntil(start: string, freq: RepeatFreq): string | null {
  if (freq === "monthly" || freq === "yearly") return null;
  const d = toDate(start);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 3, d.getDate()));
}

/** 끝이 없을 때 첫날을 찾는 폭. 두 해면 매년(음력이어도)이 한 번은 든다 — 서버와 같다 */
const FIRST_WITHIN_DAYS = 800;

/**
 * 규칙이 만드는 시작일들. 끝이 없으면 첫날을 찾는 폭(`FIRST_WITHIN_DAYS`)까지만 센다
 * — 폼은 그때 개수가 아니라 "만들어질 날이 있는가" 만 본다.
 *
 * 매월 31일·매년 2월 29일은 그 날이 없는 달·해를 건너뛴다(말일로 당기지 않는다).
 * 매년 음력은 `lunarYearlyDates` 가 센다.
 */
export function repeatDates(start: string, repeat: Repeat): string[] {
  const dates: string[] = [];
  const { freq } = repeat;
  const until = repeat.until ?? toISO(addDays(toDate(start), FIRST_WITHIN_DAYS));
  if (!start || until < start) return dates;

  if (freq === "daily" || freq === "weekly") {
    const wanted = new Set(repeat.weekdays);
    for (let day = toDate(start); toISO(day) <= until; day = addDays(day, 1)) {
      if (freq === "daily" || wanted.has(serverWeekday(day))) {
        dates.push(toISO(day));
      }
    }
    return dates;
  }

  if (freq === "yearly" && repeat.lunar) return lunarYearlyDates(start, until);

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
  }
  return dates;
}

/** "매주 수·금 · 12월 31일까지" · "매년 음력" (끝이 없으면 끝을 안 적는다) */
export function repeatLabel(repeat: Repeat) {
  const days =
    repeat.freq === "weekly" && repeat.weekdays.length > 0
      ? ` ${[...repeat.weekdays].sort().map((day) => WEEKDAY_NAMES[day]).join("·")}`
      : "";
  const lunar = repeat.freq === "yearly" && repeat.lunar ? " 음력" : "";
  const rule = `${FREQ_LABEL[repeat.freq]}${days}${lunar}`;
  if (!repeat.until) return rule;
  const until = toDate(repeat.until);
  const year = until.getFullYear() !== new Date().getFullYear() ? `${until.getFullYear()}년 ` : "";
  return `${rule} · ${year}${until.getMonth() + 1}월 ${until.getDate()}일까지`;
}

/**
 * 규칙이 이 날을 무엇으로 되풀이하는가. "매주 목" · "매월 8일" · "매년 10월 8일" · "매년 음력 8월 24일"
 *
 * "이후 모두" 로 날짜를 옮길 때 폼이 "앞으로는 이렇게 된다" 를 적는 데 쓴다 — 서버는 옮긴
 * 날에서 규칙을 새로 세우므로(`notices/series.py` split), 새 규칙은 옮긴 날이 정한다.
 * 매주는 요일들을 옮긴 만큼 함께 민다(서버와 같다).
 */
export function ruleOn(repeat: Repeat, from: string, to: string) {
  const d = toDate(to);
  if (repeat.freq === "daily") return "매일";
  if (repeat.freq === "weekly") {
    const moved = Math.round((d.getTime() - toDate(from).getTime()) / 86_400_000);
    const days = [...new Set(repeat.weekdays.map((day) => (((day + moved) % 7) + 7) % 7))].sort();
    return `매주 ${days.map((day) => WEEKDAY_NAMES[day]).join("·")}`;
  }
  if (repeat.freq === "monthly") return `매월 ${d.getDate()}일`;
  if (repeat.lunar) {
    const lunar = toLunar(to);
    if (lunar) return `매년 음력 ${lunar.month}월 ${lunar.day}일`;
  }
  return `매년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}
