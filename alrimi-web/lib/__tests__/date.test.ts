import { describe, expect, it } from "vitest";
import {
  WEEK_DAYS,
  addDays,
  monthGridDays,
  rangeLabel,
  startOfMonday,
  toISO,
  windowDays,
} from "../date";

/** 테스트에서 읽기 쉬우라고. `new Date(y, m-1, d)` 는 로컬 자정이다 */
const d = (iso: string) => {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day);
};

describe("startOfMonday", () => {
  it.each([
    ["2026-09-07", "2026-09-07"], // 월요일은 자기 자신
    ["2026-09-09", "2026-09-07"], // 수요일 → 그 주 월요일
    ["2026-09-13", "2026-09-07"], // 일요일은 앞의 월요일로 (getDay()가 0이라 틀리기 쉬운 자리)
    ["2026-09-14", "2026-09-14"], // 다음 월요일
    ["2026-10-01", "2026-09-28"], // 달을 거슬러 올라간다
    ["2026-01-01", "2025-12-29"], // 해를 거슬러 올라간다
  ])("%s → %s", (input, expected) => {
    expect(toISO(startOfMonday(d(input)))).toBe(expected);
  });
});

describe("windowDays — 주간 창은 월~일로 고정된다", () => {
  it("주 안 어느 날을 넣어도 같은 창이 나온다", () => {
    const week = ["2026-09-07", "2026-09-09", "2026-09-13"].map((iso) =>
      windowDays(d(iso)).map(toISO),
    );
    expect(week[0]).toEqual(week[1]);
    expect(week[1]).toEqual(week[2]);
    expect(week[0][0]).toBe("2026-09-07");
    expect(week[0][6]).toBe("2026-09-13");
  });

  it("월요일이 되어야 다음 주로 넘어간다", () => {
    expect(toISO(windowDays(d("2026-09-13"))[0])).toBe("2026-09-07");
    expect(toISO(windowDays(d("2026-09-14"))[0])).toBe("2026-09-14");
  });

  it("항상 7칸이고 하루씩 이어진다", () => {
    const days = windowDays(d("2026-09-09"));
    expect(days).toHaveLength(WEEK_DAYS);
    days.forEach((day, i) => {
      if (i === 0) return;
      expect(toISO(day)).toBe(toISO(addDays(days[i - 1], 1)));
    });
  });

  it("앵커를 7일 옮기면 창이 정확히 한 주 움직인다 — 겹치거나 벌어지지 않는다", () => {
    const anchor = d("2026-09-09");
    const now = windowDays(anchor).map(toISO);
    const next = windowDays(addDays(anchor, 7)).map(toISO);
    const prev = windowDays(addDays(anchor, -7)).map(toISO);

    expect(toISO(addDays(d(now[6]), 1))).toBe(next[0]);
    expect(toISO(addDays(d(prev[6]), 1))).toBe(now[0]);
  });
});

describe("monthGridDays — 월간도 월요일에서 시작한다", () => {
  it("42칸이고 첫 칸은 월요일이다", () => {
    for (const iso of ["2026-09-15", "2026-02-10", "2026-11-01"]) {
      const grid = monthGridDays(d(iso));
      expect(grid).toHaveLength(42);
      // getDay(): 월=1
      expect(grid[0].getDay()).toBe(1);
    }
  });

  it("그 달 1일을 반드시 담는다", () => {
    const grid = monthGridDays(d("2026-09-15")).map(toISO);
    expect(grid).toContain("2026-09-01");
    expect(grid).toContain("2026-09-30");
  });

  it("주간 창의 시작과 같은 요일 규칙을 쓴다", () => {
    // 접었다 펴는 것만으로 첫 칸 요일이 바뀌면 안 된다
    expect(monthGridDays(d("2026-09-15"))[0].getDay()).toBe(
      windowDays(d("2026-09-15"))[0].getDay(),
    );
  });
});

describe("rangeLabel", () => {
  it("같은 달이면 뒤쪽 달을 생략한다", () => {
    expect(rangeLabel(d("2026-09-07"), d("2026-09-13"))).toBe("9월 7일 – 13일");
  });

  it("달을 넘어가면 뒤쪽에도 달을 적는다", () => {
    expect(rangeLabel(d("2026-09-28"), d("2026-10-04"))).toBe("9월 28일 – 10월 4일");
  });
});

describe("toISO", () => {
  it("UTC 로 밀리지 않는다 (new Date(iso) 는 자정이 밀린다)", () => {
    expect(toISO(new Date(2026, 0, 1))).toBe("2026-01-01");
    expect(toISO(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});
