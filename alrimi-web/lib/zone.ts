import type { Zone } from "@/types";

/** 이모지가 앞에 오면 surrogate pair 라 slice 로 자르면 깨진다 */
const chars = (name: string) => Array.from(name.trim());

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
    const first = chars(zone.name)[0] ?? "·";
    groups.set(first, [...(groups.get(first) ?? []), zone]);
  }

  for (const [first, group] of groups) {
    if (group.length === 1) {
      marks.set(group[0].id, first);
      continue;
    }
    group.forEach(zone => marks.set(zone.id, zone.name[0]));
  }

  return marks;
}
