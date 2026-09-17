"use client";

import {forwardRef, useRef, useState} from "react";
import DatePicker from "react-datepicker";
import {ko} from "date-fns/locale";
import toast from "react-hot-toast";
import {
    DAY_OPTIONS,
    HOUR_OPTIONS,
    PRESETS,
    codeLabel,
    makeCode,
    sortCodes,
} from "@/lib/alerts";
import {
    MAX_SPAN_DAYS,
    addDays,
    fullLabel,
    hourLabel,
    spanDays,
    startOfDay,
    toDate,
    toISO,
} from "@/lib/date";
import {firstError} from "@/lib/api";
import {
    FREQ_LABEL,
    MAX_REPEAT_COUNT,
    WEEKDAY_NAMES,
    defaultUntil,
    latestUntil,
    repeatDates,
    serverWeekday,
} from "@/lib/repeat";
import {useCreateEvent, useUpdateEvent} from "@/hooks/useEvents";
import {onColor} from "@/lib/color";
import {useZoneMark, useZones} from "@/hooks/useZones";
import {Picker} from "./Picker";
import {ZoneMark} from "./ZoneMark";
import type {EditScope, EventDetail, RepeatFreq} from "@/types";
import {LuCalendar} from "react-icons/lu";

const pad = (n: number) => String(n).padStart(2, "0");

/** 일정 시각으로 고를 수 있는 값. 알림 시각과 달리 하루 24시간을 다 연다 */
const EVENT_HOURS = Array.from({length: 24}, (_, i) => i);

/**
 * 고른 날을 칸에 적는 방식. 옆에 시각 칸이 붙어 폰에서는 100px 남짓이라
 * 이보다 길어지면 뒤가 잘린다.
 */
const DATE_FORMAT = "yyyy-MM-dd (EEE)";

/*
  테두리는 늘 보인다. 눌렀을 때만 생기면 없던 것이 튀어나오는 것처럼 읽히고,
  누르기 전에는 어디가 입력칸인지도 알기 어렵다. 초점에서는 색만 바뀐다.
*/
const fieldCls =
    "rounded-lg border border-line bg-card px-2.5 focus:border-pine focus:outline-none";

// 한 줄짜리 칸(날짜·시각·제목)은 높이를 못박아 맞춘다 — 글씨 크기가
// 달라(16px / 14px) padding 만으로는 몇 px 씩 어긋난다. 이 높이를 공용
// 클래스에 넣으면 여러 줄인 "내용" 칸까지 한 줄로 눌린다.
const rowFieldCls = "h-10 py-0";

const inputCls = `${fieldCls} -mx-1 min-w-0 flex-1 py-2 text-base placeholder:text-muted/50`;

/*
  날짜 줄들의 세로 자. 라벨 자리와 여백을 한 벌로 두어 시작일·마지막 날 칸과 그
  아래 작은 줄이 모두 같은 선에서 시작한다.

  날짜 칸은 줄 끝까지 쓴다. 옆에 무언가를 세워두면 칸이 거기서 끊겨, 바로 아래
  제목 칸보다 짧아진 만큼이 빈자리로 남는다. 며칠간인지·되돌리기 같은 곁다리는
  칸 옆이 아니라 아래 줄로 내린다.

  꼬리(4.5rem)는 시간 칸이 열렸을 때만 쓴다 — 그때는 빈자리가 아니라 고르는 칸이
  들어차므로 끊겨 보이지 않는다. 시간 칸이 필요로 하는 폭(59px)에 맞춘 값이라,
  폭 360px 짜리 폰에서도 "2026-09-25 (금)" 이 잘리지 않는다.
*/
const dateRowCls = "flex items-center gap-3 px-4";
const labelCls = "w-14 shrink-0 text-sm text-muted";
const tailCls = "w-[4.5rem] shrink-0";

interface DateFieldProps {
    id: string;
    ariaLabel?: string;
    /** 고른 날 (YYYY-MM-DD). 아직 안 골랐으면 "" */
    value: string;
    /** 이 날보다 앞은 못 고른다 */
    min: string;
    /** 이 날보다 뒤는 못 고른다. 없으면 열어둔다 */
    max?: string;
    placeholder: string;
    onPick: (iso: string) => void;
    /** 달력을 띄울 기준이 되는 줄 */
    row: React.RefObject<HTMLDivElement | null>;
}

/**
 * 날짜 하나를 고르는 칸. 시작일과 마지막 날이 같은 것을 쓴다 — 두 칸이 다르게
 * 생기면 하나는 달력이 열리고 하나는 안 열리는 것처럼 보인다.
 *
 * 브라우저마다 다르게 생긴 `type="date"` 대신 직접 그린 달력이다. 폰에서는
 * 화면을 덮는 판이 올라오고 PC 에서는 좁은 칸에 숫자를 밀어넣게 되던 것이,
 * 어디서나 같은 한 장짜리 달력이 된다.
 */
