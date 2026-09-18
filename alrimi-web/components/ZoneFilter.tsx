"use client";

import { useRef, useState } from "react";
import {
  FloatingFocusManager,
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
} from "@floating-ui/react";
import { HiChevronDown } from "react-icons/hi2";
import { LuCheck, LuPlus, LuUsers } from "react-icons/lu";
import { ZoneCreateSheet } from "./ZoneCreateSheet";
import { ZoneMark } from "./ZoneMark";
import { SHARER_COLOR, sharerMarksOf, useZoneMark, useZones } from "@/hooks/useZones";

interface Row {
  key: string;
  label: string;
  /** 이 줄이 켜고 끄는 공간들. 사람 줄은 그 사람이 보여주는 공간 전부다 */
  zoneIds: number[];
  mark?: { text: string; color: string; round?: boolean };
  shared?: boolean;
}

/**
 * 목록·달력을 좁히는 필터. 누르면 바로 아래에 목록이 열린다.
 *
 * **여러 개를 고른다.** 처음에는 전부 켜져 있고, 보기 싫은 것을 하나씩 끈다 — 공간이 여럿인
 * 사람이 대개 "회사만 빼고" 처럼 쓰기 때문이다. 하나만 고르는 방식이면 그때마다 나머지를
 * 한 번씩 다시 골라야 했다. 끈 것만 기억하므로 나중에 만든 공간은 저절로 켜져 있다.
 *
 * **열면 범례다.** 줄마다 딱지와 이름이 나란히 있어, 카드의 `우` 가 무슨 공간인지 여기서
 * 배운다. 내 공간은 하나씩, 받은 공간은 사람마다 한 줄(동그라미 딱지)이다.
 *
 * 공간이 하나도 없으면 "전체" 대신 **공간을 추가해 달라고** 적는다. 빈 앱에서 "전체" 는
 * 일정이 들어갈 자리가 있다는 뜻으로 읽혀서, 등록부터 눌렀다가 막힌다.
 */
