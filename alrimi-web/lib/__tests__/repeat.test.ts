import { describe, expect, it } from "vitest";
import { repeatDates, ruleOn, repeatLabel, serverWeekday } from "../repeat";

describe("repeatDates — 서버 repeat_dates 와 같은 날을 센다", () => {
  it("매일", () => {
    expect(repeatDates("2026-09-17", { freq: "daily", weekdays: [], until: "2026-09-19" })).toEqual([
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
    ]);
  });

  it("매주는 고른 요일만 (월=0, 목=3)", () => {
    expect(
      repeatDates("2026-09-17", { freq: "weekly", weekdays: [0, 3], until: "2026-09-28" }),
    ).toEqual(["2026-09-17", "2026-09-21", "2026-09-24", "2026-09-28"]);
  });

  it("매월 31일은 없는 달을 건너뛴다", () => {
    expect(repeatDates("2026-10-31", { freq: "monthly", weekdays: [], until: "2027-03-31" })).toEqual([
      "2026-10-31",
      "2026-12-31",
      "2027-01-31",
      "2027-03-31",
    ]);
  });

  it("매년 2월 29일은 윤년에만", () => {
    expect(repeatDates("2028-02-29", { freq: "yearly", weekdays: [], until: "2033-01-01" })).toEqual([
      "2028-02-29",
      "2032-02-29",
    ]);
  });

  it("끝나는 날이 앞서면 비어 있다", () => {
    expect(repeatDates("2026-09-17", { freq: "daily", weekdays: [], until: "2026-09-16" })).toEqual([]);
  });

  it("끝이 없으면 첫날이 있는지만 볼 만큼 센다", () => {
    const dates = repeatDates("2026-09-17", { freq: "yearly", weekdays: [], until: null, lunar: true });
    expect(dates[0]).toBe("2026-09-17");
    expect(dates.length).toBeGreaterThanOrEqual(2);
  });
});

describe("serverWeekday — 월=0 … 일=6", () => {
  it.each([
    ["2026-09-14", 0], // 월
    ["2026-09-17", 3], // 목
    ["2026-09-20", 6], // 일
  ])("%s → %i", (iso, expected) => {
    const [y, m, d] = iso.split("-").map(Number);
    expect(serverWeekday(new Date(y, m - 1, d))).toBe(expected);
  });
});

describe("repeatLabel", () => {
  it("매주는 요일을 적는다", () => {
    const year = new Date().getFullYear();
    expect(repeatLabel({ freq: "weekly", weekdays: [4, 2], until: `${year}-12-31` })).toBe(
      "매주 수·금 · 12월 31일까지",
    );
  });

  it("끝이 없으면 끝을 안 적는다", () => {
    expect(repeatLabel({ freq: "yearly", weekdays: [], until: null, lunar: true })).toBe("매년 음력");
    expect(repeatLabel({ freq: "monthly", weekdays: [], until: null })).toBe("매월");
  });

  it("매년 음력은 음력이라고 적는다", () => {
    const year = new Date().getFullYear();
    expect(repeatLabel({ freq: "yearly", weekdays: [], until: `${year}-12-31`, lunar: true })).toBe(
      "매년 음력 · 12월 31일까지",
    );
  });

  it("해가 다르면 연도를 적는다", () => {
    const next = new Date().getFullYear() + 1;
    expect(repeatLabel({ freq: "monthly", weekdays: [], until: `${next}-03-01` })).toBe(
      `매월 · ${next}년 3월 1일까지`,
    );
  });
});

describe("ruleOn — 이후 모두 옮기면 앞으로의 규칙", () => {
  const rule = (freq: "daily" | "weekly" | "monthly" | "yearly", weekdays: number[] = [], lunar = false) => ({
    freq,
    weekdays,
    until: null,
    lunar,
  });

  it("매주는 요일을 옮긴 만큼 민다", () => {
    // 2026-10-07 은 수요일(2). 하루 미루면 목요일
    expect(ruleOn(rule("weekly", [2]), "2026-10-07", "2026-10-08")).toBe("매주 목");
    expect(ruleOn(rule("weekly", [0, 2]), "2026-10-07", "2026-10-06")).toBe("매주 화·일");
  });
  it("매월·매년은 옮긴 날", () => {
    expect(ruleOn(rule("monthly"), "2026-10-07", "2026-10-09")).toBe("매월 9일");
    expect(ruleOn(rule("yearly"), "2026-10-07", "2026-10-09")).toBe("매년 10월 9일");
    expect(ruleOn(rule("yearly", [], true), "2026-10-03", "2026-10-04")).toBe("매년 음력 8월 24일");
  });
});
