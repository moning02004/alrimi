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
        <Drawer.Content
          className="safe-bottom fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[92dvh]
                     w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-line
                     bg-paper px-4 pb-4 pt-3 outline-none"
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />

          {title && (
            <Drawer.Title className="mb-3 px-1 text-base font-semibold">{title}</Drawer.Title>
          )}
          {/* radix가 Description을 요구한다. 화면에는 노출하지 않는다 */}
          <Drawer.Description className="sr-only">{description ?? title ?? ""}</Drawer.Description>

          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
