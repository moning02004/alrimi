"use client";

import {useCallback, useEffect, useState} from "react";
import {useCalendar, useNoticesByDate, useNoticesInRange} from "@/hooks/useNotices";
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
import {NoticeDetail} from "@/components/NoticeDetail";
import {NoticeGroups} from "@/components/NoticeGroups";
import {ErrorBlock, LoadingBlock} from "@/components/Loading";
import Link from "next/link";
import {pageUrl} from "@/constants/routeUrl";
import {ZoneChips} from "@/components/ZoneChips";
import {UpcomingList} from "@/components/UpcomingList";
import {useAddSheet} from "@/store/ui";

export default function HomePage() {
    const {selectedZoneId} = useZones();
    const {open: addOpen, openAdd} = useAddSheet();
    const isDesktop = useIsDesktop();

    const [expanded, setExpanded] = useState(false);
    /**
     * PC 에서 옆 칸에 펼쳐 놓은 일정. 전체 화면으로 넘어가면 달력이 통째로
     * 사라져서, 하나씩 확인할 때마다 뒤로 → 다시 클릭을 반복하게 된다.
     */
    const [openNoticeId, setOpenNoticeId] = useState<number | null>(null);
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
    const list = useNoticesInRange(from, to, selectedZoneId, !monthMode);
    const day = useNoticesByDate(selectedDate, selectedZoneId, monthMode);

    const notices = list.data ?? [];
    const dayItems = day.data ?? [];
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
            setOpenNoticeId(null);
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
            if (e.key === "Escape" && openNoticeId !== null) {
                e.preventDefault();
                setOpenNoticeId(null);
                return;
            }
            if (openNoticeId !== null) return;

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
            setOpenNoticeId(null);
            // 달을 벗어나면 달력도 그 달로 넘긴다. 안 그러면 고른 날이 화면 밖이다.
            if (next.getMonth() !== anchor.getMonth() || next.getFullYear() !== anchor.getFullYear()) {
                setAnchor(startOfMonth(next));
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isDesktop, addOpen, selectedDate, anchor, goToday, openNoticeId]);

    const headingCls = "px-1 pb-1.5 pt-4 text-xs font-medium text-muted";

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
                            calendar={calendar.data ?? {}}
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
                        {openNoticeId !== null ? (
                            <NoticeDetail
                                noticeId={openNoticeId}
                                onClose={() => setOpenNoticeId(null)}
                                onDeleted={() => setOpenNoticeId(null)}
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
                                onSelect={setOpenNoticeId}
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
            <header className="sticky top-0 z-20 border-b border-line bg-card px-3 pb-2 pt-3">
                <CalendarHeader
                    expanded={expanded}
                    onToggle={toggleExpanded}
                    anchor={anchor}
                    selected={selectedDate}
                    calendar={calendar.data ?? {}}
                    onMove={moveTo}
                    onPickDay={pickDay}
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
                        {list.isLoading && <LoadingBlock/>}

                        {list.isError && <ErrorBlock onRetry={() => list.refetch()}/>}

                        {!list.isLoading && !list.isError && (
                            <>
                                {/* 지금 보고 있는 기간이 무엇인지는 여기가 말해준다 */}
                                <p className={headingCls}>{rangeLabel(grid[0], grid[grid.length - 1])}</p>
                                {notices.length === 0 ? (
                                    <p className="py-6 text-center text-sm text-muted">
                                        이 기간에는 일정이 없어요
                                    </p>
                                ) : (
                                    <NoticeGroups groups={groupByDate(notices)}/>
                                )}

                                {/* 이 기간을 다 훑은 뒤 "그 전엔?" 하고 찾는 자리 */}
                                <Link
                                    href={pageUrl.past}
                                    className="mt-4 block py-2 text-center text-xs text-muted hover:text-pine"
                                >
                                    지난 일정 보기 ›
                                </Link>
                            </>
                        )}
                    </>
                )}
            </main>
        </>
    );
}
