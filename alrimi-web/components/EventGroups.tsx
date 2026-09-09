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
          <div className="space-y-1.5">
            {group.items.map((event) => (
              // 며칠에 걸치는 일정은 여러 날 묶음에 같이 들어간다. id 만으로 열쇠를
              // 잡으면 React 가 같은 카드로 보고 한 장만 그린다.
              <EventCard key={`${event.id}-${group.iso}`} event={event} on={group.iso} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
