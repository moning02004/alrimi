"use client";

import { useState } from "react";
import Link from "next/link";
import { pageUrl } from "@/constants/routeUrl";
import { useEvent, useEvents } from "@/hooks/useEvents";
import { useZoneMark } from "@/hooks/useZones";
import { monthDayLabel, spanDays } from "@/lib/date";
import { BottomSheet } from "./BottomSheet";
import { EventForm } from "./EventForm";
import { ErrorBlock, LoadingBlock } from "./Loading";
import { ZoneMark } from "./ZoneMark";
import type { EventListItem } from "@/types";

/**
 * 보류함. 취소됐지만 다시 잡힐 수 있는 일정이 여기 모인다.
 *
 * 지우는 대신 치워두는 자리다 — "아파서 다음에 만나자" 는 지워버리면 제목도
 * 내용도 알림 시점도 다음에 처음부터 다시 적어야 한다.
 *
 * **날짜로 묶지 않는다.** 다른 목록은 전부 날짜가 축인데(`EventGroups`),
 * 여기 있는 것들은 날이 없어서 여기 있다. 남아 있는 `event_date` 는 언제 잡혔던
 * 것인지 알아보라는 표시일 뿐이라 줄 안에 작게 적고, 순서는 방금 치운 것부터다
 * — 미룬 약속을 다시 잡는 일은 대개 치운 지 며칠 안에 벌어진다.
 */
export function HeldList({ zoneId }: { zoneId: number | null }) {
  const { data, isLoading, isError, refetch } = useEvents("held", zoneId);
  const events = data ?? [];

  if (isLoading) return <LoadingBlock />;
  if (isError) return <ErrorBlock onRetry={() => refetch()} />;

  if (events.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted">보류한 일정이 없어요</p>
        {/*
          빈 화면이 이 자리가 무엇인지도 알려준다. 보류는 상세 화면에 들어가야
          보이는 버튼이라, 한 번도 안 써본 사람은 여기 와서도 무엇을 담는
          서랍인지 알 수 없다.
        */}
        <p className="mt-1.5 text-xs text-muted/70">
          일정을 지우는 대신 보류해두면 날짜만 다시 골라 되살릴 수 있어요
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 pt-4">
      {events.map((event) => (
        <HeldCard key={event.id} event={event} />
      ))}
    </div>
  );
}

function HeldCard({ event }: { event: EventListItem }) {
  /*
    "다시 잡기" 를 누른 뒤에야 상세를 받아온다. 목록에는 내용과 알림 코드가 안
    실려 오는데(`EventListSerializer`), 폼을 채우려면 그것이 있어야 한다.
    미리 다 받아두면 보류함을 여는 것만으로 카드 수만큼 요청이 나간다.
  */
  const [resuming, setResuming] = useState(false);
  const { data: detail } = useEvent(event.id, resuming);
  const zone = useZoneMark()(event.zone_id);

  const span = spanDays(event.event_date, event.end_date);
  // 언제 잡혔던 것인지. 무엇을 미뤘는지 알아보게 하는 값이지 지금 잡힌 날이 아니다
  const when = `${monthDayLabel(event.event_date)}${span > 1 ? ` · ${span}일간` : ""}에 있던 일정`;

  return (
    <>
      {/*
        카드를 통째로 누르면 열리는 대신, 누르는 자리가 "다시 잡기" 하나다.
        보류함에서 할 일은 그것뿐이라, 상세로 한 번 들어갔다 나오는 왕복을
        만들 이유가 없다. 상세(수정·삭제)는 제목을 눌러 들어간다.
      */}
      <div
        className="flex items-center gap-3 rounded-xl border border-line bg-card py-2.5 pl-3 pr-2.5
                   transition-colors hover:border-muted/40"
      >
        {zone ? (
          <ZoneMark mark={zone.mark} color={zone.color} name={zone.name} />
        ) : (
          // 공간 목록이 아직 안 왔을 때. 자리를 비워두면 제목 줄이 흔들린다.
          <span className="h-6 w-6 shrink-0 rounded-lg" style={{ background: event.zone_color }} />
        )}

        {/* 수정·삭제는 상세에 있다. 제목이 그리로 가는 문이다 */}
        <Link href={pageUrl.event(event.id)} className="min-w-0 flex-1">
          <p className="truncate font-medium">{event.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted">{when}</p>
        </Link>

        <button
          type="button"
          onClick={() => setResuming(true)}
          className="shrink-0 rounded-full border border-pine px-3 py-1.5 text-xs font-medium text-pine
                     transition-colors hover:bg-pinelt"
        >
          다시 잡기
        </button>
      </div>

      <BottomSheet open={resuming} onOpenChange={setResuming} title="날짜 다시 잡기">
        {/* 상세가 아직 안 왔으면 폼을 못 채운다. 빈 칸으로 열면 내용이 날아간다 */}
        {detail ? (
          <EventForm event={detail} resume onDone={() => setResuming(false)} />
        ) : (
          <LoadingBlock />
        )}
      </BottomSheet>
    </>
  );
}
