"use client";

import { Drawer } from "vaul";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
}

export function BottomSheet({ open, onOpenChange, title, description, children }: Props) {
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
