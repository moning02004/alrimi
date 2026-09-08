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
 * 그 주의 일요일. 주간 창과 월간 그리드가 모두 여기서 시작한다.
 *
 * `getDay()` 가 일=0 … 토=6 이라 그만큼 되돌리면 그 주의 일요일이다.
 */
export function startOfWeek(d: Date) {
  const day = startOfDay(d);
  return addDays(day, -day.getDay()); // 일=0 … 토=6
}

/**
 * 그 날이 속한 주의 일~토 7칸. 스트립도 아래 목록도 이 창을 그대로 쓴다.
 *
 * 오늘부터 굴리지 않는다 — 굴리면 오늘이 늘 맨 왼쪽이라 같은 "이번 주"가 날마다
 * 다른 기간을 뜻하고, 요일 자리도 매일 밀려서 눈에 익지 않는다. 요일에 붙여두면
 * 다음 주가 되기 전까지 창이 그대로다.
 *
 * 대신 주 중반에는 이미 지난 날이 창 안에 들어온다. 그 자리는 비우지 않고
 * 지난 일정을 그대로 보여준다 — 목록도 같은 창을 보므로 스트립에 점이 찍혔는데
 * 아래에는 없는 날은 생기지 않는다.
 */
export function windowDays(from: Date = new Date()) {
  const start = startOfWeek(from);
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

/**
 * "15시". 24시간제라 오전·오후를 헷갈릴 일이 없다 — 알림 시각도 같은 표기다.
 * 분이 없는 값이라 "15:00" 이 아니라 "시" 로 적어, 없는 정확도를 풍기지 않는다.
 */
export const hourLabel = (hour: number) => `${hour}시`;

/** 요일 한 글자. 날짜에서 직접 뽑아야 창이 굴러가도 안 밀린다 */
export const dayName = (d: Date) => DAYS[d.getDay()];

export function fullLabel(iso: string) {
  const d = toDate(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DAYS[d.getDay()]})`;
}

/**
 * 한 일정이 걸칠 수 있는 최대 날 수. 서버도 같은 값에서 끊는다
 * (alrimi-api `notices/models.py` MAX_SPAN_DAYS) — 한쪽만 바꾸면
 * 폼에서는 고를 수 있는데 저장에서 되돌려받는다.
 */
export const MAX_SPAN_DAYS = 60;

/** 걸치는 날 수. 하루짜리는 1이다 */
export function spanDays(start: string, end: string) {
  if (!end || end <= start) return 1;
  return Math.round((toDate(end).getTime() - toDate(start).getTime()) / 86_400_000) + 1;
}

/**
 * 그 일정의 며칠째인지(1부터). 창이 아니라 일정의 시작일부터 센다 —
 * 주를 넘겨 보고 있어도 "2일차" 는 늘 같은 날을 가리켜야 한다.
 */
export const dayIndex = (start: string, day: string) =>
  Math.round((toDate(day).getTime() - toDate(start).getTime()) / 86_400_000) + 1;

/**
 * 상세 화면의 날짜 줄. 하루짜리는 지금까지와 같고, 며칠짜리면 양끝과 기간을 적는다.
 * "9월 25일 – 27일" 처럼 뒤쪽은 짧게 — 달이 넘어갈 때만 달을 다시 적는다.
 */
export function spanLabel(start: string, end: string) {
  if (!end || end === start) return fullLabel(start);
  return `${fullLabel(start)} ~ ${fullLabel(end)} · ${spanDays(start, end)}일간`;
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

interface GroupOptions {
  /** 보고 있는 창. 여기 밖의 날은 만들지 않는다 */
  from?: string;
  to?: string;
  /** 지난 일정만 최근 것부터 */
  desc?: boolean;
}

/**
 * 목록의 축은 날짜다. 존은 색으로만 구분한다.
 *
 * 며칠에 걸치는 일정은 **걸치는 날마다** 들어간다 — 여행 둘째 날 아침에 목록을
 * 열었을 때 비어 있으면 안 되기 때문이다. 같은 일정이 여러 날에 나오므로
 * 그리는 쪽은 열쇠를 `id` 만으로 잡으면 안 된다(NoticeGroups 참고).
 *
 * 창(`from`~`to`)을 주면 그 밖의 날은 만들지 않는다. 서버는 창에 **걸치는** 것을
 * 주므로, 자르지 않으면 지난주에 떠난 여행 때문에 이번 주 목록 위에 지난주 날짜가
 * 붙는다.
 */
export function groupByDate(
  notices: NoticeListItem[],
  { from, to, desc = false }: GroupOptions = {},
): DateGroup[] {
  const buckets = new Map<string, NoticeListItem[]>();

  for (const notice of notices) {
    const first = from && notice.event_date < from ? from : notice.event_date;
    // end_date 가 없던 시절의 응답(캐시)이 섞여도 하루짜리로 읽고 넘어간다
    const last = notice.end_date && notice.end_date > first ? notice.end_date : first;
    const stop = to && last > to ? to : last;

    for (let day = first; day <= stop; day = toISO(addDays(toDate(day), 1))) {
      const items = buckets.get(day);
      if (items) items.push(notice);
      else buckets.set(day, [notice]);
    }
  }

  // 날짜로 세운다. 도착 순서를 따르면 긴 일정이 뒤쪽 날들을 먼저 만들어
  // 그 뒤에 오는 짧은 일정의 날이 아래로 밀린다.
  const days = [...buckets.keys()].sort();
  if (desc) days.reverse();

  return days.map((iso) => ({ iso, label: sectionLabel(iso), items: buckets.get(iso)! }));
}

export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/** 달을 n칸 옮긴 그 달 1일. 31일 → 다음 달 계산이 밀리지 않는다 */
export const shiftMonth = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth() + n, 1);

/** 월간 그리드 42칸. 1일이 낀 주의 일요일부터 6주 — 주간 창과 같은 시작 요일이다 */
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
