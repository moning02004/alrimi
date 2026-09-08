"use client";

import Link from "next/link";
import toast from "react-hot-toast";
import { HiCheckCircle, HiOutlineCheckCircle } from "react-icons/hi2";
import { pageUrl } from "@/constants/routeUrl";
import { priorityLabel } from "@/lib/alerts";
import { hourLabel } from "@/lib/date";
import { useToggleComplete } from "@/hooks/useNotices";
import { useZoneMark } from "@/hooks/useZones";
import { AlertDots } from "./AlertDots";
import { ZoneMark } from "./ZoneMark";
import type { NoticeListItem } from "@/types";

/**
 * 한 줄. 왼쪽 머리글자 딱지가 공간을 나타낸다.
 * 존 이름을 통째로 제목 앞에 붙이면 제목보다 먼저 읽히고 같은 이름이 반복돼
 * 시끄럽다. 한 글자면 훑는 속도를 늦추지 않으면서 어느 공간인지 말해준다.
 * 날짜는 섹션 헤더가 이미 말해주므로 카드에 두지 않는다.
 *
 * 오른쪽 동그라미로 여기서 바로 완료할 수 있다. 아침에 목록을 훑으며 끝난 것을
 * 지우는 게 이 앱의 주 용도인데, 그때마다 상세로 들어갔다 나오면 두 번씩 오간다.
 */
export function NoticeCard({
  notice,
  /** 주면 링크 대신 이 함수를 부른다 — PC 2단에서 옆 칸에 펼치려고 */
  onSelect,
}: {
  notice: NoticeListItem;
  onSelect?: (noticeId: number) => void;
}) {
  const badge = priorityLabel(notice.priority);
  const zone = useZoneMark()(notice.zone_id);
  // 목록에서는 완료한 것이 아예 빠진다. 기간·하루 보기에만 흐리게 남아 되돌릴 수 있다.
  const done = notice.completed_at !== null;
  const toggle = useToggleComplete(notice.id);

  const inner = (
    <>
      {zone ? (
        <ZoneMark mark={zone.mark} color={zone.color} name={zone.name} />
      ) : (
        // 공간 목록이 아직 안 왔을 때. 자리를 비워두면 제목 줄이 흔들린다.
        <span className="h-6 w-6 shrink-0 rounded-lg" style={{ background: notice.zone_color }} />
      )}

      <span className="flex min-w-0 flex-1 items-center gap-2">
        {/*
          목록이 같은 날 안에서 시각 순이라 제목 앞에 둔다 — 눈이 훑는 축과 같은
          자리다. 없는 줄에는 자리도 만들지 않는다: 대부분 시각이 없는데 빈 칸을
          잡아두면 목록 전체가 그 폭만큼 밀린다.
        */}
        {notice.event_hour !== null && (
          <span className="shrink-0 text-xs tabular-nums text-muted">
            {hourLabel(notice.event_hour)}
          </span>
        )}
        <span className={`truncate font-medium ${done ? "line-through" : ""}`}>
          {notice.title}
        </span>
        {badge === "긴급" && (
          <span className="shrink-0 rounded-full bg-amberlt px-2 py-0.5 text-xs text-amber">
            긴급
          </span>
        )}
        {badge === "낮음" && <span className="shrink-0 text-xs text-muted">낮음</span>}
      </span>

      {!done && <AlertDots alerts={notice.alerts} />}
    </>
  );

  const openCls = "flex min-w-0 flex-1 items-center gap-3 py-3 pl-3 pr-2 text-left";

  return (
    // 링크 안에 버튼을 넣으면 안 된다(중첩 조작 요소). 나란히 둔다.
    <div
      className={`flex items-center rounded-xl border border-line bg-card transition-colors
                  hover:border-muted/40 hover:bg-paper ${done ? "opacity-55" : ""}`}
    >
      {onSelect ? (
        <button type="button" onClick={() => onSelect(notice.id)} className={openCls}>
          {inner}
        </button>
      ) : (
        <Link href={pageUrl.notice(notice.id)} className={openCls}>
          {inner}
        </Link>
      )}

      {/*
        44px 과녁. 보이는 동그라미는 20px 이지만 손가락으로 겨냥하는 자리는 그보다
        커야 한다 — 옆 칸(카드 열기)을 잘못 누르면 화면이 통째로 바뀐다.
      */}
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
        aria-label={`${notice.title} ${done ? "완료 취소" : "완료로 표시"}`}
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
    </div>
  );
}
