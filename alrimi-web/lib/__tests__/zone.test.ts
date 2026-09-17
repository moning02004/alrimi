import { describe, expect, it } from "vitest";
import { listLabel, sharersOf, zoneMarks } from "../zone";
import type { Zone } from "@/types";

const zone = (id: number, name: string, over: Partial<Zone> = {}): Zone => ({
  id,
  name,
  color: "#2F7A63",
  upcoming_count: 0,
  past_count: 0,
  shared: false,
  viewers_can_edit: false,
  writable: true,
  owner_id: 1,
  role: "owner",
  owner_name: "엄마",
  ...over,
});

describe("sharersOf — 받은 공간을 사람마다 하나로", () => {
  it("한 사람이 공간을 여럿 보여줘도 한 번만, 처음 나온 순서대로", () => {
    expect(
      sharersOf([
        zone(1, "우리집"),
        zone(2, "어린이집", { role: "member", owner_id: 11, owner_name: "아빠" }),
        zone(3, "회사", { role: "member", owner_id: 11, owner_name: "아빠" }),
        zone(4, "텃밭", { role: "member", owner_id: 12, owner_name: "할머니" }),
      ]),
    ).toEqual([
      { id: 11, name: "아빠" },
      { id: 12, name: "할머니" },
    ]);
  });
});

describe("listLabel — 목록 제목 앞의 이름", () => {
  it("받은 공간은 사람_공간, 내 공간은 공간 이름만", () => {
    expect(listLabel(zone(2, "어린이집", { role: "member", owner_name: "아빠" }))).toBe("아빠_어린이집");
    expect(listLabel(zone(1, "어린이집"))).toBe("어린이집");
  });
});

describe("zoneMarks — 머리글자 딱지", () => {
  const marks = (...names: string[]) => {
    const result = zoneMarks(names.map((name, index) => zone(index + 1, name)));
    return names.map((_, index) => result.get(index + 1));
  };

  it("겹치지 않으면 한 글자", () => {
    expect(marks("우리집", "회사")).toEqual(["우", "회"]);
  });

  it("첫 글자가 겹치면 갈라지는 글자를 덧붙인다", () => {
    expect(marks("우리집", "우리회사", "회사")).toEqual(["우집", "우회", "회"]);
  });

  it("먼저 끝나는 이름은 첫 글자만, 긴 쪽은 갈라지는 글자를 붙인다", () => {
    expect(marks("아빠", "아빠네집")).toEqual(["아", "아네"]);
  });

  it("문장부호는 딱지에 오지 않는다", () => {
    expect(marks("아빠_어린이집", "아빠_회사")).toEqual(["아어", "아회"]);
  });

  it("이름이 완전히 같으면 번호를 붙인다", () => {
    expect(marks("어린이집", "어린이집")).toEqual(["어", "어2"]);
  });
});
