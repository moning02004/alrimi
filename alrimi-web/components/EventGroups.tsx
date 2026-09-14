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

              카드가 아니라 점선 자리다. 실선 카드로 두면 목록을 훑는 중에 한
              건으로 세어지고, 글자만 두면 어디에도 매달리지 않은 채 떠 있어
              바로 아래 날짜의 머리글처럼 읽힌다.
            */
            <p className="rounded-xl border border-dashed border-line px-3 py-3.5 text-sm text-muted">
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
