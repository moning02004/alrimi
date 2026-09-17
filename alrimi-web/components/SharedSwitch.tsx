"use client";

/** 설정 한 줄짜리 스위치 — 이름, 설명, 켜고 끄기 */
export function SwitchRow({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-pine" : "bg-line"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            on ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

/**
 * 공간의 "함께 보기" 와 그 아래 "함께 보는 사람도 일정 추가·수정". 만들 때와 고칠 때 같은 것을
 * 쓴다 — 두 곳이 다르게 생기면 같은 설정인지 알 수 없다.
 *
 * 둘째 스위치는 함께 보기를 켰을 때만 선다. 꺼진 공간에서는 볼 사람이 없어 뜻이 없다.
 */
export function SharedSwitch({
  on,
  onToggle,
  canEdit,
  onToggleEdit,
}: {
  on: boolean;
  onToggle: () => void;
  canEdit: boolean;
  onToggleEdit: () => void;
}) {
  return (
    <div className="divide-y divide-line">
      <SwitchRow
        label="함께 보기"
        hint="함께 보는 사람들도 이 공간의 일정을 보고 알림을 받아요."
        on={on}
        onToggle={onToggle}
      />
      {on && (
        <SwitchRow
          label="함께 보는 사람도 일정 추가·수정"
          hint={
            canEdit
              ? "함께 보는 사람도 일정을 만들고 고치고 지울 수 있어요. 공간 설정은 나만 바꿔요."
              : "지금은 나만 일정을 만들고 고쳐요."
          }
          on={canEdit}
          onToggle={onToggleEdit}
        />
      )}
    </div>
  );
}
