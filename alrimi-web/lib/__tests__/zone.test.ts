import { describe, expect, it } from "vitest";
import { movableZones, zoneMarks } from "../zone";
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
  muted: false,
  owner_id: 1,
  role: "owner",
  owner_name: "엄마",
  ...over,
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

describe("movableZones — 일정을 옮겨 갈 수 있는 공간", () => {
  const home = zone(1, "우리집");
  const work = zone(2, "회사");
  const kids = zone(3, "어린이집", { role: "member", owner_id: 11, owner_name: "아빠" });
  const farm = zone(4, "텃밭", { role: "member", owner_id: 12, owner_name: "할머니" });
  const writable = [home, work, kids, farm];

  it("내 공간의 일정은 받은 공간으로도 보낼 수 있다", () => {
    expect(movableZones(writable, home)).toEqual(writable);
  });

  it("받은 공간의 일정은 그 주인의 공간 안에서만 옮긴다", () => {
    expect(movableZones(writable, kids)).toEqual([kids]);
  });

  it("공간 목록이 아직 안 왔으면 거르지 않는다", () => {
    expect(movableZones(writable, undefined)).toEqual(writable);
  });
});
