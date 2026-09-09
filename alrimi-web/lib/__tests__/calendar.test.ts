import { describe, expect, it } from "vitest";
import { covers, layoutRow, toneOf, type Limits } from "../calendar";
import { windowDays } from "../date";
import type { CalendarEvent } from "@/types";

/** 테스트에서 읽기 쉬우라고. `new Date(y, m-1, d)` 는 로컬 자정이다 */
const d = (iso: string) => {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day);
};

let seq = 0;
const event = (start: string, end = start, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: (seq += 1),
  zone: 1,
  color: "#2F7A63",
  event_date: start,
  end_date: end,
  title: `${start}~${end}`,
  completed: false,
  ...over,
});

/** 2026-09-06(일) ~ 09-12(토). 한 주 */
const WEEK = windowDays(d("2026-09-09"));
const LIMITS: Limits = { bands: 2, dots: 3 };

describe("covers — 그 날에 걸치는가", () => {
  it("양끝을 모두 포함한다", () => {
    const trip = event("2026-09-08", "2026-09-10");
    expect(covers(trip, "2026-09-07")).toBe(false);
    expect(covers(trip, "2026-09-08")).toBe(true);
    expect(covers(trip, "2026-09-09")).toBe(true);
    expect(covers(trip, "2026-09-10")).toBe(true);
    expect(covers(trip, "2026-09-11")).toBe(false);
  });

  it("end_date 가 없던 시절의 응답도 하루짜리로 읽는다", () => {
    const old = { ...event("2026-09-08"), end_date: "" };
    expect(covers(old, "2026-09-08")).toBe(true);
    expect(covers(old, "2026-09-09")).toBe(false);
  });
});

describe("toneOf — 지난 것과 치운 것은 다른 말이다", () => {
  const today = "2026-09-09";

  it("앞으로의 일정은 또렷하다", () => {
    expect(toneOf(event("2026-09-10"), today)).toBe("normal");
  });

  it("오늘 것은 아직 지나지 않았다", () => {
    expect(toneOf(event("2026-09-09"), today)).toBe("normal");
  });

  it("어제 끝난 것은 지난 것이다", () => {
    expect(toneOf(event("2026-09-08"), today)).toBe("past");
  });

  it("어제 떠나 내일 돌아오는 여행은 아직 지나지 않았다", () => {
    expect(toneOf(event("2026-09-08", "2026-09-10"), today)).toBe("normal");
  });

  it("완료한 것은 지난 것과 따로 센다", () => {
    expect(toneOf(event("2026-09-08", "2026-09-08", { completed: true }), today)).toBe("done");
  });
});

describe("layoutRow — 며칠짜리만 띠다", () => {
  it("사흘짜리는 세 칸을 덮는 띠 하나다", () => {
    const { bands, dots } = layoutRow(WEEK, [event("2026-09-08", "2026-09-10")], LIMITS);

    expect(bands).toHaveLength(1);
    expect(bands[0].col).toBe(2); // 일요일이 0 이므로 화요일은 2
    expect(bands[0].span).toBe(3);
    expect(dots).toEqual({});
  });

  it("하루짜리는 띠가 아니라 점이다", () => {
    const { bands, dots } = layoutRow(WEEK, [event("2026-09-09")], LIMITS);

    expect(bands).toHaveLength(0);
    expect(dots["2026-09-09"]).toHaveLength(1);
  });

  it("같은 날 하루짜리 여럿은 한 줄에 나란히 선다 — 세로로 쌓으면 지저분해진다", () => {
    const { bands, bandLanes, dots } = layoutRow(
      WEEK,
      [event("2026-09-09"), event("2026-09-09"), event("2026-09-09")],
      LIMITS,
    );

    expect(bands).toHaveLength(0);
    expect(bandLanes).toBe(0);
    expect(dots["2026-09-09"]).toHaveLength(3);
  });

  it("띠 아래 점이 함께 놓인다", () => {
    const { bands, dots } = layoutRow(
      WEEK,
      [event("2026-09-08", "2026-09-10"), event("2026-09-09")],
      LIMITS,
    );

    expect(bands).toHaveLength(1);
    expect(dots["2026-09-09"]).toHaveLength(1);
  });

  it("주 앞에서 시작한 여행은 왼쪽이 잘린 채로 첫 칸부터 그려진다", () => {
    const { bands } = layoutRow(WEEK, [event("2026-09-03", "2026-09-08")], LIMITS);

    expect(bands[0]).toMatchObject({ col: 0, span: 3, clippedStart: true, clippedEnd: false });
  });

  it("주 밖으로 이어지면 오른쪽이 잘린다 — 둥근 끝은 '여기서 끝난다'는 말이라", () => {
    const { bands } = layoutRow(WEEK, [event("2026-09-11", "2026-09-20")], LIMITS);

    expect(bands[0]).toMatchObject({ col: 5, span: 2, clippedStart: false, clippedEnd: true });
  });

  it("한 칸만 걸쳐도 이어지는 것이면 점이 아니라 띠다", () => {
    // 토요일 하루만 이 주에 들고 다음 주로 이어진다
    const { bands, dots } = layoutRow(WEEK, [event("2026-09-12", "2026-09-15")], LIMITS);

    expect(bands[0]).toMatchObject({ span: 1, clippedEnd: true });
    expect(dots).toEqual({});
  });

  it("주를 통째로 덮으면 양끝이 다 잘린다", () => {
    const { bands } = layoutRow(WEEK, [event("2026-09-01", "2026-09-30")], LIMITS);

    expect(bands[0]).toMatchObject({ col: 0, span: 7, clippedStart: true, clippedEnd: true });
  });

  it("창에 걸치지 않는 것은 아예 빠진다", () => {
    const row = layoutRow(WEEK, [event("2026-10-01", "2026-10-03")], LIMITS);

    expect(row.bands).toHaveLength(0);
    expect(row.bandLanes).toBe(0);
    expect(row.dots).toEqual({});
  });
});

