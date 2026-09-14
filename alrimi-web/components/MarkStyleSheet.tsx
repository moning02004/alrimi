"use client";

import toast from "react-hot-toast";
import { HiCheck } from "react-icons/hi2";
import { BottomSheet } from "./BottomSheet";
import { firstError } from "@/lib/api";
import { useMarkPalette, useUpdateMarkStyle } from "@/hooks/useSpecialDays";
import type { MarkStyle } from "@/types";

/**
 * 한 종류(공휴일·절기·기념일)를 무슨 색으로 볼지 고르는 시트.
 *
 * **켜고 끄기는 여기 없다.** 그것은 설정 목록의 줄에 붙은 스위치가 맡는다 — 끄려고
 * 시트를 열었다 닫는 것보다 그 자리에서 한 번 누르는 편이 짧고, 여기 같이 두면
 * "색을 고르러 들어왔는데 왜 스위치가 있지" 가 된다.
 *
 * 고르는 즉시 저장하고 닫는다. 아래에 "저장" 버튼을 두면 고른 뒤 한 번 더 눌러야
 * 하는데, 값이 하나뿐인 화면에서는 그 한 번이 통째로 군더더기다.
 */
export function MarkStyleSheet({ style, onClose }: { style: MarkStyle | null; onClose: () => void }) {
  const palette = useMarkPalette();
  const update = useUpdateMarkStyle();

  const pick = (color: string) => {
    if (!style || color === style.color) {
      onClose();
      return;
    }
    // 색만 보낸다. 켜짐 여부까지 실어 보내면 스위치가 방금 바꾼 값을 덮는다.
    update.mutate(
      { kind: style.kind, color },
      {
        onSuccess: () => {
          toast.success("색을 바꿨어요");
          onClose();
        },
        onError: (error) => toast.error(firstError(error, "바꾸지 못했어요")),
      },
    );
  };

  return (
    <BottomSheet
      open={style !== null}
      onOpenChange={(next) => !next && onClose()}
      title={style ? `${style.label} 색` : "색"}
    >
      <div className="pb-2">
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {(palette.data ?? []).map((swatch) => {
            const on = swatch.color === style?.color;

            return (
              <button
                key={swatch.color}
                type="button"
                onClick={() => pick(swatch.color)}
                disabled={update.isPending}
                aria-pressed={on}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors
                           active:bg-paper disabled:opacity-60 sm:hover:bg-paper"
              >
                {/*
                  견본은 배경이 아니라 **글자**로 보여준다. 이 색이 실제로 쓰이는
                  자리가 흰 바탕의 작은 글씨라, 동그라미로만 보면 달력에서 얼마나
                  읽히는지가 안 드러난다. 옆의 큰 이름이 그 크기의 견본이다.
                */}
                <span
                  aria-hidden="true"
                  className="w-6 shrink-0 text-center text-[11px] font-semibold"
                  style={{ color: swatch.color }}
                >
                  15
                </span>
                <span className="flex-1 text-base font-medium" style={{ color: swatch.color }}>
                  {swatch.name}
                </span>
                {on && <HiCheck className="h-5 w-5 shrink-0 text-pine" aria-hidden="true" />}
              </button>
            );
          })}
        </div>

        <p className="px-1 pt-2.5 text-xs text-muted">
          달력에서는 날짜 숫자와 이름에 쓰여요. 색이 잘 안 갈려도 알아볼 수 있도록
          특일은 언제나 굵게 적습니다.
        </p>
      </div>
    </BottomSheet>
  );
}
