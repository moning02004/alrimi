import { describe, expect, it } from "vitest";
import { PAST_PAGE, nextPastBefore } from "@/lib/past";

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ event_date: `2026-01-${String(28 - Math.floor(i / 5)).padStart(2, "0")}` }));

describe("nextPastBefore", () => {
  it("한 쪽을 다 채워 왔으면 마지막 날부터 이어 받는다", () => {
    const page = rows(PAST_PAGE);
    expect(nextPastBefore(page)).toBe(page[page.length - 1].event_date);
  });

  it("날 하나를 다 담느라 넘쳐 와도 마찬가지다", () => {
    const page = rows(PAST_PAGE + 3);
    expect(nextPastBefore(page)).toBe(page[page.length - 1].event_date);
  });

  it("한 쪽에 못 미치면 끝이다", () => {
    expect(nextPastBefore(rows(PAST_PAGE - 1))).toBeUndefined();
    expect(nextPastBefore([])).toBeUndefined();
  });
});
