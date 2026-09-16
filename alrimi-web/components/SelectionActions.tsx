"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { BottomSheet } from "./BottomSheet";
import { useDeleteEvents } from "@/hooks/useEvents";
import { useSelection } from "@/store/ui";

/** 목록 머리줄에 서는 작은 알약. 옆의 글자 링크와 달리 "누르는 것" 으로 읽히게 한다 */
const chipCls = "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors";

/**
 * 고르기를 켜고 끄는 버튼. 누르면 "선택" 이 "취소" 로 바뀌고, 다시 누르면 풀린다.
 *
 * **자리를 지킨다.** 켜졌다고 사라지면 방금 누른 자리가 비어, 되돌리려고 화면을 훑게
 * 된다. 같은 자리에서 같은 손가락으로 되돌리는 것이 가장 짧은 길이다.
 */
export function SelectToggle() {
  const active = useSelection((s) => s.active);
  const start = useSelection((s) => s.start);
  const stop = useSelection((s) => s.stop);

  return (
    <button
      onClick={active ? stop : start}
      aria-pressed={active}
      className={`${chipCls} ${
        active
          ? "border-pine bg-pinelt font-medium text-pine"
          : "border-line bg-card text-muted hover:border-pine/50 hover:text-pine"
      }`}
    >
      {active ? "취소" : "선택"}
    </button>
  );
}

/**
 * 고른 것을 지운다. 고르는 중에만 선다.
 *
 * 개수를 버튼에 적는다 — 몇 개가 사라지는지 누르기 전에 보여야 한다. 하나도 안 골랐으면
 * 눌리지 않는다: 눌러봐야 "고른 것이 없어요" 를 되돌려줄 뿐이다.
 *
 * 되돌릴 수 없어 한 번 더 묻는데, 묻는 자리는 머리줄이 아니라 시트다. 좁은 줄에서 물으면
 * "정말 삭제" 와 "취소" 가 나란히 붙어 서서 잘못 누르기 쉽다.
 */
export function DeleteSelected() {
  const ids = useSelection((s) => s.ids);
  const stop = useSelection((s) => s.stop);
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteEvents();

  const submit = () =>
    remove.mutate(ids, {
      onSuccess: ({ deleted, failed }) => {
        // 일부만 실패할 수 있다(`useDeleteEvents`). 몇 개가 지워졌는지는 말해줘야 한다
        if (failed > 0) toast.error(`${deleted}개를 지웠고 ${failed}개는 실패했어요`);
        else toast.success(`${deleted}개를 지웠어요`);
        setConfirming(false);
        stop();
      },
      onError: () => toast.error("삭제하지 못했어요"),
    });

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        disabled={ids.length === 0}
        className={`${chipCls} border-red-300 bg-card font-medium text-red-600
                    hover:bg-red-50 disabled:opacity-40`}
      >
        삭제{ids.length > 0 && ` ${ids.length}`}
      </button>

      <BottomSheet
        open={confirming}
        onOpenChange={setConfirming}
        title="선택한 일정 삭제"
      >
        <p className="px-1 text-sm">{ids.length}개를 삭제할까요?</p>
        <p className="mt-1 px-1 text-xs text-muted">
          예약된 알림도 함께 사라지고 되돌릴 수 없어요.
        </p>

        <div className="my-3 flex gap-2">
          <button
            onClick={() => setConfirming(false)}
            className="flex-1 rounded-xl border border-line py-3 text-sm"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={remove.isPending}
            className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-medium text-white
                       disabled:opacity-60"
          >
            {remove.isPending ? "삭제하는 중" : "정말 삭제"}
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
