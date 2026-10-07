import type { Zone } from "@/types";

/**
 * 이름의 글자들. 이모지가 앞에 오면 surrogate pair 라 slice 로 자르면 깨진다.
 * 딱지에 쓸 글자라 문장부호·공백은 뺀다 — "우리_집" 에서 "_" 가 딱지에 오면 안 된다.
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

/**
 * 이 공간에 있는 일정을 옮겨 갈 수 있는 공간들.
 *
 * 내 공간의 일정은 넣을 수 있는 공간 어디로든 간다 — 받은 공간으로 보내는 것도 된다.
 * 받은 공간의 일정은 **그 주인의** 공간 안에서만 옮긴다. 함께 고치는 공간이라도 일정을
 * 빼가면 주인의 목록과 알림에서 사라진다(서버도 같은 선에서 막는다).
 *
 * `from` 이 없으면(공간 목록이 아직 안 왔으면) 거르지 않는다.
 */
export function movableZones(writable: Zone[], from: Zone | undefined): Zone[] {
  if (!from || from.role === "owner") return writable;
  return writable.filter((zone) => zone.owner_id === from.owner_id);
}
