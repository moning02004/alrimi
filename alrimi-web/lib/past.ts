import type { EventListItem } from "@/types";

/**
 * 서버가 지난 일정을 한 번에 이만큼쯤 준다(api `notices.views.PAST_PAGE`). 날 하나는 쪼개지
 * 않으므로 넘칠 수는 있어도, 더 남았는데 이보다 적게 오지는 않는다.
 */
export const PAST_PAGE = 100;

/**
 * 다음 쪽을 부를 기준(`?before=`). 받은 것 중 마지막 날이다 — 서버가 날 하나를 두 쪽에
 * 나누지 않으므로 그 날 앞부터 받으면 빠짐도 겹침도 없다. 한 쪽에 못 미치게 왔으면 끝이다.
 */
export function nextPastBefore(page: Pick<EventListItem, "event_date">[]): string | undefined {
  return page.length >= PAST_PAGE ? page[page.length - 1].event_date : undefined;
}
