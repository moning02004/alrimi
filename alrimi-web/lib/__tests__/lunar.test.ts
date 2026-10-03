import { describe, expect, it } from "vitest";
import { lunarLabel, lunarYearlyDates } from "../lunar";
import { repeatDates } from "../repeat";

describe("lunarLabel — 한국 음력", () => {
  it.each([
    ["2026-02-17", "음력 1.1"], // 설날
    ["2026-09-25", "음력 8.15"], // 추석
    ["2026-10-03", "음력 8.23"],
    ["2025-07-25", "음력 윤6.1"], // 윤달
    ["2001-04-24", "음력 4.1"], // 중국 음력과 하루 어긋나는 달
  ])("%s → %s", (iso, expected) => expect(lunarLabel(iso)).toBe(expected));

  it("표가 닿지 않는 해는 비운다", () => expect(lunarLabel("2100-01-01")).toBeNull());
});

describe("lunarYearlyDates — 서버 _lunar_yearly_dates 와 같은 날을 센다", () => {
  it("해마다 같은 음력 날", () =>
    expect(lunarYearlyDates("2026-10-03", "2029-12-31")).toEqual([
      "2026-10-03",
      "2027-09-23",
      "2028-10-11",
      "2029-09-30",
    ]));

  it("음력 30일은 작은달이면 29일로", () =>
    expect(lunarYearlyDates("2026-03-18", "2027-12-31")).toEqual(["2026-03-18", "2027-03-07"]));

  it("윤달에 시작하면 이듬해부터 평달", () =>
    expect(lunarYearlyDates("2025-07-25", "2026-12-31")).toEqual(["2025-07-25", "2026-07-14"]));

  it("반복 규칙에서는 매년일 때만", () => {
    expect(repeatDates("2026-10-03", { freq: "yearly", weekdays: [], until: "2027-12-31", lunar: true })).toEqual([
      "2026-10-03",
      "2027-09-23",
    ]);
    expect(repeatDates("2026-10-03", { freq: "monthly", weekdays: [], until: "2026-11-03", lunar: true })).toEqual([
      "2026-10-03",
      "2026-11-03",
    ]);
  });
});
