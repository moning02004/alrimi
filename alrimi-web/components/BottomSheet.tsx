"use client";

import { Drawer } from "vaul";

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
  if (el instanceof HTMLInputElement) return KEYBOARD_TYPES.has(el.type);
  return false;
}

export function BottomSheet({ open, onOpenChange, title, description, children }: Props) {
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
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
