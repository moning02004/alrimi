"use client";

import toast from "react-hot-toast";
import { BottomSheet } from "./BottomSheet";
import type { Me } from "@/types";

/**
 * 딥링크가 안 먹은 자리를 위한 대비책.
 *
 * `ntfy://` 는 ntfy 앱이 깔린 기기에서만 열린다. 데스크톱 브라우저나 iOS 에서는
 * 눌러도 아무 일이 일어나지 않는데, 그대로 두면 고장난 것처럼 보인다.
 * 그래서 열리지 않으면 이 시트를 띄워 QR 과 토픽을 건넨다.
 *
 * 앱이 열렸는지는 잠깐 기다려 봐야 알 수 있다. 그 사이를 비워 두면 누른 반응이
 * 없는 것처럼 보이므로, 시트는 누르는 즉시 `opening` 으로 열어 두고 QR 자리만
 * 자리표시로 채운다. 판정이 끝나면 `fallback` 으로 바뀌며 QR 이 들어온다.
 */
export function SubscribeSheet({
  me,
  open,
  phase,
  onClose,
}: {
  me?: Me;
  open: boolean;
  phase: "opening" | "fallback";
  onClose: () => void;
}) {
  const copy = async () => {
    if (!me?.ntfy_topic) return;
    try {
      await navigator.clipboard.writeText(me.ntfy_topic);
      toast.success("토픽을 복사했어요");
    } catch {
      toast.error("복사하지 못했어요");
    }
  };

  const opening = phase === "opening";

  return (
    <BottomSheet open={open} onOpenChange={(next) => !next && onClose()} title="알림 구독">
      <p className="px-1 pb-3 text-sm text-muted">
        {opening
          ? "ntfy 앱을 여는 중이에요. 열리지 않으면 QR을 보여드릴게요."
          : "ntfy 앱이 열리지 않았어요. 폰에서 아래 QR을 찍으면 구독까지 끝납니다."}
      </p>

      {/* 자리표시와 QR 의 크기를 맞춰 두어야 판정이 끝날 때 시트가 튀지 않는다 */}
      <div className="flex justify-center rounded-2xl border border-line bg-white py-5">
        {opening || !me?.ntfy_subscribe_qr ? (
          <div className="h-[200px] w-[200px] animate-pulse rounded-xl bg-line/60" />
        ) : (
          /* 마크업을 주입하지 않도록 서버가 data URI 로 준다 */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={me.ntfy_subscribe_qr} alt="구독 QR" width={200} height={200} />
        )}
      </div>

      <p className="px-1 pb-1.5 pt-4 text-xs font-medium text-muted">토픽</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xl border border-line bg-card px-3.5 py-3 font-mono text-sm">
          {me?.ntfy_topic}
        </code>
        <button
          onClick={copy}
          className="shrink-0 rounded-xl border border-pine px-4 py-3 text-sm font-medium text-pine"
        >
          복사
        </button>
      </div>
      <p className="mb-3 px-1 pt-1.5 text-xs text-muted">
        앱에서 직접 추가할 때 붙여넣으세요. 이 토픽을 아는 사람은 알림을 받을 수 있으니 공유하지
        마세요.
      </p>
    </BottomSheet>
  );
}