const DateChipButton = forwardRef<HTMLButtonElement, { value?: string; onClick?: () => void }>(
    ({value, onClick}, ref) => (
        <button
            type="button"
            onClick={onClick}
            ref={ref}
            /*
              색은 옆의 제목 칸과 같은 약속을 쓴다(`fieldCls`) — 흰 바탕에 늘 보이는
              line 테두리. 한 줄에 나란히 선 칸 둘이 다른 색이면 하나는 고칠 수 있고
              하나는 아닌 것처럼 읽힌다. 누르는 자리라는 것은 색이 아니라 달력
              아이콘이 말한다.

              아직 안 골랐을 때는 다른 칸의 placeholder 와 같은 흐리기로 적는다.
              ink 로 적으면 "날짜 선택" 이 이미 고른 값처럼 보인다.

              높이는 `rowFieldCls` 로 못박는다 — 옆에 시각 칸이 열리면 둘이 한 줄에
              나란히 서는데, padding 으로만 잡으면 글씨 크기가 달라(16px / 14px)
              몇 px 씩 어긋난다. 좌우 여백도 `fieldCls` 와 같은 px-2.5 다.
            */
            className={`${rowFieldCls} flex items-center gap-1.5 text-base
                  ${value ? "text-ink" : "text-muted/50"}
                  bg-card border border-line rounded-lg px-2.5 cursor-pointer
                  sm:hover:bg-paper transition-colors w-full`}
        >
            {/* 아이콘은 곁다리라 muted 로 둔다 — 값보다 진하면 눈이 먼저 그리로 간다 */}
            <LuCalendar size={13} className="shrink-0 text-muted"/>
            {value || "날짜 선택"}
        </button>
    )
)
DateChipButton.displayName = "DateChipButton"

function DateField({id, ariaLabel, value, min, max, placeholder, onPick, row}: DateFieldProps) {
    return (
        <DatePicker
            id={id}
            ariaLabel={ariaLabel}
            locale={ko}
            selected={value ? toDate(value) : null}
            minDate={toDate(min)}
            maxDate={max ? toDate(max) : undefined}
            onChange={(date: Date | null) => onPick(date ? toISO(date) : "")}
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
            customInput={<DateChipButton />}
            dateFormat={DATE_FORMAT}
            // 머리글도 앱의 다른 달력과 같은 "2026년 9월" 로
            dateFormatCalendar="yyyy년 M월"
            placeholderText={placeholder}
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
            popperProps={{strategy: "fixed"}}
            popperTargetRef={row}
            showPopperArrow={false}
            // 칸 자체는 다른 한 줄짜리 칸과 같은 모양·높이여야 한다.
            // flex-1 은 감싸개가 받아야 늘어난다 — input 은 그 안에서 꽉 채운다.
            wrapperClassName="-mx-1 min-w-0 flex-1"
            // 커서는 감춘다 — 적을 수 없는 칸에서 깜빡이면 적으라는 뜻으로 읽힌다
            className={`${fieldCls} ${rowFieldCls} w-full caret-transparent text-base
                  placeholder:text-muted/50`}
        />
    );
}

interface Props {
    /** 있으면 수정, 없으면 등록 */
    event?: EventDetail;
    /** 달력에서 빈 날을 눌러 열었을 때 미리 채워지는 날짜 */
    initialDate?: string | null;
    /**
     * 보류함에서 "다시 잡기" 로 열었다. 같은 폼이지만 세 가지가 달라진다:
     * 날짜 칸이 비어서 열리고(다시 잡는다는 것은 곧 날을 새로 고른다는 뜻이다),
     * 지난 날은 못 고르며(옛 날짜 그대로 풀면 알림이 한 통도 안 나간다 —
     * 서버도 같은 이유로 막는다), 저장할 때 `held: false` 가 함께 간다.
     *
     * 나머지 — 제목·내용·공간·알림 시점 — 는 그대로 채워져 있다. 그것을 다시
     * 적지 않아도 되는 것이 지우는 대신 치워두는 까닭이다.
     */
    resume?: boolean;
    onDone: () => void;
}

