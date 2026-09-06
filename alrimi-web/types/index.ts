export type Priority = 2 | 3 | 5;

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

export interface NoticeListItem {
  id: number;
  event_date: string;
  title: string;
  priority: Priority;
  /** 완료 표시한 시각. 목록에서는 빠지고 하루 보기에만 흐리게 남는다 */
  completed_at: string | null;
  zone_id: number;
  zone_color: string;
  alerts: AlertSummary;
}

export interface NoticeDetail extends Omit<NoticeListItem, "alerts"> {
  content: string;
  zone_name: string;
  alerts: AlertItem[];
}

export interface NoticePayload {
  zone: number;
  event_date: string;
  title: string;
  content: string;
  priority: Priority;
  alerts: string[];
  /** 상세 화면의 완료 토글만 쓴다. 등록/수정 폼은 보내지 않는다 */
  completed?: boolean;
}

/** 그 날 일정이 있는 공간 하나. 색만으로는 색약에서 못 읽어 id 도 함께 온다 */
export interface CalendarZone {
  zone: number;
  color: string;
}

/** 날짜 → 그 날 일정이 있는 공간들 */
export type CalendarMap = Record<string, CalendarZone[]>;

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
