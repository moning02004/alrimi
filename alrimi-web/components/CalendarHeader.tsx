"use client";

import { useCallback, useEffect, useRef } from "react";
import { MonthGrid } from "./MonthGrid";
import { PeriodNav } from "./PeriodNav";
import { WeekStrip } from "./WeekStrip";
import { WEEK_DAYS, addDays, monthLabel, shiftMonth } from "@/lib/date";
import type { CalendarMap } from "@/types";

interface Props {
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
  anchor: Date;
  selected: string;
  calendar: CalendarMap;
  onMove: (nextAnchor: Date) => void;
  onPickDay: (iso: string) => void;
}

/** 이만큼 끌어야 제스처로 친다. 탭이 스와이프로 오인되지 않을 만큼은 크게 */
const SWIPE_THRESHOLD = 28;

/**
 * 평소에는 주간, 펼치면 월간.
 *
 * 여는 방법이 셋이다 — 달 이름 탭, 손잡이 탭, 아래로 스와이프.
 * 손잡이 하나만 두면 처음 여는 사람이 못 찾는다.
 *
 * 터치 대신 포인터 이벤트를 쓴다. 마우스·트랙패드에서도 같은 제스처가 동작한다.
 */
export function CalendarHeader({
  expanded,
  onToggle,
  anchor,
  selected,
  calendar,
  onMove,
  onPickDay,
}: Props) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  /**
   * 좌우로 넘기는 폭. 펼쳤으면 한 달, 접었으면 한 주.
   *
   * 7일을 더하면 요일이 그대로라 `windowDays` 가 잡는 월요일도 정확히 한 주만
   * 움직인다 — 창이 겹치거나 벌어지지 않는다.
   */
  const step = useCallback(
    (direction: 1 | -1) =>
      onMove(expanded ? shiftMonth(anchor, direction) : addDays(anchor, direction * WEEK_DAYS)),
    [expanded, anchor, onMove],
  );

  /**
   * 손을 떼는 건 창에서 받는다. 위로 크게 끌면 손가락이 달력 밖으로 나가는데,
   * 래퍼에서만 pointerup을 받으면 그 제스처가 통째로 사라진다.
   *
   * setPointerCapture는 쓰지 않는다 — 캡처 중에는 click 대상이 래퍼로 바뀌어
   * 날짜 버튼 탭이 죽는다.
   */
  useEffect(() => {
    const finish = (e: PointerEvent) => {
      const from = start.current;
      start.current = null;
      if (!from) return;

      const dx = e.clientX - from.x;
      const dy = e.clientY - from.y;
      const [absX, absY] = [Math.abs(dx), Math.abs(dy)];
      if (Math.max(absX, absY) < SWIPE_THRESHOLD) return; // 그냥 탭이다

      swiped.current = true;
      if (absY > absX) {
        onToggle(dy > 0);
        return;
      }
      // 좌우는 보고 있는 기간을 넘긴다
      step(dx < 0 ? 1 : -1);
    };

    const cancel = () => {
      start.current = null;
    };

    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [onToggle, step]);

  return (
    <div
      // 제스처는 달력 안에서만 시작한다
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY };
        swiped.current = false;
      }}
      // 스와이프로 끝난 제스처가 날짜 버튼 클릭까지 발동시키지 않도록 삼킨다
      onClickCapture={(e) => {
        if (!swiped.current) return;
        swiped.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      // 달력은 항상 화면 맨 위에 붙어 있어 스크롤될 일이 없다.
      // 브라우저가 세로 제스처를 스크롤로 가져가지 않게 막는다.
      className="touch-none mb-3"
    >
      {/*
        머리글은 주간·월간이 함께 쓴다. 펼침에 따라 갈아끼우면 같은 자리에 있는
        글자가 한 번 사라졌다 나타나서, 열고 닫는 동작이 튀어 보인다.
      */}
      <PeriodNav
        label={monthLabel(anchor)}
        expanded={expanded}
        onToggle={onToggle}
        nav={{
          onPrev: () => step(-1),
          onNext: () => step(1),
          onToday: () => onMove(new Date()),
          prevLabel: expanded ? "지난 달" : "지난 기간",
          nextLabel: expanded ? "다음 달" : "다음 기간",
        }}
      />

      {/*
        둘 다 그려두고 높이만 0fr ↔ 1fr 로 오간다. 높이를 재서 px 로 넣지 않아도
        되고(달마다 5~6줄로 달라진다), 여는 쪽과 닫는 쪽이 동시에 움직여
        머리글 아래가 이어지는 것처럼 보인다.

        접혀 있는 쪽은 화면에서 안 보여도 초점은 받는다. inert 로 탭 순서와
        스크린리더에서 함께 빼둔다.
      */}
      <Fold open={expanded}>
        <MonthGrid
          anchor={anchor}
          selected={selected}
          calendar={calendar}
          onPickDay={onPickDay}
        />
      </Fold>

      <Fold open={!expanded}>
        <WeekStrip start={anchor} calendar={calendar} onJumpTo={onPickDay} />
      </Fold>
    </div>
  );
}

/** 높이를 모른 채로 접었다 펴는 자리. `grid-template-rows` 만 애니메이션한다 */
function Fold({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className="grid transition-[grid-template-rows,opacity] duration-300 ease-out"
      style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
      inert={!open}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}
