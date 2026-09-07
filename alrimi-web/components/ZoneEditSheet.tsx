"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { BottomSheet } from "./BottomSheet";
import { firstError } from "@/lib/api";
import { useDeleteZone, usePalette, useUpdateZone } from "@/hooks/useZones";
import { onColor } from "@/lib/color";
import type { Zone } from "@/types";

interface Props {
  zone: Zone | null;
  onClose: () => void;
}

/** 공간 이름과 색을 한자리에서 고친다 */
export function ZoneEditSheet({ zone, onClose }: Props) {
  return (
    <BottomSheet
      open={zone !== null}
      onOpenChange={(next) => !next && onClose()}
      title="공간 수정"
    >
      {/* key 로 다시 마운트해 그 공간 값으로 폼을 초기화한다 (effect 로 덮어쓰지 않도록) */}
      {zone && <Form key={zone.id} zone={zone} onClose={onClose} />}
    </BottomSheet>
  );
}

function Form({ zone, onClose }: { zone: Zone; onClose: () => void }) {
  const palette = usePalette();
  const update = useUpdateZone(zone.id);
  const remove = useDeleteZone();

  const [name, setName] = useState(zone.name);
  const [color, setColor] = useState(zone.color);
  const trimmed = name.trim();
  const changed = trimmed !== zone.name || color !== zone.color;

  const save = () => {
    if (!trimmed) {
      toast.error("이름을 적어주세요");
      return;
    }
    if (!changed) return onClose();

    update.mutate(
      { name: trimmed, color },
      {
        onSuccess: (saved) => {
          toast.success(`${saved.name} 공간을 고쳤어요`);
          onClose();
        },
        // 토픽은 전체에서 유일해야 해서 남이 쓰고 있으면 400 이 온다
        onError: (error) => toast.error(firstError(error, "고치지 못했어요")),
      },
    );
  };

  /**
   * 공간을 지우면 그 안의 일정과 예약된 알림까지 함께 사라진다(서버 CASCADE).
   * 되돌릴 수 없으므로 몇 개가 없어지는지 세어서 보여주고 묻는다.
   */
  const lost = zone.upcoming_count + zone.past_count;

  const onDelete = () => {
    const detail = lost > 0 ? `일정 ${lost}개와 예약된 알림도 함께 사라집니다.` : "";
    if (!confirm(`${zone.name} 공간을 삭제할까요? ${detail}`.trim())) return;

    remove.mutate(zone.id, {
      onSuccess: () => {
        toast.success(`${zone.name} 공간을 지웠어요`);
        onClose();
      },
      onError: () => toast.error("지우지 못했어요"),
    });
  };

  const busy = update.isPending || remove.isPending;

  return (
    <>
      <label htmlFor="zone-name" className="block px-1 pb-1.5 text-xs font-medium text-muted">
        이름
      </label>
      <input
        id="zone-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        maxLength={40}
        placeholder="어린이집, 우리집, 회사"
        className="w-full rounded-xl border border-line bg-card px-3.5 py-3 text-base
                   placeholder:text-muted/50 focus:border-pine focus:outline-none
                   focus:ring-2 focus:ring-pine/40"
      />

      <p className="px-1 pb-1.5 pt-4 text-xs font-medium text-muted">색</p>
      {/*
        견본에서만 고른다. 색약에서도 서로 구분되도록 맞춘 조합이라
        임의 색이 하나라도 끼면 그 보장이 깨진다. 서버도 팔레트 밖 값은 거부한다.
      */}
      <div className="grid grid-cols-4 gap-2.5">
        {(palette.data?.colors ?? []).map((swatch) => {
          const on = swatch === color;
          return (
            <button
              key={swatch}
              onClick={() => setColor(swatch)}
              aria-label={swatch}
              aria-pressed={on}
              style={{ background: swatch, color: onColor(swatch) }}
              className={`flex h-14 items-center justify-center rounded-xl text-lg font-semibold
                          ${on ? "ring-2 ring-ink ring-offset-2" : ""}`}
            >
              {on ? "✓" : ""}
            </button>
          );
        })}
      </div>

      {/* 고른 색이 목록에서 어떻게 보이는지 그 자리에서 확인한다 */}
      <div className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-card py-3 pl-3 pr-4">
        <span className="h-6 w-[3px] shrink-0 rounded-full" style={{ background: color }} />
        <span className="flex-1 truncate text-sm font-medium">가을 운동회</span>
        <span
          className="rounded-full px-2.5 py-1 text-xs font-medium"
          style={{ background: color, color: onColor(color) }}
        >
          {trimmed || zone.name}
        </span>
      </div>

      <button
        onClick={save}
        disabled={busy}
        className="mt-3 w-full rounded-xl bg-pine py-3.5 text-base font-medium text-white disabled:opacity-60"
      >
        {update.isPending ? "저장하는 중" : "저장하기"}
      </button>

      {/* 저장 옆이 아니라 아래에, 선 하나 건너 둔다 — 잘못 누르는 자리를 피한다 */}
      <button
        onClick={onDelete}
        disabled={busy}
        className="mb-3 mt-2 w-full py-3 text-sm text-red-600 disabled:opacity-60"
      >
        {remove.isPending ? "지우는 중" : "공간 삭제"}
      </button>
    </>
  );
}
