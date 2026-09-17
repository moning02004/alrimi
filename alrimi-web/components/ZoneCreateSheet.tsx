"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { BottomSheet } from "./BottomSheet";
import { SharingPeople } from "./SharingPeople";
import { SharedSwitch } from "./SharedSwitch";
import { firstError } from "@/lib/api";
import { useCreateZone } from "@/hooks/useZones";
import type { Zone } from "@/types";

/**
 * 새 공간을 만든다. 색은 서버가 팔레트에서 골라주므로 이름과, 함께 볼지만 받는다.
 *
 * **함께 볼지는 만들 때 정한다.** 어린이집 공간은 처음부터 가족과 보려고 만드는 것이라,
 * 만든 뒤 설정에 다시 들어가 켜게 하면 그 한 걸음을 잊고 혼자만 알림을 받는다.
 * 기본은 꺼짐이다 — 대부분의 공간(회사 등)은 혼자 본다.
 *
 * 누구와 볼지는 공간마다 고르지 않는다. 설정의 "함께 보는 사람" 에 한 번 정해둔 사람들이다.
 * 아직 아무도 없으면 켠 자리에서 바로 더할 수 있게 그 목록을 펼쳐준다.
 */
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
  const [shared, setShared] = useState(false);
  const [viewersCanEdit, setViewersCanEdit] = useState(false);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("이름을 적어주세요");
      return;
    }

    createZone.mutate(
      { name: trimmed, shared, viewersCanEdit: shared && viewersCanEdit },
      {
        onSuccess: (zone) => {
          onClose();
          onCreated?.(zone);
          toast.success(
            zone.shared ? `${zone.name} 공간을 함께 보기로 만들었어요` : `${zone.name} 공간을 만들었어요`,
          );
        },
        // 같은 이름이 이미 있으면 400 이 온다. 무엇이 문제인지 서버가 말해준다
        onError: (error) => toast.error(firstError(error, "공간을 만들지 못했어요")),
      },
    );
  };

  return (
    <>
      <label htmlFor="zone-create-name" className="block px-1 pb-1.5 text-xs font-medium text-muted">
        이름
      </label>
      <input
        id="zone-create-name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        maxLength={40}
        placeholder="어린이집, 우리집, 회사"
        className="w-full rounded-xl border border-line bg-card px-3.5 py-3 text-base
                   placeholder:text-muted/50 focus:border-pine focus:outline-none"
      />

      <div className="mt-3 rounded-xl border border-line bg-card">
        <SharedSwitch
          on={shared}
          onToggle={() => setShared(!shared)}
          canEdit={viewersCanEdit}
          onToggleEdit={() => setViewersCanEdit(!viewersCanEdit)}
        />
        {shared && (
          <div className="border-t border-line px-3.5 pb-3.5 pt-3">
            <p className="px-1 pb-2 text-xs font-medium text-muted">함께 보는 사람</p>
            <SharingPeople compact />
          </div>
        )}
      </div>

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
