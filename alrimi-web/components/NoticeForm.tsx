"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import {
  DAY_OPTIONS,
  HOUR_OPTIONS,
  PRESETS,
  PRIORITIES,
  codeLabel,
  makeCode,
  sortCodes,
} from "@/lib/alerts";
import { fullLabel, startOfDay, toISO } from "@/lib/date";
import { useCreateNotice, useUpdateNotice } from "@/hooks/useNotices";
import { onColor } from "@/lib/color";
import { useZoneMark, useZones } from "@/hooks/useZones";
import { ZoneMark } from "./ZoneMark";
import type { NoticeDetail, Priority } from "@/types";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * 날짜 칸을 누르면 달력을 띄운다.
 *
 * showPicker()는 사용자 조작 없이 부르면 예외를 던지고, 지원하지 않는 브라우저도
 * 있다. 어느 쪽이든 기본 동작(직접 입력)은 그대로 남으므로 조용히 넘어간다.
 */
function openDatePicker(input: HTMLInputElement) {
  try {
    input.showPicker?.();
  } catch {
    // 달력만 안 열릴 뿐 입력은 된다
  }
}

interface Props {
  /** 있으면 수정, 없으면 등록 */
  notice?: NoticeDetail;
  /** 달력에서 빈 날을 눌러 열었을 때 미리 채워지는 날짜 */
  initialDate?: string | null;
  onDone: () => void;
}

