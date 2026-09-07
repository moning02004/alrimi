import { useSyncExternalStore } from "react";
import type { NoticeListItem } from "@/types";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-09-11" → Date. new Date(iso)는 UTC 자정으로 읽혀 하루 밀린다 */
export const toDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const addDays = (d: Date, n: number) => {
  const next = new Date(d);
  next.setDate(d.getDate() + n);
  return next;
};

/** 주간 창이 덮는 날 수. 달력 한 주라 7이고, 스트립이 이만큼을 칸으로 그린다 */
export const WEEK_DAYS = 7;

/**
 * 그 주의 월요일. `getDay()` 는 일=0 이므로 일요일은 6칸 뒤로 물러난다.
 * 주간 창이 여기서 시작한다.
 */
export function startOfMonday(d: Date) {
  const day = startOfDay(d);
  return addDays(day, -((day.getDay() + 6) % 7)); // 월=0 … 일=6
}

/**
 * 그 날이 속한 주의 월~일 7칸. 스트립도 아래 목록도 이 창을 그대로 쓴다.
 *
 * 오늘부터 굴리지 않는다 — 굴리면 오늘이 늘 맨 왼쪽이라 같은 "이번 주"가 날마다
 * 다른 기간을 뜻하고, 요일 자리도 매일 밀려서 눈에 익지 않는다. 월요일에 붙여두면
 * 다음 월요일이 오기 전까지 창이 그대로다.
 *
 * 대신 주 중반에는 이미 지난 날이 창 안에 들어온다. 그 자리는 비우지 않고
 * 지난 일정을 그대로 보여준다 — 목록도 같은 창을 보므로 스트립에 점이 찍혔는데
 * 아래에는 없는 날은 생기지 않는다.
 */
export function windowDays(from: Date = new Date()) {
  const start = startOfMonday(from);
  return Array.from({ length: WEEK_DAYS }, (_, i) => addDays(start, i));
}

/** "2026년 9월". 주간·월간 머리글이 같은 모양을 쓴다 */
export const monthLabel = (d: Date) => `${d.getFullYear()}년 ${d.getMonth() + 1}월`;

/**
 * "9월 4일 – 10일". 달을 넘어가면 뒤쪽에도 달을 적는다.
 * 창이 앞뒤로 움직이므로 지금 무슨 기간을 보고 있는지 머리글이 직접 말해줘야 한다.
 */
export function rangeLabel(start: Date, end: Date) {
  const head = `${start.getMonth() + 1}월 ${start.getDate()}일`;
  const tail =
    start.getMonth() === end.getMonth()
      ? `${end.getDate()}일`
      : `${end.getMonth() + 1}월 ${end.getDate()}일`;
  return `${head} – ${tail}`;
}

/** 요일 한 글자. 날짜에서 직접 뽑아야 창이 굴러가도 안 밀린다 */
export const dayName = (d: Date) => DAYS[d.getDay()];

/** 그 주의 일요일. 월간 그리드가 일요일 시작이다 */
export function startOfWeek(d: Date) {
  return addDays(startOfDay(d), -d.getDay()); // getDay(): 일=0
}

export function fullLabel(iso: string) {
  const d = toDate(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}요일`;
}

export function timeLabel(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function monthDayLabel(isoDateTime: string) {
  const d = toDate(isoDateTime.slice(0, 10));
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 가까운 날은 상대 표현을 앞에 붙인다. "오늘 · 8월 19일 수" */
export function sectionLabel(iso: string) {
  const d = toDate(iso);
  const today = startOfDay(new Date());
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  const date = `${d.getMonth() + 1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}`;

  if (diff === 0) return `오늘 · ${date}`;
  if (diff === 1) return `내일 · ${date}`;
  if (diff === -1) return `어제 · ${date}`;
  return date;
}

export interface DateGroup {
  /** 스크롤 앵커로 쓴다 */
  iso: string;
  label: string;
  items: NoticeListItem[];
}

/** 목록의 축은 날짜다. 존은 색으로만 구분한다 */
export function groupByDate(notices: NoticeListItem[]): DateGroup[] {
  const order: string[] = [];
  const buckets = new Map<string, NoticeListItem[]>();

  for (const notice of notices) {
    const key = notice.event_date;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(notice);
  }

  return order.map((iso) => ({ iso, label: sectionLabel(iso), items: buckets.get(iso)! }));
}

export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/** 달을 n칸 옮긴 그 달 1일. 31일 → 다음 달 계산이 밀리지 않는다 */
export const shiftMonth = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth() + n, 1);

/** 월간 그리드 42칸. 1일이 낀 주의 월요일부터 6주 */
export function monthGridDays(anchor: Date) {
  const first = startOfWeek(startOfMonth(anchor));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

const MINUTE = 60_000;

const subscribeMinute = (onChange: () => void) => {
  const id = setInterval(onChange, MINUTE);
  return () => clearInterval(id);
};

// 분 단위로 잘라야 스냅샷이 1분 동안 같은 값이라 무한 렌더에 빠지지 않는다
const minuteSnapshot = () => Math.floor(Date.now() / MINUTE) * MINUTE;

/**
 * 1분마다 갱신되는 현재 시각. 렌더 중 `Date.now()`를 직접 부르면
 * 리렌더마다 값이 달라지고("N분 전"이 튄다), 열어둔 화면에서는 아예 멈춘다.
 * 서버에는 시각이 없으므로 null로 시작해 하이드레이션 불일치를 피한다.
 */
export function useNowMinute(): number | null {
  return useSyncExternalStore(subscribeMinute, minuteSnapshot, () => null);
}
