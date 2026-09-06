"use client";

import {useState} from "react";
import {useCalendar, useNoticesByDate, useNoticesInRange} from "@/hooks/useNotices";
import {useZones} from "@/hooks/useZones";
import {groupByDate, monthGridDays, rangeLabel, sectionLabel, startOfDay, toISO, windowDays} from "@/lib/date";
import {CalendarHeader} from "@/components/CalendarHeader";
import {NoticeCard} from "@/components/NoticeCard";
import {NoticeGroups} from "@/components/NoticeGroups";
import {ZoneChips} from "@/components/ZoneChips";
import {useAddSheet} from "@/store/ui";

export default function HomePage() {
    const {selectedZoneId} = useZones();
    const openAdd = useAddSheet((s) => s.openAdd);

    const [expanded, setExpanded] = useState(false);
    /** 보고 있는 자리. 접었을 때는 창의 첫 날, 펼쳤을 때는 그 달 */
    const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
    const [selectedDate, setSelectedDate] = useState(() => toISO(startOfDay(new Date())));

    const todayISO = toISO(startOfDay(new Date()));

    const grid = expanded ? monthGridDays(anchor) : windowDays(anchor);
    const from = toISO(grid[0]);
    const to = toISO(grid[grid.length - 1]);
    const calendar = useCalendar(from, to, selectedZoneId);

    // 스트립과 목록이 같은 기간만 본다. 그 밖은 ‹ › 로 넘겨서 본다.
    const list = useNoticesInRange(from, to, selectedZoneId, !expanded);
    const day = useNoticesByDate(selectedDate, selectedZoneId, expanded);

    const notices = list.data ?? [];

    const dayItems = day.data ?? [];
    // 지난 날에는 등록을 열지 않는다. 알림 시각이 이미 지나 저장하자마자 다 나가버린다.
    const canAddOnSelected = selectedDate >= todayISO;

    const moveTo = (next: Date) => {
        setAnchor(startOfDay(next));
        if (expanded) setSelectedDate(toISO(startOfDay(next)));
    };

    /**
     * 열고 닫을 때는 오늘로 돌아온다.
     *
     * 지난 달을 보다가 접으면 주간 스트립이 그 달에 남는데, 접는 동작은 대개
     * "됐고 오늘 보자"라서 거기 서 있으면 다시 오늘로 오는 조작이 한 번 더 든다.
     * 머리글 탭이든 스와이프든 같아야 하므로 여기 한곳에서 처리한다.
     */
    const toggleExpanded = (next: boolean) => {
        const today = startOfDay(new Date());
        setExpanded(next);
        setAnchor(today);
        setSelectedDate(toISO(today));
    };

    /**
     * 접었을 때 스트립은 고르는 것이 아니라 목록의 미리보기라, 탭은 그 날짜 줄로
     * 스크롤만 한다. 펼쳤을 때만 선택이 되고 아래 목록이 그 하루로 바뀐다.
     */
    const pickDay = (iso: string) => {
        if (expanded) {
            setSelectedDate(iso);
            return;
        }
        document.getElementById(`date-${iso}`)?.scrollIntoView({behavior: "smooth", block: "start"});
    };

    const headingCls = "px-1 pb-1.5 pt-4 text-xs font-medium text-muted";

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
                    <section>
                        <p className={headingCls}>{sectionLabel(selectedDate)}</p>

                        {day.isLoading && <p className="pt-6 text-center text-sm text-muted">불러오는 중</p>}

                        <div className="space-y-1.5">
                            {dayItems.map((notice) => (
                                <NoticeCard key={notice.id} notice={notice}/>
                            ))}
                        </div>

                        {!day.isLoading &&
                            (canAddOnSelected ? (
                                // 비어 있을 때만이 아니라 항상 둔다. 그 날에 하나 더 얹는 일이 흔한데
                                // 탭바의 + 로 열면 날짜가 비어 있어 다시 골라야 한다.
                                <button
                                    onClick={() => openAdd(selectedDate)}
                                    className={`w-full rounded-xl border border-dashed border-line bg-card text-sm text-muted ${
                                        dayItems.length === 0 ? "py-6" : "mt-1.5 py-3"
                                    }`}
                                >
                                    {dayItems.length === 0 ? "이 날은 비어 있어요 · 일정 추가" : "이 날에 일정 추가"}
                                </button>
                            ) : (
                                dayItems.length === 0 && (
                                    <p className="py-6 text-center text-sm text-muted">등록된 일정이 없어요</p>
                                )
                            ))}
                    </section>
                ) : (
                    <>
                        {list.isLoading && <p className="pt-8 text-center text-sm text-muted">불러오는 중</p>}

                        {list.isError && (
                            <p className="pt-8 text-center text-sm text-red-600">불러오지 못했어요</p>
                        )}

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
                            </>
                        )}
                    </>
                )}
            </main>
        </>
    );
}
