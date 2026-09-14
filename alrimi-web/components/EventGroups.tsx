import { EventCard } from "./EventCard";
import type { DateGroup } from "@/lib/date";

export function EventGroups({ groups }: { groups: DateGroup[] }) {
  return (
    <>
      {groups.map((group) => (
        // 주간 스트립에서 날짜를 누르면 이 앵커로 스크롤한다. 붙박이 머리글
        // 높이만큼 비켜서야 줄이 그 밑에 깔리지 않는다(globals.css `--sticky-h`).
        <section
          key={group.iso}
          id={`date-${group.iso}`}
          className="scroll-mt-[var(--sticky-h)]"
        >
          <p className="px-1 pb-1.5 pt-4 text-xs font-medium text-muted">{group.label}</p>

          {group.items.length === 0 ? (
            /*
              비어 있어도 자리를 지키라고 만든 칸이다(lib/date.ts `ensure`).
              주간 목록에서 오늘이 그렇다 — 일정이 있는 날만 그리면 맨 위가
              내일 줄인데, 위에서부터 훑는 눈에는 그것이 오늘로 읽힌다.

              **바탕은 카드와 같은 흰색이다.** 처음에는 테두리만 있는 빈 자리로
              뒀는데, 목록 바탕(paper)과 같은 색이라 종이 위에 옅은 선 하나만
              떠 있는 꼴이어서 훑는 눈에 걸리지 않고 지나갔다. 흰 바탕을 깔면
              아래 카드들과 같은 무게로 서서 "오늘" 자리에서 한 번 멈추게 된다.

              테두리만 점선으로 남긴다 — 실선까지 되면 일정 한 건으로 세어진다.
              점선이 "자리는 있고 알맹이는 없다" 를 말한다.
            */
            <p className="rounded-xl border border-dashed border-line bg-card px-3 py-3.5
                          text-sm text-muted">
              등록된 일정이 없어요
            </p>
          ) : (
            <div className="space-y-1.5">
              {group.items.map((event) => (
                // 며칠에 걸치는 일정은 여러 날 묶음에 같이 들어간다. id 만으로 열쇠를
                // 잡으면 React 가 같은 카드로 보고 한 장만 그린다.
                <EventCard key={`${event.id}-${group.iso}`} event={event} on={group.iso} />
              ))}
            </div>
          )}
        </section>
      ))}
    </>
  );
}
