import type { Priority } from "@/types";

/** 알림 코드 형식: "D-1 20:00" / "D 07:00" */
export interface ParsedCode {
  offset: number;
  hour: number;
}

export const DAY_OPTIONS = [
  { value: 3, label: "3일 전" },
  { value: 2, label: "2일 전" },
  { value: 1, label: "1일 전" },
  { value: 0, label: "당일" },
];

/** 06:00 ~ 23:00 정각 */
export const HOUR_OPTIONS = Array.from({ length: 18 }, (_, i) => i + 6);

export const PRESETS: Record<string, string[]> = {
  준비물용: ["D-1 20:00", "D 07:00"],
  마감용: ["D-3 20:00", "D-1 20:00", "D 07:00"],
};

export const PRIORITIES: { value: Priority; label: string; hint: string }[] = [
  { value: 2, label: "조용히", hint: "소리와 진동 없이 조용히 도착해요" },
  { value: 4, label: "일반", hint: "평소 알림처럼 소리가 울려요" },
  { value: 5, label: "긴급", hint: "무음이나 방해금지 상태에서도 울려요" },
];

const pad = (n: number) => String(n).padStart(2, "0");

export const makeCode = (offset: number, hour: number) =>
  `${offset === 0 ? "D" : `D-${offset}`} ${pad(hour)}:00`;

export function parseCode(code: string): ParsedCode {
  const [day, time] = code.split(" ");
  return {
    offset: day === "D" ? 0 : Number(day.slice(2)),
    hour: Number(time.slice(0, 2)),
  };
}

export const dayLabel = (offset: number) => (offset === 0 ? "당일" : `${offset}일 전`);

export function codeLabel(code: string) {
  const { offset, hour } = parseCode(code);
  return `${dayLabel(offset)} ${pad(hour)}:00`;
}

/** 이른 알림이 위로 오도록 정렬 */
export function sortCodes(codes: string[]) {
  return [...codes].sort((a, b) => {
    const x = parseCode(a);
    const y = parseCode(b);
    return y.offset - x.offset || x.hour - y.hour;
  });
}

/** 보통(3)은 기본값이라 목록에서 표시하지 않는다 */
export const priorityLabel = (p: Priority) =>
  p === 5 ? "긴급" : p === 2 ? "낮음" : null;
