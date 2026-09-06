export const API_HOST = process.env.NEXT_PUBLIC_API_HOST ?? "http://localhost:8000";

export type NoticeFilter = "upcoming" | "later" | "past";

const withZone = (path: string, zoneId: number | null) =>
  zoneId ? `${path}&zone=${zoneId}` : path;

/** DRF 쪽은 APPEND_SLASH = False — 끝에 슬래시 붙이지 않음 */
export const apiUrl = {
  obtainToken: "/auth/obtain-token",
  refreshToken: "/auth/refresh-token",
  revokeToken: "/auth/token",

  me: "/users/me",
  changePassword: "/users/me/password",

  zones: "/zones",
  palette: "/zones/palette",
  zone: (zoneId: number) => `/zones/${zoneId}`,

  // 존은 선택 필터일 뿐, 목록의 축은 날짜다
  notices: (filter: NoticeFilter, zoneId: number | null) =>
    withZone(`/notices?filter=${filter}`, zoneId),
  // 주간 스트립이 그린 기간만. 그 밖은 ‹ › 로 넘겨서 본다
  noticesInRange: (from: string, to: string, zoneId: number | null) =>
    withZone(`/notices?from=${from}&to=${to}`, zoneId),
  // 달력을 펼쳤을 때 선택한 하루만
  noticesByDate: (date: string, zoneId: number | null) =>
    withZone(`/notices?date=${date}`, zoneId),
  createNotice: "/notices",
  notice: (noticeId: number) => `/notices/${noticeId}`,
  // 발송 단위는 Alert 하나다. 상세 화면의 "보내기" 가 쓴다
  sendAlert: (noticeId: number, alertId: number) =>
    `/notices/${noticeId}/alerts/${alertId}/send`,

  calendar: (from: string, to: string, zoneId: number | null) =>
    withZone(`/calendar?from=${from}&to=${to}`, zoneId),
} as const;

export const pageUrl = {
  login: "/login",
  home: "/home",
  settings: "/settings",
  notice: (noticeId: number) => `/notices/${noticeId}`,
} as const;
