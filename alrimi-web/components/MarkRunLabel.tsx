"use client";

import { DIM, type MarkRun } from "@/lib/marks";

/** 선의 옅기. 이름보다 먼저 읽히면 안 된다 — 덩이의 폭을 보여주는 곁다리다 */
const RULE_OPACITY = 0.35;

interface Props {
  run: MarkRun;
  /** 마우스 설명. 겹친 날의 나머지 이름까지 담는다 */
  title: string;
  /** 덩이가 온통 흐릴 자리(이 달 밖·지난 날)에 있는가. 판단은 부르는 쪽이 한다 */
  dim: boolean;
  /** 글자 크기. 달력마다 칸 폭이 달라 부르는 쪽이 정한다 */
  textCls: string;
}

/**
 * 특일 이름 한 덩이. 월간 그리드와 주간 스트립이 같은 것을 쓴다.
 *
 * **여러 날짜리는 이름 뒤로 가는 선을 하나 긋는다.** 추석 사흘의 가운데에 "추석"
 * 만 적어두면 세 칸 너비의 빈자리에 글자 하나가 떠 있어서, 그것이 사흘을 묶은
 * 이름인지 가운데 날 하나의 이름인지 알 수 없다. 선이 덩이의 양끝을 보여준다.
 *
 * 선의 양끝은 **칸 폭의 1/4 씩 들어온다** — 대략 첫 날 숫자의 왼쪽 끝에서 마지막
 * 날 숫자의 오른쪽 끝까지다. 칸 끝까지 그으면 옆 날까지 연휴에 든 것처럼 보이고,
 * 숫자 한가운데서 끊으면 이틀짜리는 선이 이름 폭보다 짧아져 양옆에 점만 남는다.
 * 주를 넘어 이어지는 쪽만 칸 끝까지 긋는다 — 일정 띠가 이어지는 쪽 끝을 각지게
 * 두는 것과 같은 말이다(`CalendarBands`).
 *
 * **선은 글자 뒤에 깔고, 글자가 바탕색으로 제 자리만큼 가린다.** 선을 글자 양옆에
 * 따로 세우면 좁은 칸(폰에서 두 칸이 90px 남짓)에서 선이 글자 자리를 먹어 이름이
 * "공…" 으로 잘린다. 뒤에 깔면 글자는 덩이 폭을 온전히 쓰고, 남는 자리에만 선이
 * 보인다. 가리는 색이 `bg-card` 라 두 달력 모두 카드 바탕 위에 놓여야 한다.
 *
 * 일정 띠와 헷갈리지 않게 **1px 짜리 옅은 선**이다. 띠는 4px 짜리 꽉 찬 막대라,
 * 같은 모양이면 연휴가 누군가의 일정처럼 읽힌다.
 */
export function MarkRunLabel({ run, title, dim, textCls }: Props) {
  const multi = run.span > 1;
  // 퍼센트 위치는 이 덩이의 폭을 기준으로 잰다. 칸 하나의 1/4 이다.
  const inset = `${25 / run.span}%`;

  return (
    <span
      title={title}
      style={{
        gridColumn: `${run.col + 1} / span ${run.span}`,
        color: run.mark.color,
        opacity: dim ? DIM : 1,
      }}
      className={`relative flex min-w-0 justify-center ${textCls}`}
    >
      {multi && (
        <span
          aria-hidden="true"
          className="absolute top-1/2 h-px -translate-y-1/2"
          style={{
            left: run.clippedStart ? 0 : inset,
            right: run.clippedEnd ? 0 : inset,
            background: "currentColor",
            opacity: RULE_OPACITY,
          }}
        />
      )}
      <span
        className={`relative min-w-0 truncate font-medium leading-tight ${
          multi ? "bg-card px-1" : "px-0.5"
        }`}
      >
        {run.mark.name}
      </span>
    </span>
  );
}
