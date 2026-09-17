import type { Zone } from "@/types";

/**
 * 이름의 글자들. 이모지가 앞에 오면 surrogate pair 라 slice 로 자르면 깨진다.
 * 딱지에 쓸 글자라 문장부호·공백은 뺀다 — "아빠_어린이집" 에서 "_" 가 딱지에 오면 안 된다.
 */
const letters = (name: string) =>
  Array.from(name.trim()).filter((char) => /[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(char));

/**
 * 공간을 나타내는 머리글자.
 *
 * 색만으로는 구분이 안 되기 때문에 있다 — 색약에서는 팔레트를 아무리 벌려놔도
 * 3px 막대나 4px 점처럼 **작은 면적**의 색은 읽히지 않는다. 면적을 키우는 대신
 * 색이 아닌 축을 하나 더 얹는다: "우리집"은 `우`, "회사"는 `회`.
 *
 * 색은 그대로 둔다. 지우면 색이 보이는 사람이 쓰던 단서를 뺏는 셈이고,
 * 두 축이 같은 것을 가리키면 어느 쪽이든 읽는 사람이 고를 수 있다.
 *
 * **겹치면 갈라지는 글자를 덧붙인다.** "우리집"·"우리회사"는 `우집`·`우회`가 된다.
 * 앞에서부터 더 자르는 것(`우리`·`우리회`)보다 짧고, 딱지는 이름을 적는 자리가
 * 아니라 한눈에 갈라 보는 자리라서 길이가 곧 값이다. 겹치지 않는 공간은 한 글자
 * 그대로 둔다 — 하나 겹쳤다고 전부 길어지면 다 같이 읽기 어려워진다.
 */
export function zoneMarks(zones: Zone[]): Map<number, string> {
  const marks = new Map<number, string>();

  const groups = new Map<string, Zone[]>();
  for (const zone of zones) {
    const first = letters(zone.name)[0] ?? "·";
    groups.set(first, [...(groups.get(first) ?? []), zone]);
  }

  for (const [first, group] of groups) {
    if (group.length === 1) {
      marks.set(group[0].id, first);
      continue;
    }

    const names = group.map((zone) => letters(zone.name));
    group.forEach((zone, index) => {
      const own = names[index];
      /*
        이 이름에서, 같은 자리의 글자가 무리의 다른 누구와도 다른 첫 자리를 찾아 그 글자를
        붙인다. "우리집"·"우리회사" 는 둘째 자리(리)가 같고 셋째 자리(집·회)에서 갈린다.
        자기 이름이 먼저 끝났으면("아빠" 와 "아빠네집") 첫 글자만 둔다 — 상대가 두 글자라
        그것만으로 갈린다.
      */
      for (let at = 1; at < Math.max(...names.map((name) => name.length)); at += 1) {
        const differs = names.every((other, j) => j === index || other[at] !== own[at]);
        if (!differs) continue;
        marks.set(zone.id, own[at] ? first + own[at] : first);
        return;
      }
      marks.set(zone.id, first);
    });

    // 이름이 완전히 같으면(내 "어린이집" 과 남의 "어린이집") 글자로는 못 가른다. 번호를 붙인다.
    const seen = new Map<string, number>();
    for (const zone of group) {
      const mark = marks.get(zone.id)!;
      const count = (seen.get(mark) ?? 0) + 1;
      seen.set(mark, count);
      if (count > 1) marks.set(zone.id, `${mark}${count}`);
    }
  }

  return marks;
}

/** 나에게 공간을 보여주는 사람 한 명. 받은 공간을 사람마다 칩 하나로 묶는 단위다 */
export interface Sharer {
  id: number;
  name: string;
}

/**
 * 받은 공간의 주인들. 처음 나온 순서대로, 한 사람은 한 번만.
 *
 * 받은 공간을 공간마다 칩으로 세우면 한 사람이 셋을 보여줄 때 칩이 셋 늘어난다. 받은 쪽이
 * 알고 싶은 것은 대개 "누구 것인가" 라 칩은 사람 하나로 묶는다.
 */
export function sharersOf(zones: Zone[]): Sharer[] {
  const seen = new Map<number, Sharer>();
  for (const zone of zones) {
    if (zone.role === "member" && !seen.has(zone.owner_id)) {
      seen.set(zone.owner_id, { id: zone.owner_id, name: zone.owner_name });
    }
  }
  return [...seen.values()];
}

/**
 * 누구의 어느 공간인지 한 줄로. `어린이집` · `아빠_어린이집`
 *
 * 화면에 적는 이름이 아니라 낭독 이름·상세의 공간 표시에 쓴다. 내 공간에 내 이름을 붙이지
 * 않는 것은, 대부분이 내 것이라 같은 이름이 되풀이되기 때문이다.
 */
export function listLabel(zone: Pick<Zone, "role" | "name" | "owner_name">): string {
  return zone.role === "member" ? `${zone.owner_name}_${zone.name}` : zone.name;
}
