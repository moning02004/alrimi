import { describe, expect, it } from "vitest";
import {
  WEEK_DAYS,
  addDays,
  dayIndex,
  groupByDate,
  hourLabel,
  monthGridDays,
  rangeLabel,
  spanDays,
  spanLabel,
  startOfWeek,
  toISO,
  windowDays,
} from "../date";
import type { NoticeListItem } from "@/types";

/** 테스트에서 읽기 쉬우라고. `new Date(y, m-1, d)` 는 로컬 자정이다 */
const d = (iso: string) => {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day);
};

describe("startOfWeek — 주는 일요일에서 시작한다", () => {
  it.each([
    ["2026-09-06", "2026-09-06"], // 일요일은 자기 자신
    ["2026-09-07", "2026-09-06"], // 월요일 → 앞의 일요일
    ["2026-09-09", "2026-09-06"], // 수요일 → 그 주 일요일
    ["2026-09-12", "2026-09-06"], // 토요일까지 같은 주
    ["2026-09-13", "2026-09-13"], // 다음 일요일
    ["2026-10-01", "2026-09-27"], // 달을 거슬러 올라간다
    ["2026-01-01", "2025-12-28"], // 해를 거슬러 올라간다
  ])("%s → %s", (input, expected) => {
    expect(toISO(startOfWeek(d(input)))).toBe(expected);
  });
});