export function EventForm({event, initialDate, resume = false, onDone}: Props) {
    const editing = Boolean(event);
    // 일정을 넣을 수 있는 공간만 — 내 공간과, 주인이 일정 추가·수정을 허락한 받은 공간
    const {writableZones: zones, defaultZone, isLoading: zonesLoading} = useZones();
    const markOf = useZoneMark();

    // 공간 목록이 아직 안 왔으면 기본 공간도 정할 수 없다. 직접 고르기 전까지는
    // 기본값을 매 렌더 다시 보게 해서, 목록이 늦게 와도 빈 채로 굳지 않게 한다.
    const [picked, setPicked] = useState<number | null>(event?.zone_id ?? null);
    const zoneId = picked ?? defaultZone?.id ?? null;
    // 다시 잡을 때는 비워서 연다. 옛 날짜가 적혀 있으면 그대로 저장을 눌렀다가
    // 서버에서 되돌려받는데, 그 칸이 왜 틀렸는지가 화면에 안 보인다.
    const [eventDate, setEventDate] = useState(
        resume ? "" : (event?.event_date ?? initialDate ?? ""),
    );
    /*
      여러 날에 걸치는 일정(여행·행사). 대부분은 하루짜리라 기본은 꺼짐이고,
      켜야 마지막 날 칸이 나온다 — 늘 두 칸을 물으면 하루짜리에도 채울 칸이
      하나 더 있는 것처럼 보인다.

      `ranged` 를 따로 두는 이유: 켜자마자는 마지막 날이 비어 있어서, `endDate`
      하나로는 "안 켰다" 와 "켰는데 아직 안 골랐다" 를 구분하지 못한다.
    */
    const [ranged, setRanged] = useState(
        Boolean(event && event.end_date > event.event_date),
    );
    const [endDate, setEndDate] = useState(
        event && !resume && event.end_date > event.event_date ? event.end_date : "",
    );
    /*
      며칠짜리였는지. 다시 잡을 때 양끝이 다 비어 있어 `spanDays` 로는 못 센다 —
      3일짜리 여행을 다시 잡는데 마지막 날까지 또 고르게 하면, 치워둔 보람이 없다.
    */
    const heldSpan = event ? spanDays(event.event_date, event.end_date) : 1;
    const [title, setTitle] = useState(event?.title ?? "");
    const [content, setContent] = useState(event?.content ?? "");
    /*
      시각은 선택이다. 기본은 아예 안 묻는다 — 대부분은 몇 시인지 정해져 있지 않고,
      빈 칸이 놓여 있으면 채워야 할 것이 하나 더 있는 것처럼 보인다. "여러 날" 과
      같이 눌러야 열린다.
    */
    const [eventHour, setEventHour] = useState<number | null>(event?.event_hour ?? null);
    const [hourOpen, setHourOpen] = useState(event?.event_hour != null);
    const [alerts, setAlerts] = useState<string[]>(
        event ? sortCodes(event.alerts.map((a) => a.code)) : PRESETS["기본으로"],
    );

    /*
      반복. 등록할 때만 고른다 — 서버가 날마다 일정을 미리 만들어 두므로 규칙을 나중에
      바꿀 수 없다(`EventSeries`). 기본은 "안 함" 이고 칸도 접혀 있다.
    */
    const [repeatFreq, setRepeatFreq] = useState<RepeatFreq | null>(null);
    const [weekdays, setWeekdays] = useState<number[]>([]);
    const [until, setUntil] = useState("");
    /*
      반복 일정을 고칠 때 어디까지 닿을지. 고를 수 있는 자리를 늘 보여준다 — 저장을
      누른 뒤 한 번 더 묻는 창을 띄우면, 그 창을 읽기 전에 손이 먼저 "확인" 을 누른다.
    */
    const [scope, setScope] = useState<EditScope>("this");
    const inSeries = editing && !resume && Boolean(event?.series_id);

    // 달력을 띄울 기준. 날짜 칸이 아니라 그 줄 전체다 — DateField 주석 참고
    const dateRow = useRef<HTMLDivElement>(null);
    const endRow = useRef<HTMLDivElement>(null);
    const untilRow = useRef<HTMLDivElement>(null);

    const [day, setDay] = useState(1);
    const [hour, setHour] = useState(20);
    /*
      시점을 직접 고르는 줄. 대부분은 미리 짜둔 묶음(준비물용·마감용)을 그대로 쓰므로
      접어둔다 — 늘 펼쳐두면 폼에서 가장 큰 자리를 가장 덜 쓰는 것이 차지한다.
      비어 있을 때만 열어둔다. 보여줄 칩이 없으니 채우는 길이 바로 보여야 한다.
    */
    const [error, setError] = useState<string | null>(null);

    /**
     * 지난 날짜로는 등록하지 못하게 한다. 알림 시각이 이미 지나 있어서
     * 저장하자마자 서버가 예약된 알림을 전부 한꺼번에 쏴버린다.
     * 이미 있는 지난 일정을 고치는 중이면 그 날짜는 그대로 둔다.
     */
    const today = toISO(startOfDay(new Date()));
    // 다시 잡는 것은 앞으로의 일이다. 옛 날짜가 지났더라도 열어주지 않는다.
    const minDate = !resume && event && event.event_date < today ? event.event_date : today;

    /*
      마지막 날은 시작일보다 앞설 수 없고, 서버가 60일에서 끊는다. 달력이 아예
      그 밖을 못 내주게 해서, 다 채우고 저장을 누른 뒤에 되돌려받지 않게 한다.
    */
    const lastPickable = eventDate
        ? toISO(addDays(toDate(eventDate), MAX_SPAN_DAYS - 1))
        : undefined;
    // 저장에 실어 보낼 값. 안 켰거나 아직 안 골랐으면 하루짜리다.
    const lastDate = ranged && endDate ? endDate : eventDate;
    const span = spanDays(eventDate, lastDate);

    // 반복이 만들 날들. 저장 전에 몇 개가 생기는지 보여주고 한도를 넘으면 미리 막는다
    const repeatPlan =
        repeatFreq && eventDate && until
            ? repeatDates(eventDate, {freq: repeatFreq, weekdays, until})
            : [];

    const create = useCreateEvent();
    const update = useUpdateEvent(event?.id ?? 0);
    const mutation = editing ? update : create;

    /**
     * 시작일을 고쳤다. 마지막 날이 그 앞으로 밀려나면 기간이 뒤집히므로 같이 민다
     * — 여기서 막고 오류를 띄우는 것보다, 고른 날을 그대로 살려 뒤를 맞추는 쪽이
     * 손이 덜 간다. 며칠짜리였는지도 그대로 지킨다.
     */
    const pickStart = (iso: string) => {
        setError(null);
        // 다시 잡을 때는 양끝이 다 비어 있어 셀 것이 없다. 치워둘 때의 길이를 쓴다.
        const keep = ranged && endDate && eventDate ? spanDays(eventDate, endDate) : resume ? heldSpan : 0;
        if (ranged && keep) {
            setEndDate(iso ? toISO(addDays(toDate(iso), keep - 1)) : "");
        }
        setEventDate(iso);
        // 매주를 고른 뒤 시작일을 바꿨는데 요일이 하나뿐이면 새 날의 요일로 따라간다.
        // 여럿을 골랐으면 일부러 고른 것이라 건드리지 않는다.
        if (repeatFreq === "weekly" && weekdays.length <= 1 && iso) {
            setWeekdays([serverWeekday(toDate(iso))]);
        }
        if (repeatFreq && iso && (!until || until < iso)) setUntil(defaultUntil(iso, repeatFreq));
    };

    const pickRepeat = (freq: RepeatFreq | null) => {
        setError(null);
        setRepeatFreq(freq);
        if (!freq) {
            setWeekdays([]);
            setUntil("");
            return;
        }
        if (freq === "weekly" && weekdays.length === 0 && eventDate) {
            setWeekdays([serverWeekday(toDate(eventDate))]);
        }
        if (eventDate) setUntil(defaultUntil(eventDate, freq));
    };

    const toggleWeekday = (day: number) => {
        setError(null);
        setWeekdays(weekdays.includes(day) ? weekdays.filter((d) => d !== day) : [...weekdays, day].sort());
    };

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
            setError(resume ? "지난 날짜로는 다시 잡을 수 없어요" : "지난 날짜로는 등록할 수 없어요");
            return;
        }
        if (ranged && !endDate) {
            setError("종료일을 골라주세요");
            return;
        }
        if (!title.trim()) {
            setError("제목을 적어주세요");
            return;
        }
        if (repeatFreq) {
            if (repeatFreq === "weekly" && weekdays.length === 0) {
                setError("반복할 요일을 골라주세요");
                return;
            }
            if (!until) {
                setError("반복이 끝나는 날을 골라주세요");
                return;
            }
            if (repeatPlan.length === 0) {
                setError("이 규칙으로는 만들어질 날이 없어요");
                return;
            }
            if (repeatPlan.length > MAX_REPEAT_COUNT) {
                setError(`한 번에 ${MAX_REPEAT_COUNT}개까지 반복할 수 있어요. 끝나는 날을 앞당겨 주세요.`);
                return;
            }
        }

        const payload = {
            zone: zoneId,
            event_date: eventDate,
            end_date: lastDate,
            // 며칠에 걸치는 일정에는 시각을 담지 않는다 — 아래 폼도 묻지 않는다
            event_hour: ranged ? null : eventHour,
            title: title.trim(),
            content: content.trim(),
            alerts,
            // 다시 잡으면 보류가 풀린다. 서버가 이 값을 보고 지난번에 나간
            // 예약까지 되살려 새 날짜로 다시 건다.
            ...(resume ? {held: false} : {}),
            ...(repeatFreq && !editing
                ? {repeat: {freq: repeatFreq, weekdays: repeatFreq === "weekly" ? weekdays : [], until}}
                : {}),
        };

        const handlers = {
            onSuccess: () => {
                // 먼 일정은 목록 화면 밖에 저장되므로 언제인지 알려준다
                toast.success(
                    resume
                        ? span > 1
                            ? `${fullLabel(eventDate)}부터 ${span}일간으로 다시 잡았어요`
                            : `${fullLabel(eventDate)}로 다시 잡았어요`
                        : editing
                        ? inSeries && scope === "following"
                            ? "이 일정과 이후 반복을 모두 수정했어요"
                            : "수정했어요"
                        : repeatFreq
                        ? `${fullLabel(eventDate)}부터 ${repeatPlan.length}번 반복해 등록했어요`
                        : span > 1
                            // 며칠짜리는 시작일만 말하면 얼마나 걸치는지가 안 보인다
                            ? `${fullLabel(eventDate)}부터 ${span}일간 등록했어요`
                            : `${fullLabel(eventDate)}에 등록했어요`,
                );
                onDone();
            },
            // 어느 칸이 틀렸는지는 서버가 말해준다. 뭉뚱그리면 고칠 자리를 못 찾는다.
            onError: (e: unknown) => setError(firstError(e, "저장하지 못했어요. 잠시 후 다시 눌러주세요.")),
        };

        if (editing) update.mutate({...payload, scope: inSeries ? scope : "this"}, handlers);
        else create.mutate(payload, handlers);
    };

    /*
      지금 걸린 목록이 어느 묶음과 똑같은지. 눌러둔 것이 드러나야 "지금 뭐가
      걸려 있더라" 를 아래 칩으로 되짚지 않는다. 직접 하나라도 더하면 어느
      묶음과도 달라지므로 표시가 저절로 꺼진다.
    */
    const chosenPreset = Object.keys(PRESETS).find(
        (name) => sortCodes(PRESETS[name]).join() === alerts.join(),
    );

    return (
        <>
            <div className="divide-y divide-line rounded-2xl border border-line bg-card mb-4">
                <div className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-14 shrink-0 text-sm text-muted">공간</span>
                    {/*
                      함께 보는 공간만 있는 사람. 거기에는 일정을 넣을 수 없으므로 빈 칩 줄 대신
                      무엇을 해야 하는지 적는다.
                    */}
                    {!zonesLoading && zones.length === 0 && (
                        <span className="text-sm text-muted">
                            내 공간이 없어요. 설정에서 공간을 먼저 만들어 주세요.
                        </span>
                    )}
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
                                    style={on ? {background: zone.color, color: onColor(zone.color)} : undefined}
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

                {/*
          날짜 한 칸. 여러 날에 걸치면 아래로 "종료" 줄이 한 줄 더 열린다.
          두 줄을 한 칸 안에 두는 것은 둘이 하나의 값(언제부터 언제까지)이라서다
          — 칸을 갈라 놓으면 사이에 줄이 그어져 서로 상관없는 값처럼 보인다.
        */}
                <div className="py-1">
                    <div ref={dateRow} className={`${dateRowCls} py-1`}>
                        {/*
                          하루짜리에는 "날짜" 하나뿐이라 시작이라고 부를 것이 없다. 기간을 켜야
                          비로소 시작과 끝이 생기므로, 그때 이름도 같이 바뀐다. 반복을 켜면
                          이 날이 반복의 첫날이 된다.
                        */}
                        <label htmlFor="date" className={labelCls}>
                            {ranged ? "시작" : repeatFreq ? "첫날" : "날짜"}
                        </label>
                        <DateField
                            id="date"
                            value={eventDate}
                            min={minDate}
                            placeholder="날짜 선택"
                            onPick={pickStart}
                            row={dateRow}
                        />

                        {/*
              몇 시인지 정한 일정만 이 칸을 갖는다. 분은 받지 않는다 — 준비물처럼
              "오전 중" 이면 되는 일이 대부분이라 분까지 물으면 없는 정확도를
              지어내게 된다.

              첫 줄이 "미정" 인 것은 되돌리는 길이기도 하다. 고르면 칸이 닫히고
              다시 "+ 시간도 정해요" 로 돌아간다 — 지우는 단추를 따로 두면 그만큼
              날짜 칸이 좁아진다.
            */}
                        {hourOpen ? (
                            <Picker
                                ariaLabel="시간 (선택)"
                                value={eventHour}
                                options={[
                                    // 첫 줄은 되돌리는 길이기도 하다. 고르면 칸이 닫히고 다시 링크로 돌아간다.
                                    {value: null, label: "미정"},
                                    ...EVENT_HOURS.map((h) => ({value: h, label: hourLabel(h)})),
                                ]}
                                onPick={(picked) => {
                                    setEventHour(picked);
                                    if (picked === null) setHourOpen(false);
                                }}
                                className={`${fieldCls} ${rowFieldCls} ${tailCls} pr-2 text-sm ${
                                    eventHour === null ? "text-muted" : "border-pine text-pine"
                                }`}
                            />
                        ) : null}
                    </div>

                    {ranged ? (
                        <>
                            <div ref={endRow} className={`${dateRowCls} py-1`}>
                                <label htmlFor="end-date" className={labelCls}>
                                    종료
                                </label>
                                <DateField
                                    id="end-date"
                                    // 시작일을 안 고른 채로 켰을 수도 있다. 그래도 오늘 앞으로는 못 간다.
                                    value={endDate}
                                    min={eventDate || minDate}
                                    max={lastPickable}
                                    placeholder="날짜 선택"
                                    onPick={(iso) => {
                                        setEndDate(iso);
                                        setError(null);
                                    }}
                                    row={endRow}
                                />
                            </div>

                            {/*
                며칠짜리인지와 되돌리는 길. 칸 옆이 아니라 아래에 둔다 — 옆에 두면
                그만큼 날짜 칸이 짧아져 위아래 칸이 다른 데서 끝난다.
                자리는 "+ 여러 날에 걸쳐요" 가 있던 그 줄 그대로다.
              */}
                            <div className={`${dateRowCls} py-1`}>
                                <span className={labelCls} aria-hidden/>
                                {/*
                  가운뎃점으로 가른다 — 그냥 띄우면 "2일간 하루로 되돌리기" 가
                  한 문장처럼 읽힌다. 목록 머리글("오늘 · 9월 8일 화")과 같은 표시다.
                */}
                                <div className="flex min-w-0 items-center gap-2 pl-1.5 text-xs text-muted">
                                    {/* 25일부터 27일까지가 3일인지 4일인지는 손가락으로 꼽아봐야 안다 */}
                                    {endDate && (
                                        <>
                                            <span className="tabular-nums">{span}일간</span>
                                            <span aria-hidden className="text-muted/40">
                        ·
                      </span>
                                        </>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setRanged(false);
                                            setEndDate("");
                                            setError(null);
                                        }}
                                        className="shrink-0 transition-colors hover:text-pine"
                                    >
                                        하루로 되돌리기
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : repeatFreq ? (
                        /*
                          반복. 여러 날과 **함께 켜지 않는다** — 셋 중 하나다: 하루, 여러 날, 반복.
                          둘을 같이 두면 "종료" 와 "마지막" 두 개의 끝나는 날이 한 칸 안에 서서
                          어느 것이 무엇의 끝인지 읽을 수 없다.

                          그래서 날짜 칸이 "첫날" 이 되고, 규칙과 마지막 날이 같은 칸 안에서 이어진다.
                          등록할 때만 열린다 — 규칙은 만든 뒤에 바꾸지 못한다(서버 `EventSeries`).
                        */
                        <>
                            {/*
                              라벨(14px)과 고르는 글자(12px)는 크기가 달라 위를 맞추면 글자가 뜬다.
                              둘 다 날짜 칸과 같은 40px 줄에 세워 가운데를 맞춘다. 요일 줄이 열리면
                              그 아래로 자라므로 줄 전체는 위에 붙인다.
                            */}
                            <div className="flex items-start gap-3 px-4 py-1">
                                <span className={`${labelCls} leading-10`}>반복</span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex min-h-10 flex-wrap items-center gap-x-4 pl-1.5 text-xs text-muted">
                                        {(["daily", "weekly", "monthly", "yearly"] as const).map((freq) => (
                                            <button
                                                key={freq}
                                                type="button"
                                                aria-pressed={repeatFreq === freq}
                                                onClick={() => pickRepeat(freq)}
                                                className={`shrink-0 transition-colors hover:text-pine ${
                                                    repeatFreq === freq ? "font-medium text-pine" : ""
                                                }`}
                                            >
                                                {FREQ_LABEL[freq]}
                                            </button>
                                        ))}
                                    </div>

                                    {repeatFreq === "weekly" && (
                                        <div className="mb-1 flex gap-1 pl-1.5" role="group" aria-label="반복할 요일">
                                            {WEEKDAY_NAMES.map((name, day) => {
                                                const on = weekdays.includes(day);
                                                return (
                                                    <button
                                                        key={name}
                                                        type="button"
                                                        aria-pressed={on}
                                                        onClick={() => toggleWeekday(day)}
                                                        className={`h-8 w-8 shrink-0 rounded-full text-xs transition-colors ${
                                                            on
                                                                ? "bg-pine font-medium text-white"
                                                                : "border border-line text-muted hover:border-pine/50"
                                                        }`}
                                                    >
                                                        {name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div ref={untilRow} className={`${dateRowCls} py-1`}>
                                <label htmlFor="repeat-until" className={labelCls}>
                                    마지막
                                </label>
                                <DateField
                                    id="repeat-until"
                                    value={until}
                                    min={eventDate || minDate}
                                    max={eventDate ? latestUntil(eventDate) : undefined}
                                    placeholder="날짜 선택"
                                    onPick={(iso) => {
                                        setUntil(iso);
                                        setError(null);
                                    }}
                                    row={untilRow}
                                />
                            </div>

                            {/*
                              몇 개가 만들어지는지와 되돌리는 길. 여러 날의 "3일간 · 하루로 되돌리기" 와
                              같은 자리, 같은 모양이다.
                            */}
                            <div className={`${dateRowCls} py-1`}>
                                <span className={labelCls} aria-hidden/>
                                <div className="flex min-w-0 flex-wrap items-center gap-x-2 pl-1.5 text-xs text-muted">
                                    <span
                                        className={`tabular-nums ${
                                            repeatPlan.length > MAX_REPEAT_COUNT || (eventDate && until && repeatPlan.length === 0)
                                                ? "text-red-600"
                                                : ""
                                        }`}
                                    >
                                        {!eventDate || !until
                                            ? "첫날과 마지막 날을 고르세요"
                                            : repeatPlan.length > MAX_REPEAT_COUNT
                                            ? `${MAX_REPEAT_COUNT}개를 넘어요`
                                            : repeatPlan.length === 0
                                            ? "만들어질 날이 없어요"
                                            : `일정 ${repeatPlan.length}개`}
                                    </span>
                                    <span aria-hidden className="text-muted/40">·</span>
                                    <button
                                        type="button"
                                        onClick={() => pickRepeat(null)}
                                        className="shrink-0 transition-colors hover:text-pine"
                                    >
                                        반복 안 함
                                    </button>
                                    {!hourOpen && (
                                        <>
                                            <span aria-hidden className="text-muted/40">·</span>
                                            <button
                                                type="button"
                                                onClick={() => setHourOpen(true)}
                                                className="shrink-0 transition-colors hover:text-pine"
                                            >
                                                + 시간도 정해요
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        /*
                          날짜에 딸린 선택지(여러 날·시간·반복)는 평소엔 이 한 줄로만 있다가,
                          눌러야 칸이 열린다. 대부분의 일정은 하루짜리이고 몇 시인지도 정해져
                          있지 않아서, 빈 칸을 미리 놓아두면 채울 것이 더 있어 보인다.

                          위 줄들과 같은 자를 쓴다: 라벨 자리를 비워 두고 글자를 날짜 칸의
                          **글자**와 같은 자리에서 시작한다(칸이 -mx-1 만큼 왼쪽으로 나가 있어
                          그 안쪽 여백만큼인 6px 을 준다). 자리를 눈대중으로 잡으면 이 한 줄만
                          반 글자씩 어긋나 보인다.
                        */
                        <div className={`${dateRowCls} py-1`}>
                            <span className={labelCls} aria-hidden/>
                            <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 pl-1.5 text-xs text-muted">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRanged(true);
                                        // 하루 뒤를 미리 채운다. 켠 순간 "1일간" 이라고 적혀 있으면
                                        // 무엇을 켠 것인지 되묻게 된다.
                                        setEndDate(eventDate ? toISO(addDays(toDate(eventDate), 1)) : "");
                                        // 며칠에 걸치는 일정에 "14시" 는 어느 날의 14시인지 말하지
                                        // 못한다. 기간을 켜면 시각은 접어두고 값도 비운다.
                                        setHourOpen(false);
                                        setEventHour(null);
                                        setError(null);
                                    }}
                                    className="shrink-0 transition-colors hover:text-pine"
                                >
                                    + 여러 날에 걸쳐요
                                </button>

                                {!hourOpen && (
                                    <button
                                        type="button"
                                        onClick={() => setHourOpen(true)}
                                        className="shrink-0 transition-colors hover:text-pine"
                                    >
                                        + 시간도 정해요
                                    </button>
                                )}

                                {/* 반복은 등록할 때만. 대부분 매주라 켜면 매주로 열린다 */}
                                {!editing && (
                                    <button
                                        type="button"
                                        onClick={() => pickRepeat("weekly")}
                                        className="shrink-0 transition-colors hover:text-pine"
                                    >
                                        + 반복해요
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
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

                {/*
          알림은 값(고른 시점)이 여럿이라 칸 하나로는 안 담기지만, 그렇다고 다른
          줄들과 다른 자를 쓸 이유는 없다. 라벨 자리는 그대로 두고 오른쪽 칸 안에
          칩·고르는 줄·안내를 쌓는다 — 위 줄들과 같은 선에서 시작한다.
        */}
                <div className={`${dateRowCls} items-start py-2.5`}>
                    <span className={`${labelCls} pt-0.5`}>언제</span>

                    <div className="min-w-0 flex-1">
                        {/*
                          고르는 것이 위, 고른 결과가 아래다. 묶음 → 직접 고르기 →
                          쌓인 시점 순으로 읽히면, 대부분은 첫 줄에서 한 번 누르고 끝난다.
                        */}
                        <div className="flex flex-wrap items-center gap-4 pl-1.5 text-xs text-muted">
                            {Object.keys(PRESETS).map((name) => (
                                <button
                                    key={name}
                                    type="button"
                                    // 무엇으로 바뀌는지는 눌러보기 전에도 알 수 있어야 한다
                                    title={sortCodes(PRESETS[name]).map(codeLabel).join(" · ")}
                                    aria-pressed={name === chosenPreset}
                                    onClick={() => {
                                        setAlerts(sortCodes(PRESETS[name]));
                                        setError(null);
                                    }}
                                    className={`shrink-0 transition-colors hover:text-pine ${
                                        name === chosenPreset ? "font-medium text-pine" : ""
                                    }`}
                                >
                                    {name}
                                </button>
                            ))}
                        </div>

                        {/*
                          직접 고르는 줄. 접어두지 않는다 — 묶음이 안 맞는 사람은 여기서
                          바로 더하면 되고, 접혀 있으면 그런 길이 있다는 것부터 찾아야 한다.
                        */}
                        <div className="mt-2 flex gap-1.5">
                            <Picker
                                ariaLabel="며칠 전"
                                value={day}
                                options={DAY_OPTIONS}
                                onPick={setDay}
                                className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2.5 py-2
                                           text-sm focus:border-pine focus:outline-none"
                            />

                            <Picker
                                ariaLabel="알림 시간"
                                value={hour}
                                options={HOUR_OPTIONS.map((h) => ({value: h, label: `${pad(h)}:00`}))}
                                onPick={setHour}
                                className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2.5 py-2
                                           text-sm focus:border-pine focus:outline-none"
                            />

                            <button
                                type="button"
                                onClick={addAlert}
                                className="shrink-0 rounded-lg border border-pine px-3.5 py-2 text-sm
                                           font-medium text-pine"
                            >
                                추가
                            </button>
                        </div>

                        {/* 위에서 고른 결과. 여기 있는 것이 실제로 나갈 알림이다 */}
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {alerts.length === 0 ? (
                                <span className="py-1 text-sm text-muted/70">
                                    알림 없이 저장돼요 — 필요하면 위에서 고르세요
                                </span>
                            ) : (
                                alerts.map((code) => (
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
                                ))
                            )}
                        </div>

                        {/*
                          며칠짜리면 어느 날에서 세는지가 헷갈린다. 마지막 날 기준으로 읽으면
                          "1일 전" 이 돌아오기 전날이 되어, 짐 싸라는 알림이 여행이 끝날 때 온다.
                        */}
                        {span > 1 && (
                            <p className="mt-2 pl-1.5 text-xs text-muted">
                                시점은 시작하는 날에서 셉니다 — &ldquo;1일 전&rdquo;은 떠나기 전날이에요.
                            </p>
                        )}

                        {editing && (
                            <p className="mt-2 pl-1.5 text-xs text-muted">
                                이미 발송된 알림은 그대로 유지됩니다.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/*
              반복 일정을 고칠 때 어디까지 닿을지. 저장 바로 위라 누르기 전에 눈에 든다.
              완료·보류는 여기서 고르지 않는다 — 그 날 한 번의 일이라 늘 이 일정만이다.
            */}
            {inSeries && (
                <div className="mt-2 rounded-2xl border border-line bg-card px-4 py-3">
                    <p className="text-xs text-muted">반복 일정이에요. 어디까지 고칠까요?</p>
                    <div className="mt-2 flex gap-2" role="radiogroup" aria-label="고칠 범위">
                        {([
                            ["this", "이 일정만"],
                            ["following", "이 일정과 이후 모두"],
                        ] as const).map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={scope === value}
                                onClick={() => setScope(value)}
                                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                                    scope === value
                                        ? "border-pine bg-pinelt font-medium text-pine"
                                        : "border-line text-muted hover:border-pine/50"
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

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
                    {mutation.isPending ? "저장하는 중" : resume ? "다시 잡기" : "저장하기"}
                </button>
            </div>
        </>
    );
}
