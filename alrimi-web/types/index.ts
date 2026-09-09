export type Priority = 2 | 4 | 5;

export interface Zone {
  id: number;
  name: string;
  color: string;
  upcoming_count: number;
  past_count: number;
}

export interface AlertSummary {
  total: number;
  sent: number;
}

/** "" 예약 · "sent" 발송됨 · "fail" 발송 실패 */
export type AlertStatus = "" | "sent" | "fail";

export interface AlertItem {
  id: number;
  code: string;
  due_at: string;
  status: AlertStatus;
  sent_at: string | null;
}

export interface EventListItem {
  id: number;
  /** 시작하는 날. 알림 시점(D-1 …)도 이 날을 기준으로 잰다 */
  event_date: string;
  /** 마지막 날. 하루짜리는 `event_date` 와 같은 값이라 늘 채워져 온다 */
  end_date: string;
  /** 몇 시 일인지(0~23). 선택이라 비어 있을 수 있고, 그때는 "하루 종일" 이다 */
  event_hour: number | null;
  title: string;
  priority: Priority;
  /** 완료 표시한 시각. 목록에서는 빠지고 하루 보기에만 흐리게 남는다 */
  completed_at: string | null;
  zone_id: number;
  zone_color: string;
  alerts: AlertSummary;
}

export interface EventDetail extends Omit<EventListItem, "alerts"> {
  content: string;
  zone_name: string;
  alerts: AlertItem[];
}

export interface EventPayload {
  zone: number;
  event_date: string;
  /** 하루짜리면 `event_date` 와 같은 값을 보낸다 */
  end_date: string;
  event_hour: number | null;
  title: string;
  content: string;
  priority: Priority;
  alerts: string[];
  /** 상세 화면의 완료 토글만 쓴다. 등록/수정 폼은 보내지 않는다 */
  completed?: boolean;
}

/**
 * 달력이 띠 하나를 그리는 데 필요한 최소한. 본문(내용·알림·우선순위)은 안 온다 —
 * 주를 넘길 때마다 목록을 통째로 다시 받지 않으려는 것이다.
 *
 * **양끝이 그대로 온다.** 날마다 잘라 받으면 사흘짜리 여행이 하루짜리 셋과
 * 구별되지 않아 띠로 이을 수 없다. 창 밖까지 뻗은 것도 자르지 않고 오고,
 * 창에 맞춰 자르는 일은 그리는 쪽이 한다.
 */
export interface CalendarEvent {
  id: number;
  /** 색만으로는 색약에서 어느 공간인지 못 읽어 id 도 함께 온다 */
  zone: number;
  color: string;
  event_date: string;
  end_date: string;
  /** 띠에 붙는 이름. 스크린리더가 "일정 1건" 대신 이것을 읽는다 */
  title: string;
  /**
   * 여기 실려 오는 완료 일정은 늘 지난 것이다(앞으로의 것은 서버가 뺀다).
   * 그냥 지나간 것과 치운 것을 달력이 다르게 그리려면 이 값이 있어야 한다.
   */
  completed: boolean;
}

export interface Me {
  username: string;
  name: string | null;
  ntfy_topic: string;
  /** 누르면 ntfy 앱이 열리면서 구독까지 되는 링크. 조립은 서버가 한다 */
  ntfy_subscribe_url: string | null;
  /** 같은 링크의 QR (data URI). 앱이 안 열리는 자리에서 폰으로 넘길 때 쓴다 */
  ntfy_subscribe_qr: string | null;
  version: string;
}
