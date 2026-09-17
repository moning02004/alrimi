"use client";

import Link from "next/link";
import toast from "react-hot-toast";
import { HiCheckCircle, HiOutlineCheckCircle } from "react-icons/hi2";
import { LuRepeat } from "react-icons/lu";
import { pageUrl } from "@/constants/routeUrl";
import { dayIndex, hourLabel, spanDays } from "@/lib/date";
import { useToggleComplete } from "@/hooks/useEvents";
import { useZoneMark } from "@/hooks/useZones";
import { useSelection, useZoneSheet } from "@/store/ui";
import { AlertDots } from "./AlertDots";
import { ZoneMark } from "./ZoneMark";
import type { EventListItem } from "@/types";

/**
 * 한 줄. 왼쪽 머리글자 딱지가 공간을 나타낸다.
 * 존 이름을 통째로 제목 앞에 붙이면 제목보다 먼저 읽히고 같은 이름이 반복돼
 * 시끄럽다. 한 글자면 훑는 속도를 늦추지 않으면서 어느 공간인지 말해준다.
 * 날짜는 섹션 헤더가 이미 말해주므로 카드에 두지 않는다.
 *
 * **딱지를 누르면 공간을 바꾼다.** 등록할 때 공간을 잘못 고르는 일이 흔한데, 고치러
 * 상세 → 수정 → 공간 → 저장까지 가야 했다. 딱지가 이미 "이 일정의 공간" 을 말하는
 * 자리라 그것을 누르는 것이 곧 그 값을 고치는 동작으로 읽힌다. 그래서 딱지는 카드를
 * 여는 링크 **밖에** 선다 — 링크 안에 버튼을 넣을 수는 없다.
 *
 * 오른쪽 동그라미로 여기서 바로 완료할 수 있다. 아침에 목록을 훑으며 끝난 것을
 * 지우는 게 이 앱의 주 용도인데, 그때마다 상세로 들어갔다 나오면 두 번씩 오간다.
 *
 * **고르는 중(`useSelection`)에는 카드가 통째로 고르는 자리가 된다.** 그때는 열지도
 * 완료하지도 공간을 바꾸지도 않는다 — 지울 것을 고르는 동안 다른 조작이 섞이면
 * 무엇을 누른 건지 알 수 없다.
 */
