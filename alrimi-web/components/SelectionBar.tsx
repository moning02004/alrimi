"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { useDeleteEvents } from "@/hooks/useEvents";
import { useSelection } from "@/store/ui";

/**
 * 여러 개를 골랐을 때 화면 아래에 서는 막대. 고른 개수와 할 일(삭제)을 말한다.
 *
 * 탭바를 덮고 선다. 고르는 동안은 다른 데로 갈 일이 없고, 탭바 위에 한 줄을 더
 * 얹으면 좁은 화면에서 목록이 그만큼 가려진다.
 *
 * 삭제는 한 번 더 묻는다 — 되돌릴 수 없고, 고른 것이 여럿이라 한 번에 잃는 것이 크다.
 */
export function SelectionBar() {
  const active = useSelection((s) => s.active);
  const ids = useSelection((s) => s.ids);
  const stop = useSelection((s) => s.stop);
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteEvents();

  if (!active) return null;

  const done = () => {
    setConfirming(false);
    stop();
  };

  const submit = () =>
    remove.mutate(ids, {
      onSuccess: ({ deleted, failed }) => {
        if (failed > 0) toast.error(`${deleted}개를 지웠고 ${failed}개는 실패했어요`);
        else toast.success(`${deleted}개를 지웠어요`);
        done();
      },
      onError: () => toast.error("삭제하지 못했어요"),
    });

  return (
    <div
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card
                 px-4 pb-2 pt-3"
    >
      <div className="mx-auto w-full max-w-2xl">
        {confirming ? (
          <>
            <p className="px-1 pb-2 text-sm">
              {ids.length}개를 삭제할까요?{" "}
              <span className="text-muted">예약된 알림도 함께 사라져요.</span>
            </p>
            <div className="flex gap-2">
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
          </>
        ) : (
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 px-1 text-sm">
              {ids.length > 0 ? (
                <>
                  <span className="font-medium">{ids.length}개</span> 선택
                </>
              ) : (
                <span className="text-muted">지울 일정을 골라주세요</span>
              )}
            </p>
            <button onClick={done} className="shrink-0 rounded-xl border border-line px-4 py-2.5 text-sm">
              취소
            </button>
            <button
              onClick={() => setConfirming(true)}
              disabled={ids.length === 0}
              className="shrink-0 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white
                         disabled:opacity-40"
            >
              삭제
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
