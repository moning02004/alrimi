import { describe, expect, it } from "vitest";
import { allNames, buildMarks, leadMark } from "../marks";
import type { MarkKind, MarkStyle, SpecialDay } from "@/types";

const day = (date: string, kind: MarkKind, name: string): SpecialDay => ({ date, kind, name });

const style = (kind: MarkKind, color: string): MarkStyle => ({ kind, label: kind, color });

const ALL: MarkStyle[] = [style("holiday", "#DC2626"), style("term", "#2563EB")];

describe("buildMarks — 자료에 보는 사람의 색을 얹는다", () => {
  it("날짜별로 묶고 색을 붙인다", () => {
    const marks = buildMarks([day("2026-09-24", "holiday", "추석")], ALL);

    expect(marks["2026-09-24"]).toEqual([
      { kind: "holiday", name: "추석", color: "#DC2626" },
    ]);
  });

  it("종류마다 제 색을 받는다", () => {
    const marks = buildMarks(
      [day("2026-09-24", "holiday", "추석"), day("2026-09-23", "term", "추분")],
      ALL,
    );

    expect(marks["2026-09-24"][0].color).toBe("#DC2626");
    expect(marks["2026-09-23"][0].color).toBe("#2563EB");
  });

  it("설정이 아직 안 온 종류는 그리지 않는다 — 기본 색으로 그렸다 튀는 것보다 낫다", () => {
    const marks = buildMarks([day("2026-09-23", "term", "추분")], [style("holiday", "#DC2626")]);
    expect(marks["2026-09-23"]).toBeUndefined();
  });

  it("서버에 옛 종류가 남아 있어도 그리지 않는다", () => {
    const stale = { date: "2026-04-05", kind: "memorial", name: "식목일" } as unknown as SpecialDay;
    expect(buildMarks([stale], ALL)["2026-04-05"]).toBeUndefined();
  });

  /*
    추분이 추석과 겹치는 해가 있다. 좁은 칸은 맨 앞 하나만 쓰므로 순서가 곧
    "무슨 색으로 칠할지" 다. 공휴일이 앞인 것은 그것만이 쉬는 날이라서.
  */
  it("한 날에 둘이면 공휴일이 앞에 선다", () => {
    const marks = buildMarks(
      [day("2026-09-23", "term", "추분"), day("2026-09-23", "holiday", "추석")],
      ALL,
    );

    expect(marks["2026-09-23"].map((m) => m.kind)).toEqual(["holiday", "term"]);
  });

  it("들어온 순서가 뒤바뀌어도 같은 차례로 선다", () => {
    const forward = buildMarks(
      [day("2026-09-23", "holiday", "추석"), day("2026-09-23", "term", "추분")],
      ALL,
    );
    const backward = buildMarks(
      [day("2026-09-23", "term", "추분"), day("2026-09-23", "holiday", "추석")],
      ALL,
    );

    expect(forward["2026-09-23"]).toEqual(backward["2026-09-23"]);
  });

  it("아무것도 없으면 빈 객체다", () => {
    expect(buildMarks([], ALL)).toEqual({});
  });

  it("연휴는 날마다 한 줄이라 날마다 따로 잡힌다", () => {
    const marks = buildMarks(
      [
        day("2026-09-24", "holiday", "추석"),
        day("2026-09-25", "holiday", "추석"),
        day("2026-09-26", "holiday", "추석"),
      ],
      ALL,
    );

    expect(Object.keys(marks)).toEqual(["2026-09-24", "2026-09-25", "2026-09-26"]);
  });
});

describe("leadMark · allNames — 좁은 칸과 낭독기가 쓰는 값", () => {
  const marks = buildMarks(
    [day("2026-09-23", "term", "추분"), day("2026-09-23", "holiday", "추석")],
    ALL,
  );

  it("좁은 칸은 맨 앞 하나만 쓴다", () => {
    expect(leadMark(marks["2026-09-23"])?.name).toBe("추석");
  });

  it("표시가 없는 날은 아무것도 아니다", () => {
    expect(leadMark(marks["2026-09-24"])).toBeUndefined();
    expect(allNames(marks["2026-09-24"])).toBe("");
  });

  it("낭독기에는 겹친 것까지 전부 — 색은 그쪽에 안 읽힌다", () => {
    expect(allNames(marks["2026-09-23"])).toBe("추석 · 추분");
  });
});