export function ZoneFilter({ trailing }: { trailing?: React.ReactNode }) {
  const { zones, sharers, hidden, allOn, toggleZones, showAll, hideAll } = useZones();
  const markOf = useZoneMark();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const listRef = useRef<Array<HTMLElement | null>>([]);
  const empty = zones.length === 0;

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-start",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(6),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ rects, availableHeight, availableWidth, elements }) {
          Object.assign(elements.floating.style, {
            // 버튼과 같은 폭으로 연다. 버튼이 좁은 자리에서도 이름이 잘리지 않을 만큼(260px)은 연다
            width: `${Math.min(availableWidth, Math.max(rects.reference.width, 260))}px`,
            maxHeight: `${Math.min(availableHeight, 360)}px`,
          });
        },
      }),
    ],
  });

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context, { role: "listbox" }),
    useListNavigation(context, {
      listRef,
      activeIndex: active,
      onNavigate: setActive,
      focusItemOnOpen: "auto",
      loop: true,
    }),
  ]);

  const sharerMarks = sharerMarksOf(sharers);
  const owned = zones.filter((zone) => zone.role === "owner");

  const ownedRows: Row[] = owned.map((zone) => ({
    key: `zone-${zone.id}`,
    label: zone.name,
    zoneIds: [zone.id],
    mark: { text: markOf(zone.id)?.mark ?? "", color: zone.color },
    shared: zone.shared,
  }));
  const sharerRows: Row[] = sharers.map((sharer) => ({
    key: `owner-${sharer.id}`,
    label: sharer.name,
    zoneIds: zones.filter((zone) => zone.owner_id === sharer.id).map((zone) => zone.id),
    mark: { text: sharerMarks.get(sharer.id) ?? "", color: SHARER_COLOR, round: true },
  }));
  const rows = [...ownedRows, ...sharerRows];

  /** 줄 하나의 상태. 그 줄이 맡은 공간이 전부 켜졌나 · 일부만인가 */
  const stateOf = (row: Row) => {
    const on = row.zoneIds.filter((id) => !hidden.includes(id)).length;
    return { on: on > 0, partial: on > 0 && on < row.zoneIds.length };
  };

  const label = (() => {
    if (empty) return "공간을 추가해주세요";
    if (allOn) return "전체";
    const visible = rows.filter((row) => stateOf(row).on);
    if (visible.length === 0) return "아무것도 안 봄";
    if (visible.length === 1) return visible[0].label;
    return `${visible.length}곳 보는 중`;
  })();

  // 키보드로 옮겨 다니는 순서 그대로의 한 줄. 맨 위 "전체" 다음에 공간·사람 줄이 온다
  const items = [null, ...rows];

  const renderRow = (row: Row | null, index: number) => {
    const all = row === null;
    const { on, partial } = all ? { on: allOn, partial: false } : stateOf(row);

    return (
      <button
        key={all ? "all" : row.key}
        ref={(node) => {
          listRef.current[index] = node;
        }}
        type="button"
        role="option"
        aria-selected={on}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
          index === active ? "bg-paper" : "hover:bg-paper"
        } ${on ? "text-ink" : "text-muted"}`}
        {...getItemProps({
          onClick: () => {
            if (all) {
              // "전체" 는 켜고 끄는 스위치다 — 다 켜져 있으면 다 끈다
              if (allOn) hideAll(zones.map((zone) => zone.id));
              else showAll();
              return;
            }
            // 일부만 켜진 사람 줄은 누르면 전부 켜진다(끄려면 한 번 더)
            toggleZones(row.zoneIds, !on || partial);
          },
        })}
      >
        {/*
          체크는 네모다. 하나만 고르는 자리(시간·공간 선택)의 ✓ 와 달리 여기서는 여러 개가
          동시에 켜지므로, 모양으로 "여러 개를 켜고 끄는 자리" 라고 말해둔다.
        */}
        <span
          aria-hidden="true"
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
            on ? "border-pine bg-pine text-white" : "border-line bg-card"
          }`}
        >
          {on && !partial && <LuCheck className="h-3 w-3" />}
          {partial && <span className="h-0.5 w-2 rounded-full bg-white" />}
        </span>

        {!all && row.mark && (
          <ZoneMark mark={row.mark.text} color={row.mark.color} size="sm" round={row.mark.round} />
        )}
        <span className="min-w-0 flex-1 truncate">{all ? "전체" : row.label}</span>
        {!all && row.shared && (
          <LuUsers className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="함께 보는 공간" role="img" />
        )}
      </button>
    );
  };

  const groupTitle = (text: string) => (
    <p className="px-3 pb-1 pt-2.5 text-[11px] font-medium text-muted" role="presentation">
      {text}
    </p>
  );

  return (
    <>
      {/*
        필터 버튼은 + 자리만 빼고 줄을 통째로 쓴다. 글자만큼만 좁으면 누를 자리로 안 읽히고,
        "전체" 두 글자짜리 알약이 머리글 한구석에 떠 보였다. 펼치는 목록도 이 폭을 따라간다.
      */}
      <div className="flex items-center gap-2">
        <button
          ref={refs.setReference}
          type="button"
          aria-label={empty ? "공간 추가" : `공간 필터 · 지금 ${label}`}
          // 공간이 없으면 고를 것도 없다. 그 자리에서 바로 만들게 한다
          onClick={empty ? () => setAdding(true) : undefined}
          // 걸러 둔 동안은 테두리를 진하게 — "지금 전부가 아니다" 가 목록을 읽기 전에 보이게
          className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm
                      transition-colors ${
                        !allOn && !empty
                          ? "border-ink font-medium text-ink"
                          : "border-line text-muted hover:border-muted/50"
                      }`}
          {...(empty ? {} : getReferenceProps())}
        >
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          {empty ? (
            <LuPlus className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
          ) : (
            <HiChevronDown
              className={`h-4 w-4 shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          )}
        </button>

        {/* 필터 옆에 나란히 서는 작은 버튼 자리. 홈에서는 검색이 여기 붙는다 */}
        {trailing}

        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label="공간 추가"
          title="공간 추가"
          /*
            필터 버튼 바로 옆이다. 줄 오른쪽 끝으로 밀면(ml-auto) PC 에서는 필터가 최대 폭에서
            멈추므로 둘 사이가 화면 절반만큼 벌어져, 서로 상관없는 버튼 둘처럼 보인다.
          */
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line
                     text-muted transition-colors hover:border-pine/50 hover:text-pine"
        >
          <LuPlus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {open && !empty && (
        <FloatingFocusManager context={context} modal={false}>
          <div
            // eslint-disable-next-line react-hooks/refs
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-50 overflow-y-auto overscroll-contain rounded-xl border border-line bg-card py-1
                       shadow-lg shadow-ink/10 outline-none"
            {...getFloatingProps()}
          >
            {renderRow(null, 0)}

            {ownedRows.length > 0 && (
              <>
                {groupTitle("내 공간")}
                {ownedRows.map((row) => renderRow(row, items.indexOf(row)))}
              </>
            )}

            {sharerRows.length > 0 && (
              <>
                {groupTitle("함께 보는 사람")}
                {sharerRows.map((row) => renderRow(row, items.indexOf(row)))}
              </>
            )}
          </div>
        </FloatingFocusManager>
      )}

      {/* 방금 만든 공간은 저절로 켜져 있다(끈 것만 기억한다) */}
      <ZoneCreateSheet open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
