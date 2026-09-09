"use client";

import {Suspense, useCallback, useEffect, useRef, useState} from "react";
import {useCalendar, useEventsByDate, useEventsInRange} from "@/hooks/useEvents";
import {useZones} from "@/hooks/useZones";
import {useIsDesktop} from "@/hooks/useMediaQuery";
import {
    addDays,
    groupByDate,
    monthGridDays,
    monthLabel,
    rangeLabel,
    shiftMonth,
    startOfDay,
    startOfMonth,
    toDate,
    toISO,
    windowDays,
} from "@/lib/date";
import {CalendarHeader} from "@/components/CalendarHeader";
import {MonthGrid} from "@/components/MonthGrid";
import {DayPanel} from "@/components/DayPanel";
import {EventDetail} from "@/components/EventDetail";
import {EventGroups} from "@/components/EventGroups";
import {ErrorBlock, LoadingBlock} from "@/components/Loading";
import Link from "next/link";
import {useRouter, useSearchParams} from "next/navigation";
import {pageUrl} from "@/constants/routeUrl";
import {ZoneChips} from "@/components/ZoneChips";
import {UpcomingList} from "@/components/UpcomingList";
import {useAddSheet} from "@/store/ui";

/**
 * `useSearchParams` 를 쓰는 부분은 Suspense 로 감싼다. 감싸지 않으면 Next 가
 * 이 페이지를 정적으로 미리 그리지 못한다고 빌드에서 막는다.
 */
export default function HomePage() {
    return (
        <Suspense fallback={<LoadingBlock/>}>
            <Home/>
        </Suspense>
    );
}

