"use client";

import { useNotices } from "@/hooks/useNotices";
import { useZones } from "@/hooks/useZones";
import { groupByDate } from "@/lib/date";
import { NoticeGroups } from "@/components/NoticeGroups";
import { ErrorBlock, LoadingBlock } from "@/components/Loading";
import { ZoneChips } from "@/components/ZoneChips";

/**
 * 지난 일정. 서버가 최근 것부터 내려준다 — 오래된 것부터 쌓으면 방금 지난
 * 일정을 찾으려고 끝까지 스크롤해야 한다.
 *
 * 완료한 것도 그대로 남긴다. 끝낸 것을 지워버리면 그 날 무엇이 있었는지가
 * 틀리게 남는다. 화면에서는 흐리게 그린다.
 */
export default function PastPage() {
  const { selectedZoneId } = useZones();
  const { data, isLoading, isError, refetch } = useNotices("past", selectedZoneId);
  const notices = data ?? [];

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-card px-4 py-3">
        <div className="mx-auto w-full max-w-2xl">
          <h1 className="text-base font-semibold">지난 일정</h1>
          <div className="mt-2">
            <ZoneChips />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 pb-4">
        {isLoading && <LoadingBlock />}
        {isError && <ErrorBlock onRetry={() => refetch()} />}

        {!isLoading &&
          !isError &&
          (notices.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">지난 일정이 없어요</p>
          ) : (
            <NoticeGroups groups={groupByDate(notices)} />
          ))}
      </main>
    </>
  );
}
