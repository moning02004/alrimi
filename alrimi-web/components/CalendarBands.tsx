"use client";

import { toneOf, type RowLayout, type Tone } from "@/lib/calendar";
import { spanDays, startOfDay, toISO } from "@/lib/date";
import type { CalendarEvent } from "@/types";

/** 띠 하나의 높이와 줄 사이 틈(px). 칸이 좁아 여기서 몇 px 이 바로 티가 난다 */
const BAND = 4;
const GAP = 2;

interface Props {
  /** 이 줄이 덮는 7일 */
  days: Date[];
  layout: RowLayout;
  /**
   * 띠 줄을 이만큼 자리잡아 둔다. 달력 전체에서 가장 많이 쓴 줄 수를 넣으면 주마다
   * 높이가 같아진다 — 주마다 들쭉날쭉하면 달을 넘길 때 그리드가 통째로 출렁인다.
   */
  lanes: number;
}

/**
 * 달력 한 줄 아래에 깔리는 표시.
 *
 * **위는 띠, 아래는 점 한 줄.** 며칠에 걸치는 일정만 칸 경계를 넘어가는 막대로
 * 그리고, 하루짜리는 예전처럼 점으로 나란히 찍는다. 하루짜리까지 층으로 쌓으면
 * 칸이 잘게 나뉘어 무엇이 이어지는 일인지가 도로 안 보인다.
 *
 * 줄 밖으로 이어지는 쪽(주가 바뀌거나 보고 있는 창을 넘어가는 쪽)은 끝을 각지게
 * 두고 여백도 지운다 — 둥근 끝은 "여기서 끝난다"는 말이라, 다음 줄로 이어지는
 * 여행에 붙이면 매주 새 일정이 시작하는 것처럼 읽힌다.
 *
 * 누르는 자리는 여기가 아니다. 달력의 탭 과녁은 이 위에 투명하게 덮인 날짜
 * 버튼이라, 이 칸은 통째로 `pointer-events-none` 이다.
 */
export function CalendarBands({ days, layout, lanes }: Props) {
  const { bands, dots, hidden } = layout;
  const today = toISO(startOfDay(new Date()));

  return (
    <div className="pointer-events-none" aria-hidden="true">
      {lanes > 0 && (
        <div
          className="grid grid-cols-7"
          style={{ gridTemplateRows: `repeat(${lanes}, ${BAND}px)`, rowGap: GAP }}
        >
          {bands.map(({ event, col, span, clippedStart, clippedEnd, lane }) => {
            const round = `${BAND}px`;
            const tone = toneOf(event, today);

            return (
              <span
                key={`${event.id}-${toISO(days[col])}`}
                title={label(event)}
                style={{
                  gridColumn: `${col + 1} / span ${span}`,
                  gridRow: lane + 1,
                  ...paint(event, tone),
                  // 이어지는 쪽은 여백 없이 칸 끝까지 — 옆 칸의 띠와 맞붙어 하나로 읽힌다
                  marginLeft: clippedStart ? 0 : 2,
                  marginRight: clippedEnd ? 0 : 2,
                  borderTopLeftRadius: clippedStart ? 0 : round,
                  borderBottomLeftRadius: clippedStart ? 0 : round,
                  borderTopRightRadius: clippedEnd ? 0 : round,
                  borderBottomRightRadius: clippedEnd ? 0 : round,
                }}
              />
            );
          })}
        </div>
      )}

      {/*
        점 줄은 비어 있어도 자리를 지킨다. 일정이 없는 날만 높이가 줄면 그 주만
        위로 딸려 올라가 그리드가 어긋난다.
      */}
      <div className={`grid grid-cols-7 ${lanes > 0 ? "mt-[3px]" : ""}`}>
        {days.map((day) => {
          const iso = toISO(day);
          const more = hidden[iso] ?? 0;

          return (
            <span key={iso} className="flex h-2 items-center justify-center gap-[3px]">
              {(dots[iso] ?? []).map((event) => (
                <span
                  key={event.id}
                  title={label(event)}
                  className="h-1 w-1 rounded-full"
                  style={paint(event, toneOf(event, today))}
                />
              ))}
              {more > 0 && (
                <span className="text-[9px] leading-none text-muted/70">+{more}</span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 지난 것은 흐리게, 완료한 것은 색을 잃는다.
 *
 * 둘을 같은 흐림으로 그리면 "아직 안 치웠는데 지나간 것"이 눈에 안 든다 —
 * 지난 주를 되짚는 이유가 대개 그것이다. 목록 카드는 완료를 취소선으로 말하지만
 * 달력에는 글자가 없어서, 공간 색을 내려놓는 것이 여기서 할 수 있는 같은 말이다.
 *
 * 흐림은 둘 다 같은 값이고 **차이는 색기(色氣)뿐**이다. 흐림의 정도로 나누면
 * 4px 짜리 점에서 둘을 가려낼 수 없다 — 색이 남았는가 아닌가는 그 크기에서도
 * 보인다.
 */
const DIMMED = 0.4;

function paint(event: CalendarEvent, tone: Tone) {
  if (tone === "done") return { background: "var(--color-muted)", opacity: DIMMED };
  return { background: event.color, opacity: tone === "past" ? DIMMED : 1 };
}

/** 마우스를 올렸을 때. 며칠짜리면 그것도 말해준다 */
function label(event: CalendarEvent) {
  const span = spanDays(event.event_date, event.end_date);
  return span > 1 ? `${event.title} · ${span}일` : event.title;
}
