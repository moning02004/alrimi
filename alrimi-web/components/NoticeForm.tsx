"use client";

import { useRef, useState } from "react";
import DatePicker from "react-datepicker";
import { ko } from "date-fns/locale";
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
import { fullLabel, hourLabel, startOfDay, toDate, toISO } from "@/lib/date";
import { firstError } from "@/lib/api";
import { useCreateNotice, useUpdateNotice } from "@/hooks/useNotices";
import { onColor } from "@/lib/color";
import { useZoneMark, useZones } from "@/hooks/useZones";
import { ZoneMark } from "./ZoneMark";
import type { NoticeDetail, Priority } from "@/types";

const pad = (n: number) => String(n).padStart(2, "0");

/** 일정 시각으로 고를 수 있는 값. 알림 시각과 달리 하루 24시간을 다 연다 */
const EVENT_HOURS = Array.from({ length: 24 }, (_, i) => i);

interface Props {
  /** 있으면 수정, 없으면 등록 */
  notice?: NoticeDetail;
  /** 달력에서 빈 날을 눌러 열었을 때 미리 채워지는 날짜 */
  initialDate?: string | null;
  onDone: () => void;
}

export function NoticeForm({ notice, initialDate, onDone }: Props) {
  const editing = Boolean(notice);
  const { zones, defaultZone } = useZones();
  const markOf = useZoneMark();

  // 공간 목록이 아직 안 왔으면 기본 공간도 정할 수 없다. 직접 고르기 전까지는
  // 기본값을 매 렌더 다시 보게 해서, 목록이 늦게 와도 빈 채로 굳지 않게 한다.
  const [picked, setPicked] = useState<number | null>(notice?.zone_id ?? null);
  const zoneId = picked ?? defaultZone?.id ?? null;
  const [eventDate, setEventDate] = useState(notice?.event_date ?? initialDate ?? "");
  const [title, setTitle] = useState(notice?.title ?? "");
  const [content, setContent] = useState(notice?.content ?? "");
  // 시각은 선택이다. 기본은 "시각 없음" — 고르라고 재촉하지 않는다.
  const [eventHour, setEventHour] = useState<number | null>(notice?.event_hour ?? null);
  const [priority, setPriority] = useState<Priority>(notice?.priority ?? 3);
  const [alerts, setAlerts] = useState<string[]>(
    notice ? sortCodes(notice.alerts.map((a) => a.code)) : PRESETS["준비물용"],
  );

  // 달력을 띄울 기준. 날짜 칸이 아니라 그 줄 전체다 — 아래 주석 참고
  const dateRow = useRef<HTMLDivElement>(null);

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
      event_hour: eventHour,
      title: title.trim(),
      content: content.trim(),
      priority,
      alerts,
    };

    mutation.mutate(payload, {
      onSuccess: () => {
        // 먼 일정은 목록 화면 밖에 저장되므로 언제인지 알려준다
        toast.success(
          editing ? "수정했어요" : `${fullLabel(eventDate)}에 등록했어요`,
        );
        onDone();
      },
      // 어느 칸이 틀렸는지는 서버가 말해준다. 뭉뚱그리면 고칠 자리를 못 찾는다.
      onError: (e) => setError(firstError(e, "저장하지 못했어요. 잠시 후 다시 눌러주세요.")),
    });
  };

  const hint = PRIORITIES.find((p) => p.value === priority)!.hint;

  // 올해면 연도를 접는다. `sectionLabel` 과 같은 모양이라 목록과 따로 읽히지 않는다
  const dateFormat =
    eventDate && toDate(eventDate).getFullYear() !== new Date().getFullYear()
      ? "yyyy년 M월 d일 E"
      : "M월 d일 E";
  /*
    테두리는 늘 보인다. 눌렀을 때만 생기면 없던 것이 튀어나오는 것처럼 읽히고,
    누르기 전에는 어디가 입력칸인지도 알기 어렵다. 초점에서는 색만 바뀐다.
  */
  const fieldCls =
    "rounded-lg border border-line bg-card px-2.5 focus:border-pine focus:outline-none";

  const inputCls = `${fieldCls} -mx-1 min-w-0 flex-1 py-2 text-base placeholder:text-muted/50`;

  // 한 줄짜리 칸(날짜·시각·제목)은 높이를 못박아 맞춘다 — 글씨 크기가
  // 달라(16px / 14px) padding 만으로는 몇 px 씩 어긋난다. 이 높이를 공용
  // 클래스에 넣으면 여러 줄인 "내용" 칸까지 한 줄로 눌린다.
  const rowFieldCls = "h-10 py-0";

  return (
    <>
      <div className="divide-y divide-line rounded-2xl border border-line bg-card mb-4">
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
                    setPicked(zone.id);
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

        <div ref={dateRow} className="flex items-center gap-3 px-4 py-2">
          <label htmlFor="date" className="w-14 shrink-0 text-sm text-muted">
            날짜
          </label>
          {/*
            브라우저마다 다르게 생긴 `type="date"` 대신 직접 그린 달력을 쓴다.
            폰에서는 화면을 덮는 판이 올라오고 PC 에서는 좁은 칸에 숫자를 밀어넣게
            되던 것이, 어디서나 같은 한 장짜리 달력이 된다.
          */}
          <DatePicker
            id="date"
            locale={ko}
            selected={eventDate ? toDate(eventDate) : null}
            minDate={toDate(minDate)}
            onChange={(date: Date | null) => {
              setEventDate(date ? toISO(date) : "");
              setError(null);
            }}
            /*
              고른 날은 읽으라고 있는 값이지 고쳐 쓰라고 있는 값이 아니다. 손으로
              고치게 두면 "2026년 9월"까지 지운 순간 파싱이 깨져 고른 날이 통째로
              날아간다. 칸을 눌러 달력에서만 바꾸게 한다.

              달력에서 날을 고를 때도 같은 콜백이 불리는데, 그때만 둘째 인자가 온다.
            */
            onChangeRaw={(e, fromCalendar) => {
              if (!fromCalendar) e?.preventDefault();
            }}
            // 소프트 키보드는 띄우지 않는다 — 어차피 못 적는 칸인데 화면 절반을 가린다
            customInput={<input inputMode="none" />}
            /*
              칸이 좁다 — 옆에 시각 칸이 붙어 있어 폰에서는 100px 남짓이다.
              목록 머리글과 같은 "9월 8일 화" 로 적고, 해가 넘어가는 날에만 연도를
              앞에 붙인다. 늘 붙이면 대개 뻔한 올해를 적느라 정작 요일이 잘린다.
            */
            dateFormat={dateFormat}
            // 머리글도 앱의 다른 달력과 같은 "2026년 9월" 로
            dateFormatCalendar="yyyy년 M월"
            placeholderText="고르기"
            /*
              달력이 뜨는 자리. 두 가지를 손봐야 시트 안에서 온전히 보인다.

              `fixed` — 시트 안쪽 스크롤 칸에 갇혀 있어서, 기본값(absolute)이면
              칸 아래로 잘린다. fixed 는 스크롤 칸이 아니라 시트를 기준으로 떠서
              잘리지 않고, 스크롤하면 칸을 따라 같이 움직인다.

              `popperTargetRef` — 왼쪽 끝을 날짜 칸이 아니라 **줄 전체**에 맞춘다.
              칸은 폭이 100px 남짓인데 달력은 그 두 배 반이라, 칸에 맞추면 오른쪽이
              화면 밖으로 나간다. 줄에 맞추면 카드 안에 그대로 담긴다.
            */
            popperPlacement="bottom-start"
            popperProps={{ strategy: "fixed" }}
            popperTargetRef={dateRow}
            showPopperArrow={false}
            // 칸 자체는 다른 한 줄짜리 칸과 같은 모양·높이여야 한다.
            // flex-1 은 감싸개가 받아야 늘어난다 — input 은 그 안에서 꽉 채운다.
            wrapperClassName="-mx-1 min-w-0 flex-1"
            // 커서는 감춘다 — 적을 수 없는 칸에서 깜빡이면 적으라는 뜻으로 읽힌다
            className={`${fieldCls} ${rowFieldCls} w-full caret-transparent text-base
                        placeholder:text-muted/50`}
          />

          {/*
            시각은 선택이라 날짜 옆에 딸려 둔다 — 줄을 따로 만들면 채워야 할 칸이
            하나 늘어난 것처럼 보인다.

            기본값은 "시각 없음" 이다. "하루 종일" 이라고 하면 종일 이어지는 일정처럼
            읽히는데, 실제로는 그냥 몇 시인지 안 정했다는 뜻이다.

            분은 받지 않는다 — 준비물처럼 "오전 중" 이면 되는 일이 대부분이라
            분까지 물으면 없는 정확도를 지어내게 된다.
          */}
          <select
            aria-label="시각 (선택)"
            value={eventHour ?? ""}
            onChange={(e) => setEventHour(e.target.value === "" ? null : Number(e.target.value))}
            className={`${fieldCls} ${rowFieldCls} shrink-0 pr-1 text-sm ${
              eventHour === null ? "text-muted" : "border-pine text-pine"
            }`}
          >
            <option value="">시간 선택</option>
            {EVENT_HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
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
            // 서버가 80자에서 자른다. 다 적고 저장을 눌러서야 알게 되지 않도록
            maxLength={80}
            placeholder="가을 운동회"
            // 한 줄짜리 칸끼리 높이를 맞춘다. 여러 줄인 "내용" 만 자기 높이를 갖는다.
            className={`${inputCls} ${rowFieldCls}`}
          />
        </div>

        {/*
          내용은 준비물 목록처럼 줄로 적는 일이 많아 여러 줄을 받는다.
          칸이 위로 자라므로 라벨은 가운데가 아니라 첫 줄에 맞춘다.
        */}
        <div className="flex items-start gap-3 px-4 py-2">
          <label htmlFor="content" className="w-14 shrink-0 pt-1.5 text-sm text-muted">
            내용
          </label>
          <textarea
            id="content"
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            // 서버가 200자에서 자른다. 여기서 막지 않으면 다 적고 저장을 눌러서야
            // 알게 되는데, 이 폼은 실패 이유를 한 줄로만 보여줘서 까닭이 안 보인다.
            maxLength={200}
            placeholder="흰 티셔츠, 모자"
            className={`${inputCls} resize-none`}
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
                  // 보이는 크기는 그대로 두고 누를 수 있는 자리만 넓힌다.
                  // 20px 짜리 과녁은 손가락으로 겨냥하기 어렵다 — 옆 칩을 지우게 된다.
                  className="-my-1 flex h-7 w-7 items-center justify-center rounded-full
                             text-pine/60 transition-colors hover:bg-pine/10 hover:text-pine"
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
              className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2.5 py-2 text-sm
                         focus:border-pine focus:outline-none"
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
              className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2.5 py-2 text-sm
                         focus:border-pine focus:outline-none"
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

      {/*
        시트 바닥에 붙여둔다. 폼이 짧으면 그냥 마지막에 놓이고, 길어서 시트가
        스크롤되면 따라와서 늘 손에 닿는다.

        좌우·아래로 시트의 안쪽 여백만큼 빼냈다가 이 안에서 다시 준다. 안 그러면
        버튼 옆과 아래로 남은 틈으로 스크롤되는 카드가 비쳐 지나간다.
      */}
      <div className="sticky bottom-0 -mx-4 bg-paper px-4 py-2">
        <button
          onClick={submit}
          disabled={mutation.isPending}
          className="w-full rounded-xl bg-pine py-3.5 text-base font-medium text-white disabled:opacity-60"
        >
          {mutation.isPending ? "저장하는 중" : "저장하기"}
        </button>
      </div>
    </>
  );
}
