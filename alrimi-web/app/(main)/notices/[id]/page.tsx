"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useDeleteNotice, useNotice, useSendAlert, useToggleComplete } from "@/hooks/useNotices";
import { useZoneMark } from "@/hooks/useZones";
import { ZoneMark } from "@/components/ZoneMark";
import { firstError } from "@/lib/api";
import { codeLabel } from "@/lib/alerts";
import { fullLabel, monthDayLabel, timeLabel } from "@/lib/date";
import { pageUrl } from "@/constants/routeUrl";
import { BottomSheet } from "@/components/BottomSheet";
import { NoticeForm } from "@/components/NoticeForm";

export default function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const noticeId = Number(id);
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const { data: notice, isLoading } = useNotice(noticeId);
  const remove = useDeleteNotice();
  const toggleComplete = useToggleComplete(noticeId);
  const send = useSendAlert(noticeId);
  const markOf = useZoneMark();

  if (isLoading || !notice) {
    return <p className="pt-16 text-center text-sm text-muted">불러오는 중</p>;
  }

  const done = notice.completed_at !== null;
  // 이 화면은 공간 이름을 그대로 적으므로 딱지는 목록에서 본 것과 같은지 확인시켜 준다
  const zoneMark = markOf(notice.zone_id)?.mark ?? "";

  const onDelete = () => {
    if (!confirm("이 일정을 삭제할까요? 예약된 알림도 함께 사라집니다.")) return;
    remove.mutate(noticeId, {
      onSuccess: () => {
        toast.success("삭제했어요");
        router.replace(pageUrl.home);
      },
      onError: () => toast.error("삭제하지 못했어요"),
    });
  };

  /**
   * 예약 시각을 기다리지 않고 지금 민다.
   *
   * 보낸 것으로 기록되므로 시각이 와도 다시 나가지 않는다 — 같은 알림을 두 번
   * 받는 쪽이 안 오는 것보다 성가시다.
   */
  const onSend = (alertId: number) =>
    send.mutate(alertId, {
      onSuccess: () => toast.success("알림을 보냈어요"),
      // 왜 못 보냈는지는 서버가 말해준다 (ntfy 가 거절했는지, 닿지 못했는지)
      onError: (error) => toast.error(firstError(error, "보내지 못했어요")),
    });

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-card px-4 py-3">
        <button onClick={() => router.back()} className="text-sm text-muted">
          ← 뒤로
        </button>
        <div className="flex gap-4 text-sm">
          <button onClick={() => setEditing(true)} className="text-muted">
            수정
          </button>
          <button onClick={onDelete} disabled={remove.isPending} className="text-red-600">
            삭제
          </button>
        </div>
      </header>

      <main className="p-4">
        <p className="text-xs text-muted">{fullLabel(notice.event_date)}</p>
        <h1
          className={`mt-1.5 text-xl font-semibold tracking-tight ${
            done ? "text-muted line-through" : ""
          }`}
        >
          {notice.title}
        </h1>
        {notice.content && <p className="mt-2 text-base text-muted">{notice.content}</p>}

        <div className="mt-3 flex gap-1.5">
          {done && (
            <span className="rounded-full bg-pinelt px-2.5 py-1 text-xs text-pine">완료</span>
          )}
          {notice.priority === 5 && (
            <span className="rounded-full bg-amberlt px-2.5 py-1 text-xs text-amber">긴급</span>
          )}
          {notice.priority === 2 && (
            <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">
              낮음
            </span>
          )}
          <span className="flex items-center gap-1.5 rounded-full border border-line py-1 pl-1 pr-2.5 text-xs text-muted">
            <ZoneMark mark={zoneMark} color={notice.zone_color} size="sm" />
            {notice.zone_name}
          </span>
        </div>

        <p className="mb-2 mt-6 text-xs font-medium text-muted">알림 {notice.alerts.length}개</p>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
          {notice.alerts.map((alert) => (
            <li key={alert.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{codeLabel(alert.code)}</p>
                <p className="mt-0.5 text-xs text-muted">{monthDayLabel(alert.due_at)}</p>
              </div>

              <div className="flex shrink-0 items-center gap-2.5">
                {alert.status === "sent" && alert.sent_at ? (
                  <span className="rounded-full bg-pinelt px-2.5 py-1 text-xs text-pine">
                    {timeLabel(alert.sent_at)} 발송
                  </span>
                ) : alert.status === "fail" ? (
                  // 저절로 다시 시도하지 않는다. "대기 중"으로 두면 올 것처럼 읽힌다.
                  <span className="text-xs text-red-600">발송 실패</span>
                ) : done ? (
                  // 완료하면 남은 알림은 나가지 않는다. 이것도 올 것처럼 보이면 안 된다.
                  <span className="text-xs text-muted/70">보내지 않음</span>
                ) : (
                  <span className="text-xs text-muted">대기 중</span>
                )}

                {/* 시각이 되기 전에 손으로 밀거나, 실패한 것을 다시 밀 때 */}
                <button
                  onClick={() => onSend(alert.id)}
                  disabled={send.isPending}
                  className="rounded-full border border-pine px-2.5 py-1 text-xs font-medium
                             text-pine disabled:opacity-60"
                >
                  {send.isPending && send.variables === alert.id
                    ? "보내는 중"
                    : alert.status === "sent"
                      ? "다시 보내기"
                      : "보내기"}
                </button>
              </div>
            </li>
          ))}
        </ul>

        {/*
          오늘 일정이라도 이미 끝난 것이 있다. 완료하면 목록에서 빠지고
          아직 안 나간 알림도 나가지 않는다. 예약은 남아 있어 되돌리면 살아난다.
        */}
        <button
          onClick={() =>
            toggleComplete.mutate(!done, {
              onSuccess: () => toast.success(done ? "다시 예정으로 돌렸어요" : "완료했어요"),
              onError: () => toast.error("바꾸지 못했어요"),
            })
          }
          disabled={toggleComplete.isPending}
          className={`mt-4 w-full rounded-xl py-3.5 text-base font-medium disabled:opacity-60 ${
            done
              ? "border border-line bg-card text-muted"
              : "bg-pine text-white"
          }`}
        >
          {done ? "완료 취소" : "완료로 표시"}
        </button>
      </main>

      <BottomSheet open={editing} onOpenChange={setEditing} title="일정 수정">
        <NoticeForm notice={notice} onDone={() => setEditing(false)} />
      </BottomSheet>
    </>
  );
}
