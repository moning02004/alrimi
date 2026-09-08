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

export interface PickerOption<T> {
  value: T;
  label: string;
}

interface Props<T> {
  /** 지금 고른 값. 목록에 없으면 `placeholder` 를 적는다 */
  value: T;
  options: PickerOption<T>[];
  onPick: (value: T) => void;
  ariaLabel: string;
  /** 고른 것이 없을 때 적을 말 */
  placeholder?: string;
  /** 눌러서 여는 칸의 모양. 다른 입력칸과 같은 모양을 물려받는다 */
  className?: string;
}

/**
 * 눌러서 고르는 칸. 브라우저 기본 `<select>` 대신이다.
 *
 * 폰에서 기본 select 는 화면 아래에서 굴림판이 올라와 값을 굴린 뒤 "완료"를 한 번
 * 더 눌러야 들어간다. 한 번에 끝날 일이 두 번이 되고, 그 사이 화면 절반이 가려서
 * 무엇을 고르는 중이었는지도 안 보인다. 여기서는 누르면 바로 아래에 목록이 열리고
 * 항목을 누르는 순간 들어간다.
 *
 * 목록은 `fixed` 로 띄운다 — 이 폼은 시트 안쪽 스크롤 칸에 들어 있어서, 흐름대로
 * 두면 칸 아래로 잘린다(날짜 달력이 같은 이유로 같은 방식을 쓴다). 자리가 모자라면
 * 위로 뒤집히고, 길면 안에서 스크롤된다.
 */
export function Picker<T extends string | number | null>({
  value,
  options,
  onPick,
  ariaLabel,
  placeholder = "고르기",
  className = "",
}: Props<T>) {
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
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ rects, availableHeight, elements }) {
          Object.assign(elements.floating.style, {
            // 여는 칸보다 좁으면 글자가 잘리고, 훨씬 넓으면 어디에 딸린 목록인지 흐려진다
            minWidth: `${rects.reference.width}px`,
            // 화면에 남은 만큼까지만. 그 이상은 목록 안에서 스크롤한다.
            maxHeight: `${Math.min(availableHeight, 260)}px`,
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
      // 폰에서는 손가락으로 고르므로 목록을 열 때 굳이 한 항목을 짚어두지 않는다
      focusItemOnOpen: "auto",
      virtual: false,
      loop: true,
    }),
  ]);

  const picked = options.find((o) => o.value === value);

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        aria-label={ariaLabel}
        className={`flex items-center justify-between gap-1 text-left ${className}`}
        {...getReferenceProps()}
      >
        <span className="truncate">{picked ? picked.label : placeholder}</span>
        <HiChevronDown
          className={`h-4 w-4 shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        // 목록 안에 초점을 가둔다. 열어둔 채 탭으로 뒤쪽 칸까지 넘어가면
        // 무엇을 고르던 중이었는지 잃는다.
        <FloatingFocusManager context={context} modal={false}>
          <div
            /* floating-ui 는 붙일 자리를 렌더 중에 이 함수로 알려주게 돼 있다.
               값을 읽는 것이 아니라 넘겨주는 것이라 규칙이 말하는 위험은 없다. */
            // eslint-disable-next-line react-hooks/refs
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-50 overflow-y-auto overscroll-contain rounded-xl border border-line
                       bg-card py-1 shadow-lg shadow-ink/10 outline-none"
            {...getFloatingProps()}
          >
            {options.map((option, index) => {
              const on = option.value === value;
              return (
                <button
                  key={String(option.value)}
                  ref={(node) => {
                    listRef.current[index] = node;
                  }}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left
                              text-sm transition-colors ${
                                on ? "font-medium text-pine" : "text-ink"
                              } ${index === active ? "bg-paper" : "hover:bg-paper"}`}
                  {...getItemProps({
                    onClick() {
                      onPick(option.value);
                      setOpen(false);
                    },
                  })}
                >
                  <span className="truncate">{option.label}</span>
                  {on && <HiCheck className="h-4 w-4 shrink-0" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </FloatingFocusManager>
      )}
    </>
  );
}
