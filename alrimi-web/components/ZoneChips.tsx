"use client";

import { useState } from "react";
import { ZoneCreateSheet } from "./ZoneCreateSheet";
import { ZoneMark } from "./ZoneMark";
import { onColor } from "@/lib/color";
import { useZoneMark, useZones } from "@/hooks/useZones";

/**
 * 필터이면서 동시에 **범례** 역할을 한다.
 *
 * 여기서만 머리글자와 이름이 나란히 보인다 — 카드의 `우` 가 무엇인지 배우는 자리다.
 */
export function ZoneChips() {
  const { zones, selectedZoneId, selectZone } = useZones();
  const markOf = useZoneMark();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <div className="flex gap-1.5 overflow-x-auto">
        <button
          onClick={() => selectZone(null)}
          aria-pressed={selectedZoneId === null}
          className={`shrink-0 rounded-full px-3 py-1 text-sm ${
            selectedZoneId === null
              ? "bg-ink font-medium text-white"
              : "border border-line text-muted"
          }`}
        >
          전체
        </button>

        {zones.map((zone) => {
          const on = selectedZoneId === zone.id;
          return (
            <button
              key={zone.id}
              onClick={() => selectZone(on ? null : zone.id)}
              aria-pressed={on}
              style={on ? { background: zone.color, color: onColor(zone.color) } : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm ${
                on ? "font-medium" : "border border-line text-muted"
              }`}
            >
              <ZoneMark
                mark={markOf(zone.id)?.mark ?? ""}
                // 칩이 그 색으로 차 있으면 딱지도 같은 색이라 묻힌다. 뒤집어 얹는다.
                color={on ? onColor(zone.color) : zone.color}
                size="sm"
              />
              {zone.name}
            </button>
          );
        })}

        <button
          onClick={() => setAdding(true)}
          aria-label="공간 추가"
          className="shrink-0 rounded-full border border-line px-3 py-1 text-sm text-muted"
        >
          +
        </button>
      </div>

      {/* 방금 만든 공간을 바로 보여준다 */}
      <ZoneCreateSheet
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(zone) => selectZone(zone.id)}
      />
    </>
  );
}
