import type { Priority } from "@/types";

/**
 * 알림 코드 형식: "D-1 20:00"(하루 전) / "D 07:00"(당일) / "D+3 20:00"(사흘 뒤).
 *
 * `offset` 은 **며칠 전** 이다. 일정이 지난 뒤로 잡는 알림은 음수로 적는다 —
 * 서버가 시작일에서 빼기만 하면 양쪽이 다 맞아떨어진다.
 */
export interface ParsedCode {
  offset: number;
  hour: number;
}

/*
  일정이 끝난 뒤로도 잡을 수 있다 — 다녀와서 사진 정리하기, 제출한 서류 확인하기
  처럼 "그 다음"에 할 일이 딸려 오는 일정이 있다. 앞뒤를 같은 눈금으로 둔다.
*/
export const DAY_OPTIONS = [
  { value: 7, label: "7일 전" },
  { value: 5, label: "5일 전" },
  { value: 3, label: "3일 전" },
  { value: 2, label: "2일 전" },
  { value: 1, label: "1일 전" },
  { value: 0, label: "당일" },
  { value: -1, label: "1일 후" },
  { value: -2, label: "2일 후" },
  { value: -3, label: "3일 후" },
  { value: -5, label: "5일 후" },
  { value: -7, label: "7일 후" },
];

/** 06:00 ~ 23:00 정각 */
export const HOUR_OPTIONS = Array.from({ length: 18 }, (_, i) => i + 6);

export const PRESETS: Record<string, string[]> = {
  "기본으로": ["D-1 20:00", "D 08:00"],
  "미리미리": ["D-3 20:00", "D-1 20:00", "D 08:00"],
  "잊지 않게": ["D-7 20:00", "D-5 20:00", "D-3 20:00", "D-1 20:00", "D 08:00"],
};

export const PRIORITIES: { value: Priority; label: string; hint: string }[] = [
  { value: 2, label: "조용히", hint: "소리와 진동 없이 조용히 도착해요" },
  { value: 4, label: "일반", hint: "평소 알림처럼 소리가 울려요" },
  { value: 5, label: "긴급", hint: "무음이나 방해금지 상태에서도 울려요" },
];

const pad = (n: number) => String(n).padStart(2, "0");

export const makeCode = (offset: number, hour: number) =>
  `${offset === 0 ? "D" : offset > 0 ? `D-${offset}` : `D+${-offset}`} ${pad(hour)}:00`;

export function parseCode(code: string): ParsedCode {
  const [day, time] = code.split(" ");
  // "D-1" → 1(하루 전), "D+3" → -3(사흘 뒤). 부호를 그대로 읽고 뒤집는다.
  return {
    offset: day === "D" ? 0 : -Number(day.slice(1)),
    hour: Number(time.slice(0, 2)),
  };
}

export const dayLabel = (offset: number) =>
  offset === 0 ? "당일" : offset > 0 ? `${offset}일 전` : `${-offset}일 후`;

export function codeLabel(code: string) {
  const { offset, hour } = parseCode(code);
  return `${dayLabel(offset)} ${pad(hour)}:00`;
}

/** 이른 알림이 위로 오도록 정렬. offset 이 클수록 앞이라 내림차순이고, 뒤로 잡은 것(음수)이 맨 끝이다 */
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