function Home() {
    const {selectedZoneId} = useZones();
    const router = useRouter();
    const searchParams = useSearchParams();
    const {open: addOpen, openAdd} = useAddSheet();
    const isDesktop = useIsDesktop();

    const [expanded, setExpanded] = useState(false);
    /** 붙박이로 서는 두 조각. 높이를 재서 아래가 비켜설 거리로 내보낸다 */
    const headerRef = useRef<HTMLElement>(null);
    const rangeRowRef = useRef<HTMLDivElement>(null);
    /**
     * PC 에서 옆 칸에 펼쳐 놓은 일정. 전체 화면으로 넘어가면 달력이 통째로
     * 사라져서, 하나씩 확인할 때마다 뒤로 → 다시 클릭을 반복하게 된다.
     *
     * 상태를 주소(`?event=13`)에 둔다 — 새로고침해도 보던 것이 그대로 남고,
     * 브라우저 뒤로가기가 목록으로 돌아가는 버튼이 되며, 링크로 건넬 수 있다.
     */
    const openEventId = Number(searchParams.get("event")) || null;

    const setOpenEventId = useCallback(
        (eventId: number | null) => {
            const next = new URLSearchParams(searchParams.toString());
            if (eventId) next.set("event", String(eventId));
            else next.delete("event");
            const query = next.toString();
            const url = query ? `${pageUrl.home}?${query}` : pageUrl.home;

            // 열 때는 쌓고(뒤로가기로 닫히도록), 닫을 때는 덮어쓴다(빈 칸이 쌓이지 않게)
            if (eventId) router.push(url, {scroll: false});
            else router.replace(url, {scroll: false});
        },
        [router, searchParams],
    );
    /** 보고 있는 자리. 주간일 때는 그 주, 월간일 때는 그 달 */
    const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
    const [selectedDate, setSelectedDate] = useState(() => toISO(startOfDay(new Date())));

    const todayISO = toISO(startOfDay(new Date()));

    /**
     * PC 는 늘 월간 + 하루다. 가로가 남으니 달력을 접을 이유가 없고, 접었다 펴는
     * 손잡이도 마우스에는 군더더기다. 모바일에서만 접힘/펼침이 있다.
     */
    const monthMode = isDesktop || expanded;

    const grid = monthMode ? monthGridDays(anchor) : windowDays(anchor);
    const from = toISO(grid[0]);
    const to = toISO(grid[grid.length - 1]);
    const calendar = useCalendar(from, to, selectedZoneId);

    // 스트립과 목록이 같은 기간만 본다. 그 밖은 ‹ › 로 넘겨서 본다.
    const list = useEventsInRange(from, to, selectedZoneId, !monthMode);
    const day = useEventsByDate(selectedDate, selectedZoneId, monthMode);

    const events = list.data ?? [];
    const dayItems = day.data ?? [];

    /**
     * 주간 목록이 그리기 시작하는 날.
     *
     * 창이 달력 한 주(일~토)라 수요일에 열어도 월·화가 위에 남는다. 그것은 이미
     * 지난 일정인데, 위에서부터 훑는 사람에게는 아직 해야 할 일처럼 읽힌다.
     * 그래서 오늘 앞은 아예 그리지 않고, 그 앞은 "지난 일정 보기" 로 넘긴다.
     *
     * **지난 주로 넘겨 볼 때는 자르지 않는다.** ‹ 로 일부러 뒤로 간 것이라
     * 오늘로 자르면 화면이 통째로 빈다.
     */
    const listFrom = to >= todayISO && from < todayISO ? todayISO : from;
    const hidPast = listFrom !== from;

    // 서버는 이 창에 **걸치는** 것을 준다. 창으로 잘라야 지난주에 떠난 여행 때문에
    // 위에 지난주 날짜가 붙지 않는다.
    const groups = groupByDate(events, {from: listFrom, to});
    // 지난 날에는 등록을 열지 않는다. 알림 시각이 이미 지나 저장하자마자 다 나가버린다.
    const canAddOnSelected = selectedDate >= todayISO;

    const moveTo = (next: Date) => {
        setAnchor(startOfDay(next));
        if (monthMode) setSelectedDate(toISO(startOfDay(next)));
    };

    // useEffect 의존성에 들어가므로 매 렌더 새로 만들지 않는다
    const goToday = useCallback(() => {
        const today = startOfDay(new Date());
        setAnchor(today);
        setSelectedDate(toISO(today));
    }, []);

    /**
     * 열고 닫을 때는 오늘로 돌아온다.
     *
     * 지난 달을 보다가 접으면 주간 스트립이 그 달에 남는데, 접는 동작은 대개
     * "됐고 오늘 보자"라서 거기 서 있으면 다시 오늘로 오는 조작이 한 번 더 든다.
     */
    const toggleExpanded = (next: boolean) => {
        setExpanded(next);
        goToday();
    };

    /**
     * 접었을 때 스트립은 고르는 것이 아니라 목록의 미리보기라, 탭은 그 날짜 줄로
     * 스크롤만 한다. 월간에서는 선택이 되고 옆(또는 아래) 목록이 그 하루로 바뀐다.
     */
    const pickDay = (iso: string) => {
        if (monthMode) {
            setSelectedDate(iso);
            // 다른 날로 옮겼는데 옆 칸에 어제 일정이 남아 있으면 헷갈린다
            setOpenEventId(null);
            return;
        }
        document.getElementById(`date-${iso}`)?.scrollIntoView({behavior: "smooth", block: "start"});
    };

    /**
     * PC 에서 달력을 키보드로 넘긴다. 화살표로 하루씩·한 주씩, T 로 오늘.
     *
     * 마우스로 칸을 하나씩 겨냥하는 것보다 빠르고, 달을 넘어가면 달력도 따라간다.
     * 입력 중이거나 시트가 열려 있으면 받지 않는다 — 그쪽이 먼저다.
     */
    useEffect(() => {
        if (!isDesktop) return;

        const STEP: Record<string, number> = {
            ArrowLeft: -1,
            ArrowRight: 1,
            ArrowUp: -7,
            ArrowDown: 7,
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (addOpen || e.metaKey || e.ctrlKey || e.altKey) return;
            const el = e.target as HTMLElement | null;
            if (el?.isContentEditable || /^(input|textarea|select)$/i.test(el?.tagName ?? "")) return;

            // 옆 칸에 상세가 열려 있으면 화살표는 그 화면 몫이다. Esc 로 먼저 닫는다.
            if (e.key === "Escape" && openEventId !== null) {
                e.preventDefault();
                setOpenEventId(null);
                return;
            }
            if (openEventId !== null) return;

            if (e.key === "t" || e.key === "T") {
                e.preventDefault();
                goToday();
                return;
            }

            const step = STEP[e.key];
            if (step === undefined) return;
            e.preventDefault();

            const next = addDays(toDate(selectedDate), step);
            setSelectedDate(toISO(next));
            setOpenEventId(null);
            // 달을 벗어나면 달력도 그 달로 넘긴다. 안 그러면 고른 날이 화면 밖이다.
            if (next.getMonth() !== anchor.getMonth() || next.getFullYear() !== anchor.getFullYear()) {
                setAnchor(startOfMonth(next));
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isDesktop, addOpen, selectedDate, anchor, goToday, openEventId, setOpenEventId]);

    /**
     * 화면 위에 붙어 서는 것들의 높이를 재서 내보낸다.
     *
     * 둘이 위아래로 붙는다 — 머리글(달력·존 칩) 아래에 기간 줄. 그래서 값도 둘이다.
     *   `--header-h` 기간 줄이 어디에 설지
     *   `--sticky-h` 목록의 날짜 줄이 얼마나 비켜설지 (둘을 합친 값)
     *
     * 스트립에서 날짜를 누르면 그 날짜 줄로 스크롤하는데, 비켜설 거리가 모자라면
     * 그 줄이 붙박이들 밑에 깔린다. 높이는 고정이 아니다 — 그 주에 띠가 몇 줄이냐에
     * 따라 스트립이 오르내리고, 접고 펴면 통째로 바뀐다. 그래서 px 로 박지 않고
     * `ResizeObserver` 로 따라간다.
     */
    useEffect(() => {
        const header = headerRef.current;
        if (!header) return;

        /*
          반올림 방향이 둘 다 중요하다. 실제 높이는 정수가 아니다(164.5px 처럼
          나온다) — `offsetHeight` 를 그냥 쓰면 165 로 올림돼서 기간 줄이 머리글보다
          0.5px 아래에 서고, 그 틈으로 카드가 비쳐 지나간다.

          그래서 기간 줄이 설 자리는 내림한다. 조금 겹치는 쪽은 안전하다 — 머리글이
          위에 있어서(z-20) 겹친 만큼은 그 밑에 가려진다. 반대로 목록이 비켜설
          거리는 올림한다. 모자라면 눌러서 옮겨간 날짜 줄이 붙박이 밑에 깔린다.
        */
        const publish = () => {
            const root = document.documentElement.style;
            const head = header.getBoundingClientRect().height;
            const row = rangeRowRef.current?.getBoundingClientRect().height ?? 0;
            root.setProperty("--header-h", `${Math.floor(head)}px`);
            root.setProperty("--sticky-h", `${Math.ceil(head + row)}px`);
        };

        publish();
        const observer = new ResizeObserver(publish);
        observer.observe(header);
        if (rangeRowRef.current) observer.observe(rangeRowRef.current);
        return () => observer.disconnect();
        // PC 에는 이 머리글이 없고, 펼치면 기간 줄이 사라진다. 둘 다 다시 붙잡아야 한다.
    }, [isDesktop, expanded]);

    /**
     * 모바일에는 옆 칸이 없다. `?event=` 를 들고 좁은 화면으로 들어오면
     * (PC 에서 복사한 링크를 폰에서 열면) 전체 화면 상세로 넘겨준다.
     */
    useEffect(() => {
        if (isDesktop || openEventId === null) return;
        router.replace(pageUrl.event(openEventId));
    }, [isDesktop, openEventId, router]);

    // ── PC: 왼쪽 달력, 오른쪽 그 하루 ────────────────────────────────
    if (isDesktop) {
        return (
            <div className="flex h-full min-h-0 gap-5 p-5">
                <aside className="flex w-[340px] shrink-0 flex-col gap-3">
                    <div className="rounded-2xl border border-line bg-card p-3">
                        <div className="flex items-center justify-between px-1">
                            <h1 className="text-base font-semibold">{monthLabel(anchor)}</h1>
                            <div className="flex items-center gap-0.5 text-sm text-muted">
                                <button
                                    onClick={() => moveTo(shiftMonth(anchor, -1))}
                                    aria-label="지난 달"
                                    className="rounded-md px-2 py-0.5 hover:bg-paper hover:text-ink"
                                >
                                    ‹
                                </button>
                                <button
                                    onClick={goToday}
                                    title="오늘로 (T)"
                                    className="rounded-md px-1.5 py-0.5 text-xs hover:bg-paper hover:text-ink"
                                >
                                    오늘
                                </button>
                                <button
                                    onClick={() => moveTo(shiftMonth(anchor, 1))}
                                    aria-label="다음 달"
                                    className="rounded-md px-2 py-0.5 hover:bg-paper hover:text-ink"
                                >
                                    ›
                                </button>
                            </div>
                        </div>

                        <MonthGrid
                            anchor={anchor}
                            selected={selectedDate}
                            events={calendar.data ?? []}
                            onPickDay={pickDay}
                            size="lg"
                        />
                    </div>

                    {/* 달력은 "있다"만 말한다. 무엇인지는 여기서 눌러보지 않고 읽는다 */}
                    <UpcomingList
                        zoneId={selectedZoneId}
                        selected={selectedDate}
                        onPick={setSelectedDate}
                    />
                </aside>

                <section className="flex min-w-0 flex-1 flex-col">
                    <div className="pb-4">
                        <ZoneChips/>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                        {openEventId !== null ? (
                            <EventDetail
                                eventId={openEventId}
                                onClose={() => setOpenEventId(null)}
                                onDeleted={() => setOpenEventId(null)}
                                backLabel="← 목록"
                            />
                        ) : (
                            <DayPanel
                                date={selectedDate}
                                items={dayItems}
                                isLoading={day.isLoading}
                                isError={day.isError}
                                onRetry={() => day.refetch()}
                                canAdd={canAddOnSelected}
                                onAdd={() => openAdd(selectedDate)}
                                onSelect={setOpenEventId}
                                size="lg"
                            />
                        )}
                    </div>
                </section>
            </div>
        );
    }

    // ── 모바일: 접으면 주간 + 그 주 목록, 펼치면 월간 + 하루 ──────────
    return (
        <>
            <header
                ref={headerRef}
                className="sticky top-0 z-20 border-b border-line bg-card px-3 pb-2 pt-3"
            >
                <CalendarHeader
                    expanded={expanded}
                    onToggle={toggleExpanded}
                    anchor={anchor}
                    selected={selectedDate}
                    events={calendar.data ?? []}
                    onMove={moveTo}
                    onPickDay={pickDay}
                    jumpFrom={listFrom}
                />

                <div className="mt-2 px-1">
                    <ZoneChips/>
                </div>
            </header>

            <main className="px-4 pb-4">
                {expanded ? (
                    <DayPanel
                        date={selectedDate}
                        items={dayItems}
                        isLoading={day.isLoading}
                        isError={day.isError}
                        onRetry={() => day.refetch()}
                        canAdd={canAddOnSelected}
                        onAdd={() => openAdd(selectedDate)}
                    />
                ) : (
                    <>
                        {/*
                          지금 보고 있는 기간과, 그 앞은 어디서 보는지가 한 줄에 있다.

                          링크가 목록 맨 아래에 있을 때는 끝까지 스크롤해야 나와서
                          거의 눌리지 않았다. 여기서는 잘려나간 날들 바로 옆이라,
                          "월·화는 어디 갔지" 하는 자리에서 답이 같이 보인다.

                          **머리글이 아니라 목록의 것이다.** 바탕도 카드가 아니라
                          목록과 같은 종이색이라, 달력 묶음이 아니라 아래 목록에
                          붙은 이름표로 읽힌다. 대신 같이 흘러가지는 않는다 —
                          조금만 내려도 기간 이름이 사라지면 긴 주를 훑는 동안
                          지금 어느 창을 보는지 알 수 없어진다.

                          머리글 바로 밑에 붙어 서는데, 그 높이는 고정이 아니라서
                          (그 주에 띠가 몇 줄이냐에 따라 스트립이 오르내리고, 접고
                          펴면 통째로 바뀐다) 실측한 `--header-h` 를 쓴다.

                          `-mx-4` 는 이 줄만 창 끝까지 넓히는 것이다. 안 그러면
                          붙어 선 동안 양옆 여백으로 카드가 비쳐 지나간다.

                          펼쳤을 때는 없다. 그때 아래는 하루 보기라 제 날짜를 스스로
                          적고, 주간 기간은 그 화면과 아무 상관이 없다.
                        */}
                        <div
                            ref={rangeRowRef}
                            className="sticky top-[var(--header-h)] z-10 -mx-4 flex items-baseline shadow-sm
                                       justify-between gap-3 bg-paper px-5 pb-2 pt-3"
                        >
                            <p className="text-xs font-medium text-muted">
                                {rangeLabel(grid[0], grid[grid.length - 1])}
                            </p>
                            <Link
                                href={pageUrl.past}
                                className="shrink-0 text-xs text-muted hover:text-pine"
                            >
                                지난 일정 보기 ›
                            </Link>
                        </div>

                        {list.isLoading && <LoadingBlock/>}

                        {list.isError && <ErrorBlock onRetry={() => list.refetch()}/>}

                        {!list.isLoading && !list.isError && (
                            groups.length === 0 ? (
                                <p className="py-6 text-center text-sm text-muted">
                                    {hidPast ? "이번 주에 남은 일정이 없어요" : "이 기간에는 일정이 없어요"}
                                </p>
                            ) : (
                                <EventGroups groups={groups}/>
                            )
                        )}
                    </>
                )}
            </main>
        </>
    );
}
