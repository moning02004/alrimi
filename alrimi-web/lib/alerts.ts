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
  며칠 전·후인지는 숫자로 직접 적는다. 예전에는 7·5·3·2·1일 가운데서 골랐는데, "열흘 전",
  "필터를 간 지 200일 뒤" 같은 것은 고를 수 없었다.

  일정이 끝난 뒤로도 잡는다 — 다녀와서 사진 정리하기, 제출한 서류 확인하기처럼 "그 다음" 에
  할 일이 딸려 오는 일정이 있다. 뒤로 잡은 알림은 일정을 완료해도 나간다(서버 `due_alerts`).

  한도는 서버와 같다(`notices/models.py` MAX_ALERT_OFFSET_DAYS · MAX_ALERT_AFTER_DAYS).
  앞은 두 달, 뒤는 한 해다 — 앞을 늘리면 반복 일정을 그만큼 미리 만들어 둬야 한다.
*/
export const MAX_BEFORE_DAYS = 60;
export const MAX_AFTER_DAYS = 365;

export type AlertSide = "before" | "after";

export const SIDE_OPTIONS: { value: AlertSide; label: string }[] = [
  { value: "before", label: "전" },
  { value: "after", label: "후" },
];

/**
 * 적은 날 수가 쓸 수 있는 값인가. 못 쓰면 까닭을, 쓸 수 있으면 null 을 돌려준다.
 * 0 은 앞뒤 어느 쪽이든 "당일" 이다.
 */
export function dayCountError(days: number, side: AlertSide): string | null {
  if (!Number.isInteger(days) || days < 0) return "며칠인지 숫자로 적어주세요";
  const limit = side === "before" ? MAX_BEFORE_DAYS : MAX_AFTER_DAYS;
  if (days > limit) {
    return side === "before"
      ? `미리 알림은 ${MAX_BEFORE_DAYS}일 전까지 돼요`
      : `지난 뒤 알림은 ${MAX_AFTER_DAYS}일 후까지 돼요`;
  }
  return null;
}

/** 06:00 ~ 23:00 정각 */
export const HOUR_OPTIONS = Array.from({ length: 18 }, (_, i) => i + 6);

export const PRESETS: Record<string, string[]> = {
  "없음": [],
  "기본으로": ["D-1 20:00", "D 08:00"],
  "미리미리": ["D-3 20:00", "D-1 20:00", "D 08:00"],
  "잊지 않게": ["D-7 20:00", "D-5 20:00", "D-3 20:00", "D-1 20:00", "D 08:00"],
};

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
