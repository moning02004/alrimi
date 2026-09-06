type Variant = "calendar" | "bell" | "dots" | "clock";

interface Props {
  /** 아이콘 모양. 바꾸고 싶으면 이 값만 교체한다 */
  variant?: Variant;
  /** 바깥 사각형 한 변 (px) */
  size?: number;
  className?: string;
}

/**
 * 앱 마크. pine 배경 + 흰 선.
 * calendar 변형의 점 2개+빈 1개는 목록 카드의 발송 점과 같은 표기다.
 */
export function Logo({ variant = "calendar", size = 44, className = "" }: Props) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-pine ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label="일정 알리미"
    >
      <svg
        viewBox="0 0 40 40"
        width={size * 0.62}
        height={size * 0.62}
        fill="none"
        stroke="currentColor"
        className="text-white"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {variant === "calendar" && (
          <>
            <rect x="5" y="8" width="30" height="27" rx="5" />
            <path d="M5 17h30M13 4v6M27 4v6" />
            <circle cx="14" cy="26" r="2.4" fill="currentColor" stroke="none" />
            <circle cx="20" cy="26" r="2.4" fill="currentColor" stroke="none" />
            <circle cx="26" cy="26" r="2.2" strokeWidth={1.6} />
          </>
        )}

        {variant === "bell" && (
          <>
            <path d="M20 7a10 10 0 0 1 10 10v9H10v-9A10 10 0 0 1 20 7z" />
            <path d="M20 4v3M7 26h26M16 31a4.2 4.2 0 0 0 8 0" />
          </>
        )}

        {variant === "dots" && (
          <>
            <circle cx="9" cy="20" r="4.6" fill="currentColor" stroke="none" />
            <circle cx="20" cy="20" r="4.6" fill="currentColor" stroke="none" />
            <circle cx="31" cy="20" r="4.6" />
          </>
        )}

        {variant === "clock" && (
          <>
            <circle cx="18" cy="22" r="13" />
            <path d="M18 14v8h6" />
            <circle cx="31" cy="9" r="5" fill="currentColor" stroke="none" />
          </>
        )}
      </svg>
    </span>
  );
}
