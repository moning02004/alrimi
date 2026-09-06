"use client";

import Link from "next/link";
import { pageUrl } from "@/constants/routeUrl";
import { priorityLabel } from "@/lib/alerts";
import { useZoneMark } from "@/hooks/useZones";
import { AlertDots } from "./AlertDots";
import { ZoneMark } from "./ZoneMark";
import type { NoticeListItem } from "@/types";

/**
 * 한 줄. 왼쪽 머리글자 딱지가 공간을 나타낸다.
 * 존 이름을 통째로 제목 앞에 붙이면 제목보다 먼저 읽히고 같은 이름이 반복돼
 * 시끄럽다. 한 글자면 훑는 속도를 늦추지 않으면서 어느 공간인지 말해준다.
 * 날짜는 섹션 헤더가 이미 말해주므로 카드에 두지 않는다.
 */
export function NoticeCard({ notice }: { notice: NoticeListItem }) {
  const badge = priorityLabel(notice.priority);
  const zone = useZoneMark()(notice.zone_id);
  // 목록에서는 완료한 것이 아예 빠진다. 하루 보기에만 흐리게 남아 되돌릴 수 있다.
  const done = notice.completed_at !== null;

  return (
    <Link
      href={pageUrl.notice(notice.id)}
      className={`flex items-center gap-3 rounded-xl border border-line bg-card py-3 pl-3 pr-4 active:bg-paper ${
        done ? "opacity-55" : ""
      }`}
    >
      {zone ? (
        <ZoneMark mark={zone.mark} color={zone.color} name={zone.name} />
      ) : (
        // 공간 목록이 아직 안 왔을 때. 자리를 비워두면 제목 줄이 흔들린다.
        <span className="h-6 w-6 shrink-0 rounded-lg" style={{ background: notice.zone_color }} />
      )}

      <span className="flex min-w-0 flex-1 items-center gap-2">
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

      {done ? (
        <span className="shrink-0 text-xs text-muted">완료</span>
      ) : (
        <AlertDots alerts={notice.alerts} />
      )}
    </Link>
  );
}