export function NoticeForm({ notice, initialDate, onDone }: Props) {
  const editing = Boolean(notice);
  const { zones, defaultZone, setLastUsedZone } = useZones();
  const markOf = useZoneMark();

  const [zoneId, setZoneId] = useState<number | null>(
    notice?.zone_id ?? defaultZone?.id ?? null,
  );
  const [eventDate, setEventDate] = useState(notice?.event_date ?? initialDate ?? "");
  const [title, setTitle] = useState(notice?.title ?? "");
  const [content, setContent] = useState(notice?.content ?? "");
  const [priority, setPriority] = useState<Priority>(notice?.priority ?? 3);
  const [alerts, setAlerts] = useState<string[]>(
    notice ? sortCodes(notice.alerts.map((a) => a.code)) : PRESETS["준비물용"],
  );

  const [day, setDay] = useState(1);
  const [hour, setHour] = useState(20);
  const [error, setError] = useState<string | null>(null);

  /**
   * 지난 날짜로는 등록하지 못하게 한다. 알림 시각이 이미 지나 있어서
   * 저장하자마자 서버가 예약된 알림을 전부 한꺼번에 쏴버린다.
   * 이미 있는 지난 일정을 고치는 중이면 그 날짜는 그대로 둔다.
   */
  const today = toISO(startOfDay(new Date()));
  const minDate = notice && notice.event_date < today ? notice.event_date : today;

  const create = useCreateNotice();
  const update = useUpdateNotice(notice?.id ?? 0);
  const mutation = editing ? update : create;

  const addAlert = () => {
    const code = makeCode(day, hour);
    if (alerts.includes(code)) {
      setError("이미 추가한 시점이에요");
      return;
    }
    setError(null);
    setAlerts(sortCodes([...alerts, code]));
  };

  const submit = () => {
    if (!zoneId) {
      setError("공간을 골라주세요");
      return;
    }
    if (!eventDate) {
      setError("날짜를 골라주세요");
      return;
    }
    if (eventDate < minDate) {
      setError("지난 날짜로는 등록할 수 없어요");
      return;
    }
    if (!title.trim()) {
      setError("제목을 적어주세요");
      return;
    }
    if (alerts.length === 0) {
      setError("알림을 하나 이상 추가해주세요");
      return;
    }

    const payload = {
      zone: zoneId,
      event_date: eventDate,
      title: title.trim(),
      content: content.trim(),
      priority,
      alerts,
    };

    mutation.mutate(payload, {
      onSuccess: () => {
        setLastUsedZone(zoneId);
        // 먼 일정은 목록 화면 밖에 저장되므로 언제인지 알려준다
        toast.success(
          editing ? "수정했어요" : `${fullLabel(eventDate)}에 등록했어요`,
        );
        onDone();
      },
      onError: () => setError("저장하지 못했어요. 잠시 후 다시 눌러주세요."),
    });
  };

  const hint = PRIORITIES.find((p) => p.value === priority)!.hint;
  const inputCls =
    "-mx-2 min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1.5 text-base " +
    "placeholder:text-muted/50 focus:bg-paper focus:outline-none focus:ring-2 focus:ring-pine/40";

  return (
    <>
      <div className="divide-y divide-line rounded-2xl border border-line bg-card">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <span className="w-14 shrink-0 text-sm text-muted">공간</span>
          <div className="flex flex-1 gap-1.5 overflow-x-auto">
            {zones.map((zone) => {
              const on = zone.id === zoneId;
              return (
                <button
                  key={zone.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setZoneId(zone.id);
                    setError(null);
                  }}
                  style={on ? { background: zone.color, color: onColor(zone.color) } : undefined}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${
                    on ? "font-medium" : "border border-line text-muted"
                  }`}
                >
                  <ZoneMark
                    mark={markOf(zone.id)?.mark ?? ""}
                    // 고른 칩은 그 색으로 차 있어서 같은 색 딱지가 묻는다. 뒤집어 얹는다.
                    color={on ? onColor(zone.color) : zone.color}
                    size="sm"
                  />
                  {zone.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-2">
          <label htmlFor="date" className="w-14 shrink-0 text-sm text-muted">
            날짜
          </label>
          <input
            id="date"
            type="date"
            min={minDate}
            value={eventDate}
            onChange={(e) => {
              setEventDate(e.target.value);
              setError(null);
            }}
            // 브라우저는 오른쪽 끝 아이콘을 눌러야만 달력을 연다.
            // 칸 어디를 눌러도 열리게 한다 — 좁은 화면에서 그 아이콘만 겨냥하기 어렵다.
            onClick={(e) => openDatePicker(e.currentTarget)}
            onFocus={(e) => openDatePicker(e.currentTarget)}
            className={inputCls}
          />
        </div>

        <div className="flex items-center gap-3 px-4 py-2">
          <label htmlFor="title" className="w-14 shrink-0 text-sm text-muted">
            제목
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError(null);
            }}
            placeholder="가을 운동회"
            className={inputCls}
          />
        </div>

        <div className="flex items-center gap-3 px-4 py-2">
          <label htmlFor="content" className="w-14 shrink-0 text-sm text-muted">
            내용
          </label>
          <input
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="흰 티셔츠, 모자"
            className={inputCls}
          />
        </div>

        <div className="px-4 py-2.5">
          <div className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-sm text-muted">중요도</span>
            <div className="flex flex-1 gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  aria-pressed={priority === p.value}
                  onClick={() => setPriority(p.value)}
                  className={`flex-1 rounded-lg border py-1.5 text-sm ${
                    priority === p.value
                      ? "border-pine bg-pinelt font-medium text-pine"
                      : "border-line bg-paper text-muted"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <p className="ml-14 pl-3 pt-1.5 text-xs text-muted">{hint}</p>
        </div>

        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">알림</span>
            <div className="flex gap-3 text-xs">
              {Object.keys(PRESETS).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setAlerts(PRESETS[name]);
                    setError(null);
                  }}
                  className="text-muted hover:text-pine"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {alerts.length === 0 && (
              <span className="text-sm text-muted/70">아래에서 추가하세요</span>
            )}
            {alerts.map((code) => (
              <span
                key={code}
                className="inline-flex items-center gap-1 rounded-full border border-pine
                           bg-pinelt py-1 pl-3 pr-1 text-sm text-pine"
              >
                {codeLabel(code)}
                <button
                  type="button"
                  aria-label={`${codeLabel(code)} 삭제`}
                  onClick={() => setAlerts(alerts.filter((c) => c !== code))}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-pine/60"
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <div className="mt-2.5 flex gap-1.5">
            <select
              aria-label="며칠 전"
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
              className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2.5 py-2 text-sm"
            >
              {DAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <select
              aria-label="시각"
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2.5 py-2 text-sm"
            >
              {HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {pad(h)}:00
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={addAlert}
              className="shrink-0 rounded-lg border border-pine px-3.5 py-2 text-sm font-medium text-pine"
            >
              추가
            </button>
          </div>

          {editing && (
            <p className="mt-2.5 text-xs text-muted">
              이미 발송된 알림은 그대로 유지됩니다.
            </p>
          )}
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <button
        onClick={submit}
        disabled={mutation.isPending}
        className="my-3 w-full rounded-xl bg-pine py-3.5 text-base font-medium text-white disabled:opacity-60"
      >
        {mutation.isPending ? "저장하는 중" : "저장하기"}
      </button>
    </>
  );
}
