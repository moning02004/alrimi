import { NoticeCard } from "./NoticeCard";
import type { DateGroup } from "@/lib/date";

export function NoticeGroups({ groups }: { groups: DateGroup[] }) {
  return (
    <>
      {groups.map((group) => (
        // 주간 스트립에서 날짜를 누르면 이 앵커로 스크롤한다
        <section key={group.iso} id={`date-${group.iso}`} className="scroll-mt-40">
          <p className="px-1 pb-1.5 pt-4 text-xs font-medium text-muted">{group.label}</p>
          <div className="space-y-1.5">
            {group.items.map((notice) => (
              // 며칠에 걸치는 일정은 여러 날 묶음에 같이 들어간다. id 만으로 열쇠를
              // 잡으면 React 가 같은 카드로 보고 한 장만 그린다.
              <NoticeCard key={`${notice.id}-${group.iso}`} notice={notice} on={group.iso} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