describe("layoutRow — 겹치는 띠를 층으로 쌓는다", () => {
  it("겹치지 않으면 같은 줄에 나란히 눕는다", () => {
    const { bands, bandLanes } = layoutRow(
      WEEK,
      [event("2026-09-06", "2026-09-07"), event("2026-09-10", "2026-09-11")],
      LIMITS,
    );

    expect(bands.map((b) => b.lane)).toEqual([0, 0]);
    expect(bandLanes).toBe(1);
  });

  it("겹치면 아래 줄로 내려간다", () => {
    const { bands, bandLanes } = layoutRow(
      WEEK,
      [event("2026-09-06", "2026-09-09"), event("2026-09-08", "2026-09-11")],
      LIMITS,
    );

    expect(bands.map((b) => b.lane)).toEqual([0, 1]);
    expect(bandLanes).toBe(2);
  });

  it("맞닿기만 한 것도 겹친 것이다 — 한 줄에 붙으면 하나로 읽힌다", () => {
    const { bands } = layoutRow(
      WEEK,
      [event("2026-09-07", "2026-09-09"), event("2026-09-09", "2026-09-11")],
      LIMITS,
    );

    expect(bands.map((b) => b.lane)).toEqual([0, 1]);
  });

  it("긴 것이 위 줄을 잡는다 — 짧은 것이 위면 긴 띠가 아래에서 꺾여 보인다", () => {
    const short = event("2026-09-07", "2026-09-08", { title: "짧은 것" });
    const long = event("2026-09-07", "2026-09-11", { title: "긴 것" });

    // 서버가 준 순서가 뒤집혀 와도 층은 같아야 한다
    for (const rows of [[short, long], [long, short]]) {
      const { bands } = layoutRow(WEEK, rows, LIMITS);
      const byTitle = Object.fromEntries(bands.map((b) => [b.event.title, b.lane]));
      expect(byTitle["긴 것"]).toBe(0);
      expect(byTitle["짧은 것"]).toBe(1);
    }
  });
});

describe("layoutRow — 자리가 모자라면 접는다", () => {
  it("띠가 넘치면 그 날마다 '+n' 으로 센다", () => {
    const three = [
      event("2026-09-08", "2026-09-10"),
      event("2026-09-08", "2026-09-10"),
      event("2026-09-08", "2026-09-09"),
    ];
    const { bands, hidden } = layoutRow(WEEK, three, LIMITS);

    expect(bands).toHaveLength(2);
    expect(hidden).toEqual({ "2026-09-08": 1, "2026-09-09": 1 });
  });

  it("점도 한 줄에 들어갈 만큼만 찍고 나머지를 센다", () => {
    const five = Array.from({ length: 5 }, () => event("2026-09-09"));
    const { dots, hidden } = layoutRow(WEEK, five, LIMITS);

    expect(dots["2026-09-09"]).toHaveLength(3);
    expect(hidden).toEqual({ "2026-09-09": 2 });
  });

  it("자리가 넉넉하면 접히는 것이 없다", () => {
    const three = [
      event("2026-09-08", "2026-09-10"),
      event("2026-09-08", "2026-09-10"),
      event("2026-09-09"),
    ];
    expect(layoutRow(WEEK, three, { bands: 3, dots: 3 }).hidden).toEqual({});
  });
});
