"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { useDeleteEvent, useEvent, useSendAlert, useToggleComplete } from "@/hooks/useEvents";
import { useZoneMark } from "@/hooks/useZones";
import { ZoneMark } from "@/components/ZoneMark";
import { ErrorBlock, LoadingBlock } from "@/components/Loading";
import { firstError } from "@/lib/api";
import { codeLabel } from "@/lib/alerts";
import { hourLabel, monthDayLabel, spanLabel, timeLabel } from "@/lib/date";
import { BottomSheet } from "@/components/BottomSheet";
import { EventForm } from "@/components/EventForm";

interface Props {
  eventId: number;
  /** "뒤로" 를 눌렀을 때. 전체 화면이면 히스토리 뒤로, 옆 칸이면 목록으로 */
  onClose: () => void;
  /** 지운 뒤 갈 곳 */
  onDeleted: () => void;
  backLabel?: string;
}

/**
 * 일정 하나를 들여다보는 화면.
 *
 * 전체 페이지(`/events/[id]`)와 PC 2단의 오른쪽 칸이 같은 것을 쓴다 — 따로 두면
 * 알림 보내기나 완료 처리 같은 것이 한쪽에서만 고쳐진다.
 */
export function EventDetail({ eventId, onClose, onDeleted, backLabel = "← 뒤로" }: Props) {
  const [editing, setEditing] = useState(false);
  const { data: event, isLoading, isError, refetch } = useEvent(eventId);
  const remove = useDeleteEvent();
  const toggleComplete = useToggleComplete(eventId);
  const send = useSendAlert(eventId);
  const markOf = useZoneMark();

  if (isLoading) return <LoadingBlock />;
  if (isError || !event) return <ErrorBlock onRetry={() => refetch()} />;

  const done = event.completed_at !== null;
  // 이 화면은 공간 이름을 그대로 적으므로 딱지는 목록에서 본 것과 같은지 확인시켜 준다
  const zoneMark = markOf(event.zone_id)?.mark ?? "";

  const onDelete = () => {
    if (!confirm("이 일정을 삭제할까요? 예약된 알림도 함께 사라집니다.")) return;
    remove.mutate(eventId, {
      onSuccess: () => {
        toast.success("삭제했어요");
        onDeleted();
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
      <header className="sticky top-0 z-20 border-b border-line bg-card px-4 py-3">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between">
        <button onClick={onClose} className="text-sm text-muted hover:text-ink">
          {backLabel}
        </button>
        <div className="flex gap-4 text-sm">
          <button onClick={() => setEditing(true)} className="text-muted">
            수정
          </button>
          <button onClick={onDelete} disabled={remove.isPending} className="text-red-600">
            삭제
          </button>
        </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl p-4">
        <p className="text-xs text-muted">
          {/* 하루짜리는 지금까지와 같고, 며칠짜리면 "9월 25일 금 – 27일 일 · 3일간" */}
          {spanLabel(event.event_date, event.end_date)}
          {event.event_hour !== null && (
            <span className="ml-1.5 font-medium text-pine">{hourLabel(event.event_hour)}</span>
          )}
        </p>
        <h1
          className={`mt-1.5 text-xl font-semibold tracking-tight ${
            done ? "text-muted line-through" : ""
          }`}
        >
          {event.title}
        </h1>
        {event.content && <p className="mt-2 text-base text-muted">{event.content}</p>}

        <div className="mt-3 flex gap-1.5">
          {done && (
            <span className="rounded-full bg-pinelt px-2.5 py-1 text-xs text-pine">완료</span>
          )}
          {event.priority === 5 && (
            <span className="rounded-full bg-amberlt px-2.5 py-1 text-xs text-amber">긴급</span>
          )}
          {event.priority === 2 && (
            <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">
              낮음
            </span>
          )}
          <span className="flex items-center gap-1.5 rounded-full border border-line py-1 pl-1 pr-2.5 text-xs text-muted">
            <ZoneMark mark={zoneMark} color={event.zone_color} size="sm" />
            {event.zone_name}
          </span>
        </div>

        <p className="mb-2 mt-6 text-xs font-medium text-muted">알림 {event.alerts.length}개</p>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
          {event.alerts.map((alert) => (
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
        <EventForm event={event} onDone={() => setEditing(false)} />
      </BottomSheet>
    </>
  );
}
