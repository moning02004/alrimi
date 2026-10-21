"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEvents, usePastEvents } from "@/hooks/useEvents";
import { DeleteSelected, SelectToggle } from "@/components/SelectionActions";
import { useSelection } from "@/store/ui";
import { useZones } from "@/hooks/useZones";
import { groupByDate } from "@/lib/date";
import { EventGroups } from "@/components/EventGroups";
import { HeldList } from "@/components/HeldList";
import { ErrorBlock, LoadingBlock } from "@/components/Loading";
import { ZoneFilter } from "@/components/ZoneFilter";

type Tab = "past" | "held";

/**
 * 지금 목록에 없는 일정들. 두 탭이 서로 다른 까닭으로 빠져 있다.
 *
 * **지난 일정** — 날이 지나서 빠진 것. 기록이라 완료한 것도 그대로 남기고
 * (끝낸 것을 지워버리면 그 날 무엇이 있었는지가 틀리게 남는다) 화면에서만
 * 흐리게 그린다. 최근 것부터 — 오래된 것부터 쌓으면 방금 지난 일정을 찾으려고
 * 끝까지 스크롤해야 한다.
 *
 * **보류** — 날을 아직 안 잡아서 빠진 것. 지우는 대신 치워둔 자리다.
 *
 * 두 탭이 한 페이지에 있는 것은 둘 다 "지금 홈에 없는 것" 을 찾을 때 오는
 * 자리여서다. 아래 탭바에 칸을 하나 더 내주지 않은 것이기도 하다 — 폰에서
 * 늘 보이는 자리는 홈·등록·설정 셋이면 충분하다.
 */
export default function PastPage() {
  const { scope } = useZones();
  const [tab, setTab] = useState<Tab>("past");
  const stopSelecting = useSelection((s) => s.stop);
  const selecting = useSelection((s) => s.active);

  /*
    탭을 옮기거나 화면을 떠나면 고르기를 끈다. 보류 탭의 줄은 고르는 카드가 아니고
    (`HeldList`), 고른 것을 다른 화면까지 들고 가면 거기 카드가 까닭 없이 고르는
    자리가 된다.
  */
  useEffect(() => stopSelecting, [tab, stopSelecting]);

  const past = usePastEvents(scope);
  /*
    보류함은 탭을 누르기 전에도 받아둔다 — 탭에 개수를 적어야 해서다.
    치워둔 것이 있다는 사실 자체가 여기 올 이유인데, 그 숫자가 탭을 눌러야만
    보이면 보류함이 비어 있는 사람과 구별되지 않는다. 한 줌짜리 목록이다.
  */
  const held = useEvents("held", scope);
  const heldCount = held.data?.length ?? 0;

  const events = useMemo(() => past.data?.pages.flat() ?? [], [past.data]);
  // 끝이 보일 때 부르는 자리가 이 함수를 붙들고 있다. 그릴 때마다 새로 만들면 지켜보기를 매번 다시 건다
  const { fetchNextPage } = past;
  const fetchMore = useCallback(() => void fetchNextPage(), [fetchNextPage]);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-card px-4 py-3">
        <div className="mx-auto w-full max-w-2xl">
          {/* 머리글은 탭이 겸한다 — 위에 "지난 일정" 을 또 적으면 같은 말이 두 줄이다 */}
          <h1 className="sr-only">지난 일정/보류</h1>

          {/*
            밑줄 탭이다. 알약 모양으로 하면 아래 공간 칩과 같은 생김새가 되어,
            두 줄이 같은 축(공간)을 두 번 고르는 것처럼 읽힌다.
          */}
          <div className="flex items-end justify-between gap-3 border-b border-line">
            <div role="tablist" className="flex gap-4">
              <TabButton on={tab === "past"} onClick={() => setTab("past")}>
                지난 일정
              </TabButton>
              <TabButton on={tab === "held"} onClick={() => setTab("held")}>
                보류
                {heldCount > 0 && <span className="ml-1.5 tabular-nums">{heldCount}</span>}
              </TabButton>
            </div>

            {/*
              지난 일정만 여러 개를 고를 수 있다. 보류함의 줄은 카드가 아니라 "다시 잡기"
              하나짜리 자리라(`HeldList`) 고를 것이 없다.
            */}
            {/*
              지난 일정만 여러 개를 고를 수 있다. 보류함의 줄은 카드가 아니라 "다시 잡기"
              하나짜리 자리라(`HeldList`) 고를 것이 없다.

              고르는 중에는 삭제가 옆에 선다 — 홈 목록과 같은 자리, 같은 모양이다.
            */}
            {tab === "past" && (
              <div className="flex shrink-0 items-center gap-2 pb-1.5">
                {selecting && <DeleteSelected />}
                <SelectToggle />
              </div>
            )}
          </div>

          <div className="mt-2">
            <ZoneFilter />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 pb-4">
        {tab === "held" ? (
          <HeldList zoneId={scope} />
        ) : (
          <>
            {past.isLoading && <LoadingBlock />}
            {past.isError && <ErrorBlock onRetry={() => past.refetch()} />}

            {!past.isLoading &&
              !past.isError &&
              (events.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">지난 일정이 없어요</p>
              ) : (
                <>
                  {/* 최근 것부터. 며칠짜리 일정은 걸친 날마다 한 번씩 나온다. */}
                  <EventGroups groups={groupByDate(events, { desc: true })} />
                  {past.hasNextPage && (
                    <MoreOnScroll
                      loading={past.isFetchingNextPage}
                      failed={past.isFetchNextPageError}
                      onMore={fetchMore}
                    />
                  )}
                </>
              ))}
          </>
        )}
      </main>

    </>
  );
}

/**
 * 지난 일정의 다음 쪽. 목록 끝이 보이면 알아서 부르고, 버튼으로도 부를 수 있다 — 화면 읽기
 * 프로그램이나 스크롤 없이 끝이 이미 보이는 큰 화면에서도 이어 볼 수 있어야 한다.
 */
function MoreOnScroll({
  loading,
  failed,
  onMore,
}: {
  loading: boolean;
  failed: boolean;
  onMore: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const node = ref.current;
    // 실패했으면 저절로 다시 부르지 않는다. 끝에 머문 채로 요청이 되풀이된다
    if (!node || loading || failed || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => entries.some((entry) => entry.isIntersecting) && onMore(),
      { rootMargin: "400px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loading, failed, onMore]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onMore()}
      disabled={loading}
      className={`mt-2 w-full rounded-lg py-3 text-center text-sm transition-colors hover:bg-card
                  ${failed ? "text-red-600" : "text-muted"}`}
    >
      {loading ? "불러오는 중" : failed ? "불러오지 못했어요 · 다시 시도" : "이전 일정 더 보기"}
    </button>
  );
}

function TabButton({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={on}
      onClick={onClick}
      // 밑줄은 고르지 않은 쪽에도 투명으로 깔아둔다. 켤 때만 그리면 그만큼
      // 줄 높이가 달라져 탭을 옮길 때마다 아래 목록이 1px 씩 들썩인다.
      className={`-mb-px border-b-2 pb-2 text-base transition-colors ${
        on ? "border-pine font-semibold text-pine" : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
