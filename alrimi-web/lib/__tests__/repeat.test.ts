import { describe, expect, it } from "vitest";
import { MAX_REPEAT_COUNT, latestUntil, repeatDates, repeatLabel, serverWeekday } from "../repeat";

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

  it("한도를 넘으면 조금 넘긴 채 멈춘다 — 넘었는지만 알면 된다", () => {
    const dates = repeatDates("2026-01-01", { freq: "daily", weekdays: [], until: "2030-12-31" });
    expect(dates.length).toBe(MAX_REPEAT_COUNT + 1);
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

describe("latestUntil", () => {
  it("5년 뒤 같은 날", () => expect(latestUntil("2026-09-17")).toBe("2031-09-17"));
  it("2월 29일은 28일로 당긴다", () => expect(latestUntil("2028-02-29")).toBe("2033-02-28"));
});

describe("repeatLabel", () => {
  it("매주는 요일을 적는다", () => {
    const year = new Date().getFullYear();
    expect(repeatLabel({ freq: "weekly", weekdays: [4, 2], until: `${year}-12-31` })).toBe(
      "매주 수·금 · 12월 31일까지",
    );
  });

  it("해가 다르면 연도를 적는다", () => {
    const next = new Date().getFullYear() + 1;
    expect(repeatLabel({ freq: "monthly", weekdays: [], until: `${next}-03-01` })).toBe(
      `매월 · ${next}년 3월 1일까지`,
    );
  });
});
