"use client";

import { useRef, useState } from "react";
import {
  FloatingFocusManager,
  autoUpdate,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
} from "@floating-ui/react";
import { HiEllipsisHorizontal } from "react-icons/hi2";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /**
   * 되돌릴 수 없는 것. 빨갛게 적고 위에 선을 그어 떼어 놓는다 — 손가락이 미끄러져
   * 한 칸 옆을 눌렀을 때 수정하려다 지우는 일이 없어야 한다.
   */
  danger?: boolean;
  disabled?: boolean;
}

/**
 * 점 세 개를 눌러 여는 메뉴. 머리글에 조작을 여럿 세워두는 대신 쓴다.
 *
 * 글자 버튼을 나란히 놓으면 화면 맨 위 좁은 줄에 눌러야 할 것이 셋씩 늘어서서,
 * 정작 이 화면의 주인공(일정)보다 먼저 눈에 든다. 게다가 그중 하나가 삭제라
 * 되돌릴 수 없는 조작이 늘 손끝 한 번 거리에 서 있게 된다. 한 겹 접어두면
 * 머리글은 "뒤로" 와 점 하나로 조용해지고, 삭제는 두 번 눌러야 닿는다.
 *
 * 목록은 `fixed` 로 띄운다 — 머리글이 붙박이(sticky)라, 흐름대로 두면 아래 본문에
 * 가려지거나 잘린다(`Picker` 가 같은 이유로 같은 방식을 쓴다).
 */
export function Menu({ items, ariaLabel = "더보기" }: { items: MenuItem[]; ariaLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const listRef = useRef<Array<HTMLElement | null>>([]);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    // 오른쪽 끝에 선 버튼이라 목록도 오른쪽에 맞춘다. 왼쪽에 맞추면 화면 밖으로 나간다.
    placement: "bottom-end",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
  });

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context, { role: "menu" }),
    useListNavigation(context, {
      listRef,
      activeIndex: active,
      onNavigate: setActive,
      focusItemOnOpen: "auto",
      virtual: false,
      loop: true,
    }),
  ]);

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        aria-label={ariaLabel}
        /*
          44px 과녁. 보이는 그림은 20px 이지만 손가락으로 겨냥하는 자리는 그보다
          커야 한다 — 바로 왼쪽이 "뒤로" 라 빗맞으면 화면이 통째로 바뀐다.

          **넓힌 만큼은 음수 여백으로 도로 당긴다.** 안 그러면 이 44px 이 그대로
          줄 높이가 되어 머리글이 통째로 24px 높아진다(글자 버튼일 때는 20px 줄이었다).
          머리글은 붙박이라 그 24px 이 스크롤하는 내내 본문을 덮는다.

          `-my-3` 은 이 버튼이 놓이는 줄의 세로 여백(`py-3` = 12px)을 상쇄하는 값이다
          — 44 − 24 = 20px 이 되어 글자 한 줄과 같은 자리를 차지한다. 다른 여백을 쓰는
          줄에 옮겨 놓으면 이 값도 같이 고쳐야 한다.
        */
        className={`-my-3 -mr-2 flex h-11 w-11 items-center justify-center rounded-full
                    transition-colors hover:bg-paper ${open ? "bg-paper text-ink" : "text-muted"}`}
        {...getReferenceProps()}
      >
        <HiEllipsisHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && (
        // 메뉴 안에 초점을 가둔다. 열어둔 채 탭으로 뒤쪽까지 넘어가면 무엇이
        // 열려 있는지 모른 채 엉뚱한 것을 누르게 된다.
        <FloatingFocusManager context={context} modal={false}>
          <div
            /* floating-ui 는 붙일 자리를 렌더 중에 이 함수로 알려주게 돼 있다.
               값을 읽는 것이 아니라 넘겨주는 것이라 규칙이 말하는 위험은 없다. */
            // eslint-disable-next-line react-hooks/refs
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-50 min-w-36 overflow-hidden rounded-xl border border-line bg-card py-1
                       shadow-lg shadow-ink/10 outline-none"
            {...getFloatingProps()}
          >
            {items.map((item, index) => (
              <button
                key={item.label}
                ref={(node) => {
                  listRef.current[index] = node;
                }}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={`flex w-full px-4 py-2.5 text-left text-sm transition-colors
                            disabled:opacity-50 ${
                              item.danger
                                ? "mt-1 border-t border-line pt-3 text-red-600"
                                : "text-ink"
                            } ${index === active ? "bg-paper" : "hover:bg-paper"}`}
                {...getItemProps({
                  onClick() {
                    setOpen(false);
                    item.onSelect();
                  },
                })}
              >
                {item.label}
              </button>
            ))}
          </div>
        </FloatingFocusManager>
      )}
    </>
  );
}
