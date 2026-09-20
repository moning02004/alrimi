"use client";

import { useEffect, useId, useRef } from "react";
import { Drawer } from "vaul";
import { LuX } from "react-icons/lu";
import { useIsDesktop } from "@/hooks/useMediaQuery";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
}

/**
 * 소프트 키보드를 띄우는 칸인지. 날짜·선택 칸은 키보드가 아니라 고르는 판이 뜨므로
 * 여기서 뺀다 — 그쪽은 밖을 누르면 그냥 닫히는 편이 자연스럽다.
 */
const KEYBOARD_TYPES = new Set([
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
  "number",
  "",
]);

function raisesKeyboard(el: Element | null): el is HTMLElement {
  if (el instanceof HTMLTextAreaElement) return true;
  // 날짜 칸은 달력에서만 고치므로 `inputMode="none"` 이다. type 은 text 라
  // 아래 목록에 걸리지만 키보드는 뜨지 않는다.
  if (el instanceof HTMLInputElement) {
    return el.inputMode !== "none" && KEYBOARD_TYPES.has(el.type);
  }
  return false;
}

/** 쓰고 있는 칸을 시트의 스크롤 칸 가운데로 옮긴다. 바깥 화면은 건드리지 않는다 */
function centerFocused(scroller: HTMLElement | null) {
  const focused = document.activeElement;
  if (!scroller || !raisesKeyboard(focused) || !scroller.contains(focused)) return;

  // 아래 끝에 맞추면 폼 바닥에 붙은 저장 버튼 밑에 깔린다. 가운데로 둔다.
  const box = scroller.getBoundingClientRect();
  const field = focused.getBoundingClientRect();
  scroller.scrollTop += field.top + field.height / 2 - (box.top + box.height / 2);
}

/**
 * 소프트 키보드가 떠 있는 동안 시트를 **지금 보이는 화면**(visual viewport) 바닥에 붙인다.
 *
 * vaul 의 `repositionInputs` 에 맡기지 않는 이유: 그쪽은 키보드 높이
 * (`innerHeight - visualViewport.height`)만큼만 시트를 올린다. 그런데 가려질 자리에
 * 있는 칸(폼 아래쪽의 "내용")을 눌러 키보드가 뜨면, 브라우저가 그 칸을 보여주려고
 * 화면을 아래로 끌어내린다(`visualViewport.offsetTop > 0`). 시트는 그만큼 위에 떠
 * 버리고, 저장 버튼 밑으로 끌려 내려온 만큼이 빈자리로 드러난다. 제목을 먼저 누르면
 * 멀쩡했던 것은 제목 칸이 키보드 위쪽이라 화면이 끌려 내려오지 않아서다.
 *
 * 그래서 끌려 내려온 만큼(`offsetTop`)을 빼고, 화면이 움직일 때(scroll)도 따라간다.
 */
function fitToKeyboard(vv: VisualViewport, sheet: HTMLElement) {
  const keyboard = window.innerHeight - vv.height;
  if (keyboard < 1) {
    sheet.style.bottom = sheet.style.maxHeight = sheet.style.paddingBottom = "";
    return;
  }

  sheet.style.bottom = `${Math.max(0, keyboard - vv.offsetTop)}px`;
  // 평소의 92dvh 를 보이는 만큼에 맞춘다. 안 줄이면 시트 위쪽이 화면 밖으로 나간다.
  sheet.style.maxHeight = `${vv.height * 0.92}px`;
  // 홈 인디케이터는 키보드 밑에 있다. 그 몫의 여백을 두면 저장 버튼 밑이 빈다.
  sheet.style.paddingBottom = "0px";
}

/**
 * PC 에서 쓰는 가운데 창.
 *
 * 폰의 시트는 엄지가 닿는 아래에서 올라오는 것이 맞지만, 마우스로 쓰는 넓은 화면에서 같은
 * 것이 바닥에서 올라오면 눈과 손이 화면 아래 끝까지 내려갔다 온다. 등록 폼처럼 긴 것은 특히
 * 그렇다. 가운데 창은 그 왕복이 없고, 폼이 길어도 창 안에서만 스크롤된다.
 *
 * 안에 들어가는 내용은 시트와 **같다** — 부르는 쪽은 `BottomSheet` 하나만 쓰고, 어디서 열릴지는
 * 화면 폭이 정한다.
 */
function CenteredDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      // 닫으면 창을 연 자리로 초점을 돌려준다. 키보드로 쓰는 사람이 제자리를 잃지 않게
      previous?.focus?.();
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        aria-hidden="true"
        onClick={() => onOpenChange(false)}
        className="absolute inset-0 bg-ink/25"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative flex max-h-[85dvh] w-full max-w-lg flex-col rounded-2xl border
                   border-line bg-paper shadow-xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-4">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="닫기"
            className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-muted
                       transition-colors hover:bg-card hover:text-ink"
          >
            <LuX className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        {/* 화면에는 안 보이고 낭독기만 읽는다 — 시트 쪽과 같은 말이다 */}
        <p id={descriptionId} className="sr-only">
          {description ?? title}
        </p>
        {/* `min-h-0` 이 있어야 이 칸이 창보다 작아져서 안에서 스크롤된다 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}

export function BottomSheet(props: Props) {
  /*
    **같은 내용을 화면 폭에 따라 다른 자리에서 연다.** 폰은 아래에서 올라오는 시트, PC 는
    가운데 창이다(`CenteredDialog`). 부르는 쪽은 이 하나만 쓴다 — 화면마다 둘을 갈라 쓰면
    한쪽만 고쳐지는 일이 생긴다.
  */
  const isDesktop = useIsDesktop();
  return isDesktop ? <CenteredDialog {...props} /> : <Sheet {...props} />;
}

function Sheet({ open, onOpenChange, title, description, children }: Props) {
  const sheet = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!open || !vv) return;

    const fit = (recenter: boolean) => {
      // 손가락으로 확대한 것도 보이는 화면을 줄인다. 그때는 따라가지 않는다.
      if (!sheet.current || vv.scale > 1.01) return;
      fitToKeyboard(vv, sheet.current);
      // 시트가 줄면서 쓰던 칸이 스크롤 칸 밖으로 밀려날 수 있다
      if (recenter) centerFocused(scroller.current);
    };

    const onResize = () => fit(true);
    const onScroll = () => fit(false);
    fit(false);
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onScroll);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onScroll);
    };
  }, [open]);

  /**
   * 키보드가 올라와 있을 때, 위 빈자리를 누르면 **키보드만** 내린다.
   *
   * 모바일에서는 저장 버튼이 키보드에 가려서, 누르려면 먼저 키보드를 내려야 한다.
   * 그 자연스러운 동작이 빈자리 탭인데 그대로 두면 시트가 통째로 닫혀서 적던 것이
   * 날아간다. 그래서 첫 탭은 키보드를 내리고, 시트를 닫으려면 한 번 더 누른다.
   *
   * 마우스가 있는 기기에서는 그대로 닫는다 — 키보드가 가릴 일이 없고, 바깥 클릭으로
   * 닫는 것은 굳어진 약속이라 한 번 더 누르게 하면 그쪽이 더 어색하다.
   */
  const keepOpenToDismissKeyboard = (event: { preventDefault: () => void }) => {
    if (!window.matchMedia("(hover: none)").matches) return;

    const focused = document.activeElement;
    if (!raisesKeyboard(focused)) return;

    event.preventDefault();
    focused.blur();
  };

  return (
    /*
      `repositionInputs` 는 끈다. 키보드에 맞춰 시트를 올리고 줄이는 일은 위의
      `fitToKeyboard` 가 맡는다 — vaul 에 같이 맡기면 둘이 시트의 bottom·height 를
      번갈아 덮어쓴다. 끄는 이유는 그 함수 주석 참고.
    */
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/25" />
        {/*
          스크롤은 이 상자가 아니라 안쪽 칸이 맡는다.

          vaul 은 Drawer.Content 에 `::after { top:100%; height:200% }` 짜리 채움막을
          붙인다. 아래로 끌 때 시트와 화면 끝 사이에 흰 틈이 보이지 않게 하는 것이다.
          그런데 스크롤을 이 상자에 걸면 그 채움막까지 스크롤 대상이 되어, 폼을 다 지나친
          뒤에도 시트 높이의 두 배만큼 빈 자리가 더 굴러간다(601px 시트에서 1202px).
        */}
        <Drawer.Content
          ref={sheet}
          onPointerDownOutside={keepOpenToDismissKeyboard}
          className="safe-bottom fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh]
                     w-full max-w-md flex-col rounded-t-3xl border-t border-line sm:max-w-2xl
                     bg-paper pt-3 outline-none"
        >
          <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-line" />

          {title && (
            <Drawer.Title className="mb-3 shrink-0 px-5 text-base font-semibold">
              {title}
            </Drawer.Title>
          )}
          {/* radix가 Description을 요구한다. 화면에는 노출하지 않는다 */}
          <Drawer.Description className="sr-only">{description ?? title ?? ""}</Drawer.Description>

          {/* `min-h-0` 이 있어야 이 칸이 시트보다 작아져서 안에서 스크롤된다 */}
          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 pt-4">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
