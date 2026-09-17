"use client";

import { useEffect, useState } from "react";
import { LuSearch, LuX } from "react-icons/lu";
import { useSearchEvents } from "@/hooks/useEvents";
import { useZones } from "@/hooks/useZones";
import { sectionLabel, startOfDay, toDate, toISO } from "@/lib/date";
import { EventCard } from "@/components/EventCard";
import { ErrorBlock, LoadingBlock } from "@/components/Loading";
import { ZoneFilter } from "@/components/ZoneFilter";
import type { EventListItem } from "@/types";

/** 입력을 이만큼 멈추면 찾는다. 글자마다 요청이 나가지 않게 */
const DEBOUNCE_MS = 250;

/**
 * 제목·내용으로 일정을 찾는다. "소풍 언제였지" 와 "다음 소풍 언제지" 가 둘 다 여기로 온다.
 *
 * **날짜로 펼치지 않는다.** 다른 목록은 며칠짜리 일정을 걸친 날마다 한 장씩 그리지만,
 * 찾을 때 60일짜리 방학이 60줄로 나오면 다른 결과가 전부 밀려난다. 한 일정은 한 장이고
 * 시작하는 날 아래에 선다.
 *
 * 순서는 서버가 정한 그대로다 — 앞으로의 일정(가까운 날부터), 그다음 지난 일정(최근부터).
 * 보류한 것은 날짜가 없는 것이라 따로 맨 아래에 모은다.
 */
export default function SearchPage() {
  const { scope } = useZones();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const term = query.trim();
  const search = useSearchEvents(term, scope);
  const results = term.length >= 2 ? (search.data ?? []) : [];

  const today = toISO(startOfDay(new Date()));
  const held = results.filter((event) => event.held_at !== null);
  const scheduled = results.filter((event) => event.held_at === null);
  const upcoming = scheduled.filter((event) => event.end_date >= today);
  const past = scheduled.filter((event) => event.end_date < today);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-card px-4 py-3">
        <div className="mx-auto w-full max-w-2xl">
          <h1 className="sr-only">일정 검색</h1>
          <div className="relative">
            <LuSearch
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            />
            <label htmlFor="search-input" className="sr-only">
              찾을 말
            </label>
            <input
              id="search-input"
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              // 이 화면에 온 까닭이 곧 적는 것이라 바로 적을 수 있게 둔다
              autoFocus
              maxLength={50}
              enterKeyHint="search"
              placeholder="제목이나 내용 (예: 소풍 도시락)"
              className="w-full rounded-xl border border-line bg-paper py-2.5 pl-9 pr-10 text-base
                         placeholder:text-muted/50 focus:border-pine focus:outline-none
                         [&::-webkit-search-cancel-button]:hidden"
            />
            {input && (
              <button
                type="button"
                onClick={() => setInput("")}
                aria-label="지우기"
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center
                           justify-center rounded-full text-muted hover:bg-line/60 hover:text-ink"
              >
                <LuX className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* 공간으로 좁혀 둔 채 찾으면 결과가 적게 나온다. 무엇으로 좁혔는지 보이게 둔다 */}
          <div className="mt-2">
            <ZoneFilter />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 pb-4" aria-live="polite">
        {term.length < 2 ? (
          <p className="py-10 text-center text-sm text-muted">두 글자 이상 적으면 찾아드려요</p>
        ) : search.isError ? (
          <ErrorBlock onRetry={() => search.refetch()} />
        ) : search.isLoading ? (
          <LoadingBlock />
        ) : results.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            &lsquo;{term}&rsquo;에 맞는 일정이 없어요
          </p>
        ) : (
          <>
            <p className="px-1 pt-4 text-xs text-muted">
              {results.length}건{results.length >= 100 && " · 더 있을 수 있어요. 말을 더 적어 좁혀보세요"}
            </p>
            <ResultSection title="앞으로" events={upcoming} />
            <ResultSection title="지난 일정" events={past} />
            <ResultSection title="보류" events={held} withDate={false} />
          </>
        )}
      </main>
    </>
  );
}

function ResultSection({
  title,
  events,
  withDate = true,
}: {
  title: string;
  events: EventListItem[];
  /** 보류한 것은 날짜가 "있던 날" 일 뿐이라 날짜 줄로 묶지 않는다 */
  withDate?: boolean;
}) {
  if (events.length === 0) return null;

  // 서버가 준 순서를 지키며 시작일로만 묶는다 (걸친 날마다 펼치지 않는다)
  const groups: { iso: string; items: EventListItem[] }[] = [];
  for (const event of events) {
    const key = withDate ? event.event_date : "";
    const last = groups[groups.length - 1];
    if (last && last.iso === key) last.items.push(event);
    else groups.push({ iso: key, items: [event] });
  }

  return (
    <section className="pt-3">
      <h2 className="px-1 pt-2 text-sm font-semibold">{title}</h2>
      {groups.map((group) => (
        <div key={group.iso || title}>
          {withDate && (
            <p className="px-1 pb-1.5 pt-3 text-xs font-medium text-muted">{dateLabel(group.iso)}</p>
          )}
          <div className={`space-y-1.5 ${withDate ? "" : "pt-2"}`}>
            {group.items.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/** 올해가 아니면 연도를 앞에 붙인다. 찾기는 몇 해 전 일정까지 닿는다 */
function dateLabel(iso: string) {
  const year = toDate(iso).getFullYear();
  const label = sectionLabel(iso);
  return year === new Date().getFullYear() ? label : `${year}년 ${label}`;
}
