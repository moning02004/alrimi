import type { AlertSummary } from "@/types";

/**
 * 점 개수 = 알림 개수. 발송(초록)이 앞, 아직 안 나간 것(회색)이 뒤다.
 *
 * 실패한 알림은 초록으로 세지 않는다. 카드에서는 회색에 섞이고,
 * 무엇이 실패했는지는 상세 화면이 "발송 실패"로 알려준다.
 */
/**
 * 카드 한 줄에 들어갈 수 있는 개수. 넘으면 점을 더 찍지 않고 "+n" 으로 접는다 —
 * 알림을 열 개 넣은 일정이 제목을 밀어내면 목록을 훑을 수 없다.
 */
const MAX_DOTS = 5;

export function AlertDots({ alerts }: { alerts: AlertSummary }) {
  const { total, sent } = alerts;
  const pending = Math.max(total - sent, 0);

  const all = [
    ...Array(sent).fill("bg-pine"),
    ...Array(pending).fill("bg-line"),
  ];
  const dots = all.slice(0, MAX_DOTS);
  const hidden = all.length - dots.length;

  if (all.length === 0) return null;

  return (
    <span
      className="flex shrink-0 items-center gap-1"
      aria-label={`알림 ${total}개 중 ${sent}개 발송`}
    >
      {dots.map((cls, i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${cls}`} />
      ))}
      {hidden > 0 && <span className="text-[10px] leading-none text-muted">+{hidden}</span>}
    </span>
  );
}