export function EventCard({
  event,
  /** 주면 링크 대신 이 함수를 부른다 — PC 2단에서 옆 칸에 펼치려고 */
  onSelect,
  on,
}: {
  event: EventListItem;
  onSelect?: (eventId: number) => void;
  /**
   * 이 카드가 놓인 날 (YYYY-MM-DD). 며칠에 걸치는 일정은 걸치는 날마다 한 장씩
   * 나오므로, 지금 몇 일째를 그리는 중인지 알아야 "2일차" 를 적을 수 있다.
   */
  on?: string;
}) {
  const zone = useZoneMark()(event.zone_id);
  // 목록에서는 완료한 것이 아예 빠진다. 기간·하루 보기에만 흐리게 남아 되돌릴 수 있다.
  const done = event.completed_at !== null;
  const toggle = useToggleComplete(event.id);

  const selecting = useSelection((s) => s.active);
  const picked = useSelection((s) => s.ids.includes(event.id));
  const pick = useSelection((s) => s.toggle);
  const openZoneSheet = useZoneSheet((s) => s.openFor);
  /*
    함께 보는(공유받은) 공간의 일정은 보기만 한다. 완료 동그라미·공간 바꾸기가 없고
    고르는 중에도 골라지지 않는다 — 서버가 지우기를 건너뛰어 "못 지웠어요" 만 남는다.
  */
  const editable = event.can_edit;

  /*
    며칠째인지. 여행 둘째 날 카드가 첫날 카드와 똑같이 생기면 목록을 훑다가
    "어제 본 그건가?" 하고 멈추게 된다.

    "2/3" 처럼 몇 째 날인지와 며칠짜리인지를 함께 적는다. 며칠째만 적으면 오늘이
    끝인지 아직 반도 안 왔는지를 알 수 없는데, 그 둘은 다른 하루다. 마지막 날은
    "3/3" 이라 따로 이름을 붙이지 않아도 끝인 줄 안다.

    `on` 없이 그리는 자리(어느 하루에 놓인 것이 아닐 때)는 셀 기준이 없으므로
    기간만 적는다.
  */
  const span = spanDays(event.event_date, event.end_date);
  const nth = on ? dayIndex(event.event_date, on) : 0;
  const dayMark = span < 2 ? null : nth ? `${nth}/${span}` : `${span}일간`;
  const zoneColor = zone?.color ?? event.zone_color;

  /*
    누구의 무슨 공간인지는 딱지가 말하고, 필터 목록(`ZoneFilter`)이 범례다. 내 일정은 공간
    딱지(네모), 받은 일정은 사람 딱지(동그라미) — 필터가 받은 공간을 사람마다 하나로 묶기 때문이다. 받은 일정은 대신
    제목 앞에 `[공간 이름]` 을 적는다(아래 `body`).
  */
  const mark = zone ? (
    <ZoneMark mark={zone.mark} color={zone.color} name={zone.label} round={zone.received} />
  ) : (
    // 공간 목록이 아직 안 왔을 때. 자리를 비워두면 제목 줄이 흔들린다.
    <span className="h-6 w-6 shrink-0 rounded-lg" style={{ background: zoneColor }} />
  );

  const body = (
    <>
      {/*
        목록이 같은 날 안에서 시각 순이라 제목 앞에 둔다 — 눈이 훑는 축과 같은
        자리다. 없는 줄에는 자리도 만들지 않는다: 대부분 시각이 없는데 빈 칸을
        잡아두면 목록 전체가 그 폭만큼 밀린다.
      */}
      {event.event_hour !== null && (
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {hourLabel(event.event_hour)}
        </span>
      )}
      {/*
        받은 공간의 일정은 딱지가 사람이라, 그 사람의 어느 공간인지를 제목 앞에 적는다.
        내 공간은 딱지가 곧 공간이라 적지 않는다.
      */}
      <span className={`truncate font-medium ${done ? "line-through" : ""}`}>
        {zone?.received && <span className="font-normal text-muted">[{zone.zoneName}] </span>}
        {event.title}
      </span>
    </>
  );

  const tail = (
    <>
      {/* 반복 일정. 이름을 읽기 전에 "매주 오는 것" 인 줄 알게 한다 */}
      {event.series_id !== null && (
        <LuRepeat className="h-3.5 w-3.5 shrink-0 text-muted/70" aria-label="반복 일정" role="img" />
      )}
      {dayMark && (
        <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-xs tabular-nums text-muted">
          {dayMark}
        </span>
      )}
      {!done && <AlertDots alerts={event.alerts} />}
    </>
  );

  const cardCls = `relative flex items-center overflow-hidden rounded-xl border bg-card
                   transition-colors ${done ? "opacity-55" : ""}`;

  /*
    며칠에 걸치는 일정만 왼쪽에 띠가 선다.

    그런 일정은 걸치는 날마다 한 장씩 나오는데, 목록을 훑을 때 "2일차" 딱지는
    카드 오른쪽 끝에 있어서 제목까지 다 읽은 뒤에야 눈에 든다. 왼쪽 띠는 훑는
    눈이 지나가는 자리라, 읽기 전에 이미 "이건 이어지는 일" 이라고 말한다.

    파스텔이다 — 공간 색을 그대로 세우면 왼쪽 딱지와 같은 색이 두 번 나와
    시끄럽고, 제목보다 띠가 먼저 읽힌다. 있는 줄만 알면 되는 표시다.
    `overflow-hidden` 은 이 띠를 카드의 둥근 모서리에 맞춰 잘라준다.
  */
  const band = span > 1 && (
    <span
      aria-hidden="true"
      className="absolute inset-y-0 left-0 w-1.5"
      style={{ background: zoneColor, opacity: 0.3 }}
    />
  );

  if (selecting) {
    return (
      <button
        type="button"
        onClick={() => pick(event.id)}
        aria-pressed={picked}
        // 남의 공간 것은 고를 수 없다. 자리는 지켜 목록이 흔들리지 않게 한다
        disabled={!editable}
        title={editable ? undefined : "함께 보는 공간의 일정은 지울 수 없어요"}
        className={`${cardCls} w-full gap-3 py-3 pl-3 pr-3 text-left disabled:opacity-50 ${
          picked ? "border-pine bg-pinelt/40" : "border-line"
        }`}
      >
        {band}
        <CheckMark on={picked} />
        {mark}
        <span className="flex min-w-0 flex-1 items-center gap-2">{body}</span>
        {tail}
      </button>
    );
  }

  const openCls = "flex min-w-0 flex-1 items-center gap-2 py-3 pr-2 text-left";

  return (
    // 링크 안에 버튼을 넣으면 안 된다(중첩 조작 요소). 나란히 둔다.
    <div className={`${cardCls} border-line hover:border-muted/40 hover:bg-paper`}>
      {band}

      {/*
        딱지는 링크 밖이다. 누르면 공간을 바꾼다(내 일정만) — 등록할 때 공간을 잘못 고르는 일이
        흔한데, 고치러 상세 → 수정까지 가지 않게. 링크 안에 버튼을 넣을 수는 없어 나란히 둔다.
      */}
      {/*
        받은 공간의 딱지는 사람이라 누를 자리가 아니다 — 공간을 바꾸는 것은 내 일정만이다
        (함께 편집하는 공간이라도 다른 사람의 공간으로는 옮길 수 없다).
      */}
      {editable && !zone?.received ? (
        <button
          type="button"
          onClick={() => openZoneSheet(event)}
          title="공간 바꾸기"
          aria-label={`공간 바꾸기${zone ? ` · 지금 ${zone.label}` : ""}`}
          className="relative shrink-0 rounded-lg py-3 pl-3 pr-1 transition-transform hover:scale-110"
        >
          {mark}
        </button>
      ) : (
        <span className="relative shrink-0 py-3 pl-3 pr-1">{mark}</span>
      )}

      {onSelect ? (
        <button type="button" onClick={() => onSelect(event.id)} className={openCls}>
          {body}
        </button>
      ) : (
        <Link href={pageUrl.event(event.id)} className={openCls}>
          {body}
        </Link>
      )}

      {tail}

      {/*
        44px 과녁. 보이는 동그라미는 20px 이지만 손가락으로 겨냥하는 자리는 그보다
        커야 한다 — 옆 칸(카드 열기)을 잘못 누르면 화면이 통째로 바뀐다.
      */}
      {editable ? (
      <button
        type="button"
        onClick={() =>
          toggle.mutate(!done, {
            onSuccess: () => toast.success(done ? "다시 예정으로 돌렸어요" : "완료했어요"),
            onError: () => toast.error("바꾸지 못했어요"),
          })
        }
        disabled={toggle.isPending}
        aria-pressed={done}
        aria-label={`${event.title} ${done ? "완료 취소" : "완료로 표시"}`}
        title={done ? "완료 취소" : "완료로 표시"}
        className="mr-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full
                   transition-colors hover:bg-pinelt disabled:opacity-40"
      >
        {done ? (
          <HiCheckCircle className="h-5 w-5 text-pine" aria-hidden="true" />
        ) : (
          <HiOutlineCheckCircle className="h-5 w-5 text-muted/60" aria-hidden="true" />
        )}
      </button>
      ) : (
        // 동그라미 자리만큼 비워둔다. 없애면 공유 일정의 발송 점만 오른쪽 끝으로 밀려
        // 위아래 카드와 줄이 어긋난다.
        <span aria-hidden="true" className="mr-1.5 h-11 w-11 shrink-0" />
      )}
    </div>
  );
}

/** 고르는 중에만 나오는 네모. 완료 동그라미와 모양을 달리해 둘을 헷갈리지 않게 한다 */
function CheckMark({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-white ${
        on ? "border-pine bg-pine" : "border-line bg-card"
      }`}
    >
      {on && (
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor">
          <path d="M5 10.5l3.5 3.5L15 7" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}
