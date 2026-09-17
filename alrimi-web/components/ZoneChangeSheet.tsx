"use client";

import toast from "react-hot-toast";
import { BottomSheet } from "./BottomSheet";
import { ZoneMark } from "./ZoneMark";
import { firstError } from "@/lib/api";
import { useUpdateEvent } from "@/hooks/useEvents";
import { useZoneMark, useZones } from "@/hooks/useZones";
import { useZoneSheet } from "@/store/ui";

/**
 * 목록 카드의 공간 딱지를 눌렀을 때 뜨는 시트. 공간만 바꾼다.
 *
 * 등록할 때 공간을 잘못 고르는 일이 흔한데(폼이 마지막에 고른 공간으로 열린다),
 * 고치러 상세 → 수정 → 공간 → 저장까지 네 걸음을 가야 했다. 목록에서 딱지를 누르면
 * 바로 바꿀 수 있게 한다 — 딱지가 이미 "이 일정의 공간" 을 말하는 자리라, 그것을
 * 누르는 것이 곧 그 값을 고치는 동작으로 읽힌다.
 *
 * 한 곳에만 띄운다(`app/(main)/layout.tsx`). 카드마다 시트를 달면 목록에 있는 카드
 * 수만큼 시트가 생긴다.
 */
export function ZoneChangeSheet() {
  const event = useZoneSheet((s) => s.event);
  const close = useZoneSheet((s) => s.close);

  return (
    <BottomSheet
      open={event !== null}
      onOpenChange={(next) => !next && close()}
      title="공간 바꾸기"
    >
      {event && <ZonePicker event={event} onDone={close} />}
    </BottomSheet>
  );
}

function ZonePicker({ event, onDone }: { event: EventForPicker; onDone: () => void }) {
  /*
    옮겨 갈 수 있는 것은 **같은 주인의** 고칠 수 있는 공간뿐이다. 함께 고치는 공간이라도
    일정을 다른 사람의 공간으로 빼가면 주인의 목록과 알림에서 사라진다(서버도 막는다).
  */
  const { writableZones, zones: allZones } = useZones();
  const ownerId = allZones.find((zone) => zone.id === event.zone_id)?.owner_id;
  const zones = writableZones.filter((zone) => zone.owner_id === ownerId);
  const markOf = useZoneMark();
  const update = useUpdateEvent(event.id);

  const pick = (zoneId: number) => {
    if (zoneId === event.zone_id) return onDone();

    update.mutate(
      { zone: zoneId },
      {
        onSuccess: (moved) => {
          toast.success(`${moved.zone_name} 으로 옮겼어요`);
          onDone();
        },
        onError: (error) => toast.error(firstError(error, "옮기지 못했어요")),
      },
    );
  };

  return (
    <>
      <p className="px-1 pb-3 text-sm text-muted">
        <span className="font-medium text-ink">{event.title}</span> 을 어느 공간으로 옮길까요?
      </p>

      <div className="mb-3 divide-y divide-line rounded-2xl border border-line bg-card">
        {zones.map((zone) => {
          const on = zone.id === event.zone_id;
          const mark = markOf(zone.id);

          return (
            <button
              key={zone.id}
              onClick={() => pick(zone.id)}
              disabled={update.isPending}
              aria-pressed={on}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left
                         transition-colors hover:bg-paper disabled:opacity-60"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <ZoneMark mark={mark?.mark ?? ""} color={zone.color} />
                <span className="truncate text-sm">{zone.name}</span>
              </span>
              {/* 지금 공간에도 표시를 둔다 — 무엇을 바꾸는지 보이지 않으면 고를 수가 없다 */}
              {on && <span className="shrink-0 text-xs text-pine">지금 공간</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** 시트가 쓰는 것만. 목록 카드가 들고 있는 값이라 상세를 받아오지 않는다 */
interface EventForPicker {
  id: number;
  title: string;
  zone_id: number;
}
