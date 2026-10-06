import { describe, expect, it } from "vitest";
import { MAX_AFTER_DAYS, MAX_BEFORE_DAYS, codeLabel, dayCountError, makeCode, sortCodes } from "../alerts";

describe("dayCountError — 직접 적은 날 수", () => {
  it("앞은 두 달, 뒤는 한 해까지", () => {
    expect(dayCountError(MAX_BEFORE_DAYS, "before")).toBeNull();
    expect(dayCountError(MAX_BEFORE_DAYS + 1, "before")).toMatch("60일 전까지");
    expect(dayCountError(200, "after")).toBeNull();
    expect(dayCountError(MAX_AFTER_DAYS + 1, "after")).toMatch("365일 후까지");
  });
  it("0 은 당일이라 어느 쪽이든 된다", () => {
    expect(dayCountError(0, "before")).toBeNull();
    expect(dayCountError(0, "after")).toBeNull();
  });
  it("비었거나 숫자가 아니면 막는다", () => {
    expect(dayCountError(NaN, "before")).not.toBeNull();
    expect(dayCountError(-1, "after")).not.toBeNull();
    expect(dayCountError(1.5, "before")).not.toBeNull();
  });
});

describe("알림 코드", () => {
  it("뒤로 잡은 것은 D+n", () => {
    expect(makeCode(-200, 9)).toBe("D+200 09:00");
    expect(codeLabel("D+200 09:00")).toBe("200일 후 09:00");
    expect(makeCode(10, 20)).toBe("D-10 20:00");
    expect(makeCode(0, 8)).toBe("D 08:00");
  });
  it("이른 것부터, 뒤로 잡은 것이 맨 끝", () => {
    expect(sortCodes(["D+200 09:00", "D 08:00", "D-10 20:00", "D+3 20:00"])).toEqual([
      "D-10 20:00",
      "D 08:00",
      "D+3 20:00",
      "D+200 09:00",
    ]);
  });
});
