"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { BottomSheet } from "./BottomSheet";
import { firstError } from "@/lib/api";
import { useDeleteZone, useMuteZone, usePalette, useUpdateZone, useZones } from "@/hooks/useZones";
import { onColor } from "@/lib/color";
import { ZoneMark } from "./ZoneMark";
import { SharedSwitch, SwitchRow } from "./SharedSwitch";
import { useZoneMark } from "@/hooks/useZones";
import type { Zone } from "@/types";

interface Props {
  zone: Zone | null;
  onClose: () => void;
}

/**
 * 공간 이름과 색, 함께 보는 사람을 한자리에서 고친다.
 *
 * 함께 보는(공유받은) 공간이면 고칠 것이 없으므로 누구의 공간인지와 구성원 목록,
 * 나가는 길만 보여준다.
 */
export function ZoneEditSheet({ zone, onClose }: Props) {
  const member = zone?.role === "member";
  return (
    <BottomSheet
      open={zone !== null}
      onOpenChange={(next) => !next && onClose()}
      title={member ? "함께 보는 공간" : "공간 수정"}
    >
      {/* key 로 다시 마운트해 그 공간 값으로 폼을 초기화한다 (effect 로 덮어쓰지 않도록) */}
      {zone &&
        (member ? (
          <SharedZone key={zone.id} zone={zone} />
        ) : (
          <Form key={zone.id} zone={zone} onClose={onClose} />
        ))}
    </BottomSheet>
  );
}

function SharedZone({ zone }: { zone: Zone }) {
  const markOf = useZoneMark();
  return (
    <div className="pb-3">
      <div className="flex items-center gap-3 rounded-xl border border-line bg-card px-3.5 py-3">
        <ZoneMark mark={markOf(zone.id)?.mark ?? ""} color={zone.color} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{zone.name}</p>
          <p className="truncate text-xs text-muted">
            {zone.owner_name}님의 공간 · {zone.writable ? "일정 함께 편집" : "보기 전용"}
          </p>
        </div>
      </div>
      {/* 알림은 공간마다, 받는 사람마다 끈다 — 보기는 그대로 두고 소리만 줄이는 자리다 */}
      <div className="mt-3 rounded-xl border border-line bg-card">
        <MuteRow zone={zone} />
      </div>

      {/* 그만 보는 것은 공간마다가 아니라 사람마다다 */}
      <p className="px-1 pt-3 text-xs leading-relaxed text-muted">
        {zone.writable
          ? `${zone.owner_name}님이 허락해서 이 공간의 일정을 추가·수정할 수 있어요. 공간 이름·색은 ${zone.owner_name}님만 바꿔요.`
          : `${zone.owner_name}님이 보여주는 공간이라 일정을 고칠 수 없어요.`} 그만 보려면 설정 › 함께
        보기의 &lsquo;나에게 보여주는 사람&rsquo;에서 {zone.owner_name}님을 빼세요.
      </p>
    </div>
  );
}

function Form({ zone, onClose }: { zone: Zone; onClose: () => void }) {
  const palette = usePalette();
  const update = useUpdateZone(zone.id);
  const remove = useDeleteZone();

  const [name, setName] = useState(zone.name);
  const [color, setColor] = useState(zone.color);
  const [shared, setShared] = useState(zone.shared);
  const [viewersCanEdit, setViewersCanEdit] = useState(zone.viewers_can_edit);
  const trimmed = name.trim();
  const changed =
    trimmed !== zone.name ||
    color !== zone.color ||
    shared !== zone.shared ||
    viewersCanEdit !== zone.viewers_can_edit;

  const save = () => {
    if (!trimmed) {
      toast.error("이름을 적어주세요");
      return;
    }
    if (!changed) return onClose();

    update.mutate(
      { name: trimmed, color, shared, viewers_can_edit: viewersCanEdit },
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
    const others = zone.shared ? " 함께 보는 사람들도 더는 볼 수 없어요." : "";
    const detail = (lost > 0 ? `일정 ${lost}개와 예약된 알림도 함께 사라집니다.` : "") + others;
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
                  "
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

      {/* 누구와 볼지는 설정의 "함께 보는 사람" 에서 한 번 정한다. 여기서는 켜고 끄기만 */}
      <div className="mt-3 divide-y divide-line rounded-xl border border-line bg-card">
        <MuteRow zone={zone} />
        <SharedSwitch
          on={shared}
          onToggle={() => setShared(!shared)}
          canEdit={viewersCanEdit}
          onToggleEdit={() => setViewersCanEdit(!viewersCanEdit)}
        />
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

/**
 * 이 공간의 알림을 받을지. **나만의 설정이다** — 함께 보는 사람이 꺼도 주인은 그대로 받고,
 * 주인이 꺼도 함께 보는 사람은 받는다.
 *
 * 저장 버튼을 거치지 않고 누르는 즉시 바뀐다. 이름·색과 달리 되돌리기 쉬운 값이고, 받은 공간
 * 시트에는 저장 버튼 자체가 없다.
 */
function MuteRow({ zone }: { zone: Zone }) {
  const mute = useMuteZone(zone.id);
  /*
    스위치는 **지금 목록에 있는 값**을 본다. 시트를 열 때 받은 `zone` 은 그때의 사진이라,
    껐다 켜도 그 값이 그대로여서 스위치가 도로 켜진 것처럼 보였다(서버는 꺼져 있었다).
  */
  const { zones } = useZones();
  const current = zones.find((z) => z.id === zone.id) ?? zone;
  const on = !current.muted;

  return (
    <SwitchRow
      label="알림 받기"
      hint={
        on
          ? "이 공간 일정의 알림을 받아요."
          : "알림을 꺼뒀어요. 일정은 목록·달력에 그대로 보여요."
      }
      on={on}
      onToggle={() =>
        mute.mutate(on, {
          onSuccess: () => toast.success(on ? "이 공간 알림을 껐어요" : "이 공간 알림을 켰어요"),
          onError: () => toast.error("바꾸지 못했어요"),
        })
      }
    />
  );
}
