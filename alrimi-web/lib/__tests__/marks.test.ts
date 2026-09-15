import { describe, expect, it } from "vitest";
import { allNames, buildMarks, leadMark, markRuns } from "../marks";
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

/*
  설·추석은 사흘이고 특일 정보 API 는 그 사흘을 각각 "추석" 으로 준다. 칸마다
  곧이곧대로 적으면 "추석 추석 추석" 이 되는데, 종이 달력은 이어진 며칠을 한 번만
  적고 가운데 놓는다.
*/
describe("markRuns — 이어지는 연휴를 한 덩이로", () => {
  const week = (from: number) =>
    Array.from({ length: 7 }, (_, i) => `2026-09-${String(from + i).padStart(2, "0")}`);

  const holidays = (...pairs: [string, string][]) =>
    buildMarks(
      pairs.map(([date, name]) => day(date, "holiday", name)),
      ALL,
    );

  it("사흘짜리는 한 덩이로 묶이고 그만큼 넓다", () => {
    const runs = markRuns(
      week(20),
      holidays(["2026-09-24", "추석"], ["2026-09-25", "추석"], ["2026-09-26", "추석"]),
    );

    expect(runs).toHaveLength(1);
    expect(runs[0].mark.name).toBe("추석");
    expect(runs[0].col).toBe(4);
    expect(runs[0].span).toBe(3);
  });

  it("이름이 다르면 붙어 있어도 따로 선다", () => {
    const runs = markRuns(week(20), holidays(["2026-09-24", "추석"], ["2026-09-25", "임시공휴일"]));

    expect(runs.map((r) => [r.mark.name, r.span])).toEqual([
      ["추석", 1],
      ["임시공휴일", 1],
    ]);
  });

  it("종류가 다르면 이름이 같아도 따로 선다", () => {
    const marks = buildMarks(
      [day("2026-09-24", "holiday", "같은이름"), day("2026-09-25", "term", "같은이름")],
      ALL,
    );

    expect(markRuns(week(20), marks)).toHaveLength(2);
  });

  it("떨어져 있으면 덩이도 둘이다", () => {
    const runs = markRuns(week(20), holidays(["2026-09-21", "개천절"], ["2026-09-24", "한글날"]));

    expect(runs.map((r) => r.col)).toEqual([1, 4]);
  });

  /*
    연휴가 주를 넘어가면 이름은 주마다 한 번씩 적힌다 — 뒷주에 이름이 없으면
    빨간 숫자만 덩그러니 남아 무슨 날인지 알 수 없다.
  */
  it("주를 넘어가면 이어짐을 표시하고, 양쪽 주에 각각 선다", () => {
    const marks = holidays(
      ["2026-09-26", "설날"],
      ["2026-09-27", "설날"],
      ["2026-09-28", "설날"],
    );

    const [before] = markRuns(week(20), marks); // 20~26 (토요일에 시작)
    const [after] = markRuns(week(27), marks); // 27~

    expect([before.col, before.span, before.clippedStart, before.clippedEnd]).toEqual([
      6,
      1,
      false,
      true,
    ]);
    expect([after.col, after.span, after.clippedStart, after.clippedEnd]).toEqual([
      0,
      2,
      true,
      false,
    ]);
    // 뒷주에도 이름이 붙어야 한다 — 없으면 빨간 숫자만 덩그러니 남는다
    expect(after.mark.name).toBe("설날");
  });

  it("표시가 없는 주는 덩이도 없다", () => {
    expect(markRuns(week(20), {})).toEqual([]);
  });

  it("덮는 날들을 그대로 들고 있다 — 흐리게 그릴지 부르는 쪽이 판단한다", () => {
    const runs = markRuns(week(20), holidays(["2026-09-24", "추석"], ["2026-09-25", "추석"]));

    expect(runs[0].days).toEqual(["2026-09-24", "2026-09-25"]);
  });
});