describe("windowDays — 주간 창은 일~토로 고정된다", () => {
  it("주 안 어느 날을 넣어도 같은 창이 나온다", () => {
    const week = ["2026-09-06", "2026-09-09", "2026-09-12"].map((iso) =>
      windowDays(d(iso)).map(toISO),
    );
    expect(week[0]).toEqual(week[1]);
    expect(week[1]).toEqual(week[2]);
    expect(week[0][0]).toBe("2026-09-06");
    expect(week[0][6]).toBe("2026-09-12");
  });

  it("일요일이 되어야 다음 주로 넘어간다", () => {
    expect(toISO(windowDays(d("2026-09-12"))[0])).toBe("2026-09-06");
    expect(toISO(windowDays(d("2026-09-13"))[0])).toBe("2026-09-13");
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

describe("monthGridDays", () => {
  it("42칸이고 첫 칸은 일요일이다", () => {
    for (const iso of ["2026-09-15", "2026-02-10", "2026-11-01"]) {
      const grid = monthGridDays(d(iso));
      expect(grid).toHaveLength(42);
      expect(grid[0].getDay()).toBe(0); // getDay(): 일=0
    }
  });

  it("그 달 1일과 말일을 반드시 담는다", () => {
    const grid = monthGridDays(d("2026-09-15")).map(toISO);
    expect(grid).toContain("2026-09-01");
    expect(grid).toContain("2026-09-30");
  });

  it("주간 창과 시작 요일이 같다", () => {
    // 접었다 펴는 것만으로 첫 칸 요일이 바뀌면 같은 날짜가 다른 자리에 있게 된다.
    // MonthGrid 의 요일 머리글도 이 요일에 맞춰야 한다.
    expect(monthGridDays(d("2026-09-15"))[0].getDay()).toBe(windowDays(d("2026-09-15"))[0].getDay());
  });
});

describe("rangeLabel", () => {
  it("같은 달이면 뒤쪽 달을 생략한다", () => {
    expect(rangeLabel(d("2026-09-06"), d("2026-09-12"))).toBe("9월 6일 – 12일");
  });

  it("달을 넘어가면 뒤쪽에도 달을 적는다", () => {
    expect(rangeLabel(d("2026-09-27"), d("2026-10-03"))).toBe("9월 27일 – 10월 3일");
  });
});

describe("hourLabel — 일정 시각은 24시간제 '시' 다", () => {
  it.each([
    [0, "0시"],
    [9, "9시"],
    [15, "15시"],
    [23, "23시"],
  ])("%i → %s", (hour, expected) => {
    expect(hourLabel(hour)).toBe(expected);
  });
});

describe("toISO", () => {
  it("UTC 로 밀리지 않는다 (new Date(iso) 는 자정이 밀린다)", () => {
    expect(toISO(new Date(2026, 0, 1))).toBe("2026-01-01");
    expect(toISO(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});


/** 목록 카드 하나. 이 테스트가 보는 것은 날짜뿐이다 */
const notice = (id: number, event_date: string, end_date = event_date) =>
  ({
    id,
    event_date,
    end_date,
    event_hour: null,
    title: `#${id}`,
    priority: 4,
    completed_at: null,
    zone_id: 1,
    zone_color: "#2F7A63",
    alerts: { total: 0, sent: 0 },
  }) as NoticeListItem;

describe("spanDays — 양끝을 다 세는 날 수", () => {
  it.each([
    ["2026-09-25", "2026-09-25", 1],
    ["2026-09-25", "2026-09-26", 2],
    ["2026-09-25", "2026-09-27", 3],
    ["2026-09-28", "2026-10-02", 5], // 달을 넘어도
    ["2026-12-30", "2027-01-02", 4], // 해를 넘어도
  ])("%s ~ %s → %i일", (start, end, days) => {
    expect(spanDays(start, end)).toBe(days);
  });

  it("마지막 날이 없거나 거꾸로면 하루로 본다", () => {
    expect(spanDays("2026-09-25", "")).toBe(1);
    expect(spanDays("2026-09-25", "2026-09-24")).toBe(1);
  });
});

describe("dayIndex — 며칠째인지는 일정의 시작일부터 센다", () => {
  it.each([
    ["2026-09-25", 1],
    ["2026-09-26", 2],
    ["2026-09-27", 3],
  ])("%s → %i일차", (day, nth) => {
    expect(dayIndex("2026-09-25", day)).toBe(nth);
  });
});

describe("spanLabel", () => {
  it("하루짜리는 지금까지와 같다", () => {
    expect(spanLabel("2026-09-25", "2026-09-25")).toBe("2026년 9월 25일 (금)");
  });

  it("며칠짜리는 양끝을 다 적고 며칠인지 덧붙인다", () => {
    expect(spanLabel("2026-09-25", "2026-09-27")).toBe(
      "2026년 9월 25일 (금) ~ 2026년 9월 27일 (일) · 3일간",
    );
  });

  it("달을 넘어가도 같은 모양이다", () => {
    expect(spanLabel("2026-09-28", "2026-10-02")).toBe(
      "2026년 9월 28일 (월) ~ 2026년 10월 2일 (금) · 5일간",
    );
  });
});

describe("groupByDate — 며칠짜리는 걸치는 날마다 들어간다", () => {
  it("하루짜리는 그 날 묶음에만 들어간다", () => {
    const groups = groupByDate([notice(1, "2026-09-25")]);
    expect(groups.map((g) => g.iso)).toEqual(["2026-09-25"]);
  });

  it("여행은 걸치는 날마다 한 번씩 나온다", () => {
    const groups = groupByDate([notice(1, "2026-09-25", "2026-09-27")]);
    expect(groups.map((g) => g.iso)).toEqual(["2026-09-25", "2026-09-26", "2026-09-27"]);
    expect(groups.every((g) => g.items[0].id === 1)).toBe(true);
  });

  it("창 밖은 만들지 않는다 — 서버가 창에 걸치는 것을 주기 때문", () => {
    const groups = groupByDate([notice(1, "2026-09-20", "2026-09-30")], {
      from: "2026-09-25",
      to: "2026-09-27",
    });
    expect(groups.map((g) => g.iso)).toEqual(["2026-09-25", "2026-09-26", "2026-09-27"]);
  });

  it("날짜 순으로 선다 — 긴 일정이 먼저 와도 뒤엉키지 않는다", () => {
    const groups = groupByDate([
      notice(1, "2026-09-25", "2026-09-28"),
      notice(2, "2026-09-26"),
    ]);
    expect(groups.map((g) => g.iso)).toEqual([
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
      "2026-09-28",
    ]);
    expect(groups[1].items.map((n) => n.id)).toEqual([1, 2]);
  });

  it("지난 일정은 최근 것부터", () => {
    const groups = groupByDate([notice(1, "2026-09-25", "2026-09-26")], { desc: true });
    expect(groups.map((g) => g.iso)).toEqual(["2026-09-26", "2026-09-25"]);
  });

  it("end_date 가 없는 옛 응답이 섞여도 하루짜리로 읽는다", () => {
    const stale = { ...notice(1, "2026-09-25"), end_date: undefined } as unknown as NoticeListItem;
    expect(groupByDate([stale]).map((g) => g.iso)).toEqual(["2026-09-25"]);
  });
});
