"use client";

import Link from "next/link";
import { pageUrl } from "@/constants/routeUrl";
import { useSeries } from "@/hooks/useEvents";
import { useZoneMark } from "@/hooks/useZones";
import { dayName, hourLabel, monthDayLabel, toDate } from "@/lib/date";
import { lunarLabel } from "@/lib/lunar";
import { repeatLabel } from "@/lib/repeat";
import { ErrorBlock, LoadingBlock } from "./Loading";
import { ZoneMark } from "./ZoneMark";
import type { SeriesItem, ZoneScope } from "@/types";

/**
 * 끝나지 않은 반복들. 다음에 오는 날 순이다.
 *
 * 반복은 가까운 날만 일정으로 있고 그 뒤는 조회할 때 펼쳐진다(서버 `EventSeries`). 그래서
 * 목록·달력으로는 "무엇이 반복되고 있나" 가 한눈에 안 보인다 — 몇 달 뒤 생신이 걸려
 * 있는지, 학기 끝에 멈춘 체육복이 아직 도는지는 여기서 본다.
 *
 * 줄을 누르면 **다음 날의 일정**이 열린다. 반복을 고치거나 끝내는 것은 거기서 "이후 모두"
 * 로 한다 — 규칙만 따로 고치는 자리를 두면 이미 만들어진 날과 어긋나는 길이 하나 더 생긴다.
 */
export function SeriesList({ zoneId }: { zoneId: ZoneScope }) {
  const { data, isLoading, isError, refetch } = useSeries(zoneId);
  const series = data ?? [];

  if (isLoading) return <LoadingBlock />;
  if (isError) return <ErrorBlock onRetry={() => refetch()} />;

  if (series.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted">반복하는 일정이 없어요</p>
        <p className="mt-1.5 text-xs text-muted/70">
          일정을 등록할 때 반복을 고르면 여기 모여요. 생신처럼 끝이 없는 것도 돼요
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 pt-4">
      {series.map((item) => (
        <SeriesCard key={item.id} series={item} />
      ))}
    </div>
  );
}

function SeriesCard({ series }: { series: SeriesItem }) {
  const zone = useZoneMark()(series.zone_id);
  const next = toDate(series.next_date);
  // 음력 반복이면 다음 날의 음력도 적는다 — 양력 날짜만으로는 무슨 날인지 안 읽힌다
  const lunar = series.lunar ? lunarLabel(series.next_date) : null;
  const hour = series.event_hour !== null ? ` ${hourLabel(series.event_hour)}` : "";

  return (
    <Link
      href={pageUrl.event(series.next_event_id)}
      className="flex items-center gap-3 rounded-xl border border-line bg-card py-2.5 pl-3 pr-3
                 transition-colors hover:border-muted/40"
    >
      {zone ? (
        <ZoneMark mark={zone.mark} color={zone.color} name={zone.label} round={zone.received} />
      ) : (
        // 공간 목록이 아직 안 왔을 때. 자리를 비워두면 제목 줄이 흔들린다.
        <span className="h-6 w-6 shrink-0 rounded-lg" style={{ background: series.zone_color }} />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {zone?.received && <span className="font-normal text-muted">[{zone.zoneName}] </span>}
          {series.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted">{repeatLabel(series)}</p>
      </div>

      {/* 다음 날. 이 화면에서 가장 궁금한 것이라 오른쪽 끝에 따로 세운다 */}
      <div className="shrink-0 text-right">
        <p className="text-xs text-muted">다음</p>
        <p className="text-sm tabular-nums">
          {monthDayLabel(series.next_date)} {dayName(next)}
          {hour}
        </p>
        {lunar && <p className="text-[11px] text-muted/80">{lunar}</p>}
      </div>
    </Link>
  );
}
