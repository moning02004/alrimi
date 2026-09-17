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
import { HiCheck, HiChevronDown } from "react-icons/hi2";
import { LuPlus, LuUsers } from "react-icons/lu";
import { ZoneCreateSheet } from "./ZoneCreateSheet";
import { ZoneMark } from "./ZoneMark";
import { SHARER_COLOR, sharerMarksOf, useZoneMark, useZones } from "@/hooks/useZones";
import type { ZoneScope } from "@/types";

interface Item {
  key: string;
  /** 고르면 이 필터가 된다 */
  scope: ZoneScope;
  label: string;
  mark?: { text: string; color: string; round?: boolean };
  shared?: boolean;
}

/**
 * 목록·달력을 좁히는 필터. 누르면 바로 아래에 목록이 열리고 고르는 순간 닫힌다.
 *
 * **칩 줄 대신 버튼 하나다.** 공간과 보여주는 사람이 늘수록 칩 줄은 옆으로 길어져 밀어서
 * 찾아야 했고, 어느 칩이 켜졌는지도 줄을 훑어야 보였다. 버튼 하나면 머리글 높이가 늘 같고,
 * 지금 무엇으로 걸렀는지가 버튼 글자에 그대로 있다.
 *
 * **열면 범례다.** 칩이 늘 보이던 때는 카드 딱지(`우`)가 무슨 공간인지 칩에서 배웠다. 이제는
 * 목록의 줄마다 딱지와 이름을 나란히 두어 그 역할을 잇는다. 카드 딱지에 마우스를 올려도
 * 이름이 뜬다(`ZoneMark` 의 title).
 *
 * 내 공간은 하나씩, 받은 공간은 **사람마다 하나**다(동그라미 딱지). 등록 폼의 `Picker` 와
 * 같은 모양·같은 조작(화살표·Enter·Esc)이라 앱 안에서 고르는 법이 하나다. 공간 추가는
 * 목록 안이 아니라 오른쪽 끝의 + 다 — 고르는 목록에 만드는 동작이 섞이지 않게.
 */
export function ZoneFilter() {
  const { zones, sharers, scope, setScope, selected, selectedSharer } = useZones();
  const markOf = useZoneMark();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const listRef = useRef<Array<HTMLElement | null>>([]);

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
            // 버튼과 같은 폭이 기본이고, 버튼이 좁으면 이름이 잘리지 않을 만큼(240px)은 연다
            width: `${Math.min(availableWidth, Math.max(rects.reference.width, 240))}px`,
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

  const all: Item = { key: "all", scope: null, label: "전체" };
  const ownedItems: Item[] = owned.map((zone) => ({
    key: `zone-${zone.id}`,
    scope: `zone:${zone.id}`,
    label: zone.name,
    mark: { text: markOf(zone.id)?.mark ?? "", color: zone.color },
    shared: zone.shared,
  }));
  const sharerItems: Item[] = sharers.map((sharer) => ({
    key: `owner-${sharer.id}`,
    scope: `owner:${sharer.id}`,
    label: sharer.name,
    mark: { text: sharerMarks.get(sharer.id) ?? "", color: SHARER_COLOR, round: true },
  }));
  // 키보드로 옮겨 다니는 순서 그대로의 한 줄. 묶음 제목은 고를 것이 아니라 빠진다
  const items = [all, ...ownedItems, ...sharerItems];
  const indexOf = (item: Item) => items.indexOf(item);

  const pick = (item: Item) => {
    setOpen(false);
    setScope(item.scope);
  };

  // 버튼에 적는 것 — 지금 필터
  const current: Item =
    (selected && ownedItems.find((item) => item.scope === scope)) ||
    (selectedSharer && sharerItems.find((item) => item.scope === scope)) ||
    all;
  const filtered = current !== all;

  const renderItem = (item: Item) => {
    const index = indexOf(item);
    const on = item.scope === scope;
    return (
      <button
        key={item.key}
        ref={(node) => {
          listRef.current[index] = node;
        }}
        type="button"
        role="option"
        aria-selected={on}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
          on ? "font-medium text-pine" : "text-ink"
        } ${index === active ? "bg-paper" : "hover:bg-paper"}`}
        {...getItemProps({ onClick: () => pick(item) })}
      >
        {item.mark && (
          <ZoneMark mark={item.mark.text} color={item.mark.color} size="sm" round={item.mark.round} />
        )}
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.shared && (
          <LuUsers className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="함께 보는 공간" role="img" />
        )}
        {on && <HiCheck className="h-4 w-4 shrink-0" aria-hidden="true" />}
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
        필터 버튼은 줄을 넓게 쓰고, 공간 추가는 오른쪽 끝의 + 하나다. 버튼이 글자만큼만 좁으면
        누를 자리로 안 읽히고, "전체" 두 글자짜리 알약이 머리글 한구석에 떠 보였다.
        PC 에서는 옆 칸이 넓어 끝까지 늘이면 줄이 텅 비어 보이므로 적당한 폭에서 멈춘다.
      */}
      <div className="flex items-center gap-2">
        <button
          ref={refs.setReference}
          type="button"
          aria-label={`공간 필터 · 지금 ${current.label}`}
          // 걸러 둔 동안은 테두리를 진하게 — "지금 전부가 아니다" 가 목록을 읽기 전에 보이게
          className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm
                      transition-colors sm:max-w-xs ${
                        filtered
                          ? "border-ink font-medium text-ink"
                          : "border-line text-muted hover:border-muted/50"
                      }`}
          {...getReferenceProps()}
        >
          {current.mark && (
            <ZoneMark mark={current.mark.text} color={current.mark.color} size="sm" round={current.mark.round} />
          )}
          <span className="min-w-0 flex-1 truncate text-left">{current.label}</span>
          <HiChevronDown
            className={`h-4 w-4 shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label="공간 추가"
          title="공간 추가"
          className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line
                     text-muted transition-colors hover:border-pine/50 hover:text-pine"
        >
          <LuPlus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {open && (
        <FloatingFocusManager context={context} modal={false}>
          <div
            // eslint-disable-next-line react-hooks/refs
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-50 overflow-y-auto overscroll-contain rounded-xl border border-line bg-card py-1
                       shadow-lg shadow-ink/10 outline-none"
            {...getFloatingProps()}
          >
            {renderItem(all)}

            {ownedItems.length > 0 && (
              <>
                {groupTitle("내 공간")}
                {ownedItems.map(renderItem)}
              </>
            )}

            {sharerItems.length > 0 && (
              <>
                {groupTitle("함께 보는 사람")}
                {sharerItems.map(renderItem)}
              </>
            )}

          </div>
        </FloatingFocusManager>
      )}

      {/* 방금 만든 공간으로 바로 좁혀 보여준다 */}
      <ZoneCreateSheet
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(zone) => setScope(`zone:${zone.id}`)}
      />
    </>
  );
}
