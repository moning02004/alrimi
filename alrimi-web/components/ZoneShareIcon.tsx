import { LuUsers } from "react-icons/lu";

/**
 * 공간 이름 옆에 서는 작은 표시 — 이 공간을 다른 사람과 함께 본다.
 *
 * **내가 보여주는 공간과 받은 공간이 같은 그림이다.** 받은 공간도 딱지와 이름을 내 공간과
 * 똑같이 그리기로 했고(`useZoneMark`), 고르는 자리에서 알아야 하는 것은 "여기 적으면 다른
 * 사람도 본다" 까지다. 누가 누구에게 보여주는지는 내 정보에서 본다.
 *
 * 공간을 고르는 자리(필터 목록·등록 폼·공간 바꾸기)에만 둔다. 일정 카드에는 두지 않는다.
 */
export function ZoneShareIcon({ received, shared }: { received: boolean; shared: boolean }) {
  if (!received && !shared) return null;
  return (
    <LuUsers className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="함께 보는 공간" role="img" />
  );
}
