/**
 * 기다리는 동안 보여주는 것.
 *
 * 빈 화면을 그대로 두면 고장과 구분되지 않는다 — 특히 인증 부트스트랩처럼
 * 네트워크 왕복이 끼는 자리는 회선이 느리면 몇 초씩 하얗게 남는다.
 */

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`${className} animate-spin rounded-full border-2 border-line border-t-pine`}
    />
  );
}

/** 화면 한가운데. 아직 아무것도 그릴 수 없을 때 쓴다 */
export function LoadingScreen({ label = "불러오는 중" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="app-shell flex w-full flex-col items-center justify-center gap-3"
    >
      <Spinner className="h-6 w-6" />
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

/**
 * 못 불러왔을 때. 빈 상태와 반드시 구분해야 한다 — "일정이 없다"와 "못 가져왔다"는
 * 같은 빈 화면이지만, 앞은 넘어가도 되고 뒤는 다시 눌러야 한다.
 */
export function ErrorBlock({
  label = "불러오지 못했어요",
  onRetry,
}: {
  label?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2.5 py-10">
      <p className="text-sm text-red-600">{label}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs text-muted
                     transition-colors hover:border-pine hover:text-pine"
        >
          다시 시도
        </button>
      )}
    </div>
  );
}

/** 화면 틀은 이미 있고 그 안 한 구역만 기다릴 때 */
export function LoadingBlock({ label = "불러오는 중" }: { label?: string }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 py-10 text-sm text-muted"
    >
      <Spinner />
      {label}
    </p>
  );
}
