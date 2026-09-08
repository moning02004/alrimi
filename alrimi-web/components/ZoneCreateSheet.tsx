"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { BottomSheet } from "./BottomSheet";
import { firstError } from "@/lib/api";
import { useCreateZone } from "@/hooks/useZones";
import type { Zone } from "@/types";

/** 새 공간을 만든다. 색은 서버가 팔레트에서 골라주므로 이름만 받는다 */
export function ZoneCreateSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (zone: Zone) => void;
}) {
  return (
    <BottomSheet open={open} onOpenChange={(next) => !next && onClose()} title="새 공간">
      {/* key 없이도 열 때마다 다시 마운트되므로 빈 칸으로 시작한다 */}
      {open && <Form onClose={onClose} onCreated={onCreated} />}
    </BottomSheet>
  );
}

function Form({ onClose, onCreated }: { onClose: () => void; onCreated?: (zone: Zone) => void }) {
  const createZone = useCreateZone();
  const [name, setName] = useState("");

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    createZone.mutate(trimmed, {
      onSuccess: (zone) => {
        onClose();
        onCreated?.(zone);
        toast.success(`${zone.name} 공간을 만들었어요`);
      },
      // 같은 이름이 이미 있으면 400 이 온다. 무엇이 문제인지 서버가 말해준다
      onError: (error) => toast.error(firstError(error, "공간을 만들지 못했어요")),
    });
  };

  return (
    <>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        maxLength={40}
        placeholder="어린이집, 우리집, 회사"
        className="w-full rounded-xl border border-line bg-card px-3.5 py-3 text-base
                   placeholder:text-muted/50 focus:border-pine focus:outline-none"
      />
      <p className="mt-2 px-1 text-xs text-muted">공간마다 색과 ntfy 토픽이 따로 생깁니다.</p>
      <button
        onClick={submit}
        disabled={createZone.isPending}
        className="my-3 w-full rounded-xl bg-pine py-3.5 text-base font-medium text-white disabled:opacity-60"
      >
        {createZone.isPending ? "만드는 중" : "만들기"}
      </button>
    </>
  );
}
