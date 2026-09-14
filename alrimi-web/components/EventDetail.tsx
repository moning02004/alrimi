"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { useDeleteEvent, useEvent, useHold, useSendAlert, useToggleComplete } from "@/hooks/useEvents";
import { useZoneMark } from "@/hooks/useZones";
import { ZoneMark } from "@/components/ZoneMark";
import { ErrorBlock, LoadingBlock } from "@/components/Loading";
import { firstError } from "@/lib/api";
import { codeLabel } from "@/lib/alerts";
import { hourLabel, monthDayLabel, spanLabel, timeLabel } from "@/lib/date";
import { BottomSheet } from "@/components/BottomSheet";
import { EventForm } from "@/components/EventForm";
import { Menu } from "@/components/Menu";
import { HiCheckCircle, HiOutlineCheckCircle } from "react-icons/hi2";

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
  /** 보류함에서 꺼내는 중. 같은 폼이지만 날짜를 새로 고르게 열린다 */
  const [resuming, setResuming] = useState(false);
  const { data: event, isLoading, isError, refetch } = useEvent(eventId);
  const remove = useDeleteEvent();
  const toggleComplete = useToggleComplete(eventId);
  const hold = useHold(eventId);
  const send = useSendAlert(eventId);
  const markOf = useZoneMark();

  if (isLoading) return <LoadingBlock />;
  if (isError || !event) return <ErrorBlock onRetry={() => refetch()} />;

  const done = event.completed_at !== null;
  const held = event.held_at !== null;
  // 이 화면은 공간 이름을 그대로 적으므로 딱지는 목록에서 본 것과 같은지 확인시켜 준다
  const zoneMark = markOf(event.zone_id)?.mark ?? "";

  /**
   * 취소됐지만 다시 잡힐 수 있는 일정을 치워둔다. 지우면 제목·내용·알림 시점을
   * 다음에 처음부터 다시 적어야 하는데, "아파서 다음에 만나자" 같은 것이 그렇다.
   *
   * 되묻지 않는다 — 되돌리는 길(보류함의 "다시 잡기")이 바로 옆에 있고,
   * 지우는 것과 달리 잃는 것이 없다.
   */
  const onHold = () =>
    hold.mutate(true, {
      onSuccess: () => {
        toast.success("보류함으로 옮겼어요");
        onDeleted();
      },
      onError: () => toast.error("옮기지 못했어요"),
    });

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
        {/*
          조작은 점 세 개 안에 접어둔다. 글자 버튼 셋이 나란히 서면 화면 맨 위
          좁은 줄이 눌러야 할 것으로 차서 정작 주인공(일정)보다 먼저 눈에 들고,
          그중 하나가 삭제라 되돌릴 수 없는 조작이 늘 손끝 한 번 거리에 선다.

          완료만은 여기 없다. 아침에 목록을 훑으며 끝난 것을 찍는 것이 이 앱의
          주 용도라, 그 조작은 접어두지 않고 제목 옆에 그대로 둔다(아래).
        */}
        <Menu
          items={[
            { label: "수정", onSelect: () => setEditing(true) },
            // 이미 치워둔 것을 또 치울 수는 없다. 보류함에서 열었을 때 남아야 할
            // 것은 "정말 필요 없다" 는 길(삭제)뿐이다.
            ...(held
              ? []
              : [{ label: "보류", onSelect: onHold, disabled: hold.isPending }]),
            { label: "삭제", onSelect: onDelete, disabled: remove.isPending, danger: true },
          ]}
        />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl p-4">
        <p className="text-xs text-muted">
          {/* 하루짜리는 지금까지와 같고, 며칠짜리면 "9월 25일 금 – 27일 일 · 3일간" */}
          {spanLabel(event.event_date, event.end_date)}
          {event.event_hour !== null && (
            <span className="ml-1.5 font-medium text-pine">{hourLabel(event.event_hour)}</span>
          )}
          {/*
            보류 중에도 날짜는 남아 있다 — 무엇을 미룬 것인지 알아보라고 둔 값이라
            지금 잡힌 날처럼 읽히면 안 된다. 이 줄이 "있던 날" 이라고 말해줘야,
            아래 "날짜 다시 잡기" 가 왜 날짜부터 묻는지도 이어진다.

            조사라 앞 글자에 붙여 적는다 — 사이를 띄우면 "10시 에 있던" 이 된다.
          */}
          {held && "에 있던 일정"}
        </p>
        {/*
          완료는 제목 줄 오른쪽 끝이다. 목록 카드가 같은 자리에 같은 동그라미를
          두고 있어서(`EventCard`), 목록에서 하던 손짓이 상세에서도 그대로다 —
          화면이 바뀌었다고 찍는 자리를 다시 찾지 않아도 된다.

          바닥의 큰 초록 버튼이던 것을 여기로 올렸다. 그 자리는 알림 목록 **아래**
          라 한 화면에 안 들어오는 일이 잦았고, 폼의 "저장하기" 와 똑같이 생겨서
          이 화면에 저장할 것이 있는 것처럼 읽혔다.
        */}
        <div className="mt-1.5 flex items-start gap-2">
          <h1
            className={`min-w-0 flex-1 text-xl font-semibold tracking-tight ${
              done ? "text-muted line-through" : ""
            }`}
          >
            {event.title}
          </h1>

          {/* 보류한 것에는 끝낼 일이 없다. 서버도 보류하면 완료를 지운다 */}
          {!held && (
            <button
              type="button"
              onClick={() =>
                toggleComplete.mutate(!done, {
                  onSuccess: () => toast.success(done ? "다시 예정으로 돌렸어요" : "완료했어요"),
                  onError: () => toast.error("바꾸지 못했어요"),
                })
              }
              disabled={toggleComplete.isPending}
              aria-pressed={done}
              aria-label={done ? "완료 취소" : "완료로 표시"}
              title={done ? "완료 취소" : "완료로 표시"}
              /*
                44px 과녁. 넓힌 만큼은 음수 여백으로 도로 당긴다 — 안 그러면 이
                높이가 제목 줄의 높이가 되어, 제목 아래 내용이 그만큼 밀린다.

                `-my-2`(8px)는 제목 한 줄(text-xl = 28px)과 이 버튼(44px)의 차이
                절반이다. 44 − 16 = 28px 이라 제목 줄 높이를 건드리지 않으면서,
                동그라미가 제목 첫 줄 한가운데에 선다.
              */
              className="-my-2 -mr-2.5 flex h-11 w-11 shrink-0 items-center justify-center
                         rounded-full transition-colors hover:bg-pinelt disabled:opacity-40"
            >
              {done ? (
                <HiCheckCircle className="h-6 w-6 text-pine" aria-hidden="true" />
              ) : (
                <HiOutlineCheckCircle className="h-6 w-6 text-muted/60" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
        {event.content && <p className="mt-2 text-base text-muted">{event.content}</p>}

        <div className="mt-3 flex gap-1.5">
          {held && (
            <span className="rounded-full bg-amberlt px-2.5 py-1 text-xs text-amber">보류 중</span>
          )}
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
                ) : done || held ? (
                  // 완료하거나 치워두면 남은 알림은 나가지 않는다. 올 것처럼 보이면 안 된다.
                  // 보류한 것은 다시 잡을 때 새 날짜로 되살아난다(서버 `revive_alerts`).
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
          바닥에 남는 큰 버튼은 이것 하나뿐이다. 보류함에서 꺼내는 일은 이 화면에
          들어온 까닭 그 자체라, 접어두지 않고 제일 큰 과녁으로 둔다.

          누르면 등록 폼이 날짜만 빈 채로 열린다. 제목·내용·공간·알림 시점은
          그대로라 다시 적지 않는다 — 지우는 대신 치워두는 까닭이 그것이다.

          보류가 아닌 일정에는 여기 아무것도 없다. 완료는 제목 옆 동그라미가
          맡는다(위) — 알림 목록 아래까지 내려가야 보이는 버튼이 아니라.
        */}
        {held && (
          <>
            <button
              onClick={() => setResuming(true)}
              className="mt-4 w-full rounded-xl bg-pine py-3.5 text-base font-medium text-white"
            >
              날짜 다시 잡기
            </button>
            {/* 언제 있던 것인지는 위 날짜 줄이 이미 말한다. 여기서는 무슨 일이
                벌어지는지만 — 알림까지 새 날짜로 따라온다는 것이 안 보이면
                다시 잡고 나서 알림을 손봐야 하나 되묻게 된다. */}
            <p className="mt-2 text-center text-xs text-muted">
              새 날짜를 고르면 알림도 그 날에 맞춰 다시 잡혀요
            </p>
          </>
        )}
      </main>

      <BottomSheet open={editing} onOpenChange={setEditing} title="일정 수정">
        <EventForm event={event} onDone={() => setEditing(false)} />
      </BottomSheet>

      {/*
        수정과 같은 폼이지만 다른 시트다. 제목이 "일정 수정" 이면 날짜 칸이 왜
        비어 있는지 설명이 안 되고, `resume` 이 켜진 채로 수정까지 열리면 평범한
        수정에서도 날짜가 지워진다.
      */}
      <BottomSheet open={resuming} onOpenChange={setResuming} title="날짜 다시 잡기">
        <EventForm
          event={event}
          resume
          onDone={() => {
            setResuming(false);
            // 보류함에서 들어왔다면 그 목록으로 돌려보낸다 — 다시 잡은 일정은
            // 이제 거기 없으므로, 남아 있으면 사라진 자리를 들여다보게 된다.
            onDeleted();
          }}
        />
      </BottomSheet>
    </>
  );
}
