import type { ZoneScope } from "@/types";

export const API_HOST = process.env.NEXT_PUBLIC_API_HOST ?? "http://localhost:8000";

export type EventFilter = "upcoming" | "later" | "past" | "held";

/** 켜둔 공간들을 쿼리로. 전부(null)면 조건을 안 보낸다 — 나중에 늘어난 공간도 함께 보인다 */
const withZone = (path: string, scope: ZoneScope) =>
  scope === null ? path : `${path}&zones=${scope.join(",")}`;

/** DRF 쪽은 APPEND_SLASH = False — 끝에 슬래시 붙이지 않음 */
export const apiUrl = {
  obtainToken: "/auth/obtain-token",
  refreshToken: "/auth/refresh-token",
  revokeToken: "/auth/token",

  me: "/users/me",
  changePassword: "/users/me/password",
  // 사용자 관리. 추가는 관리자부터, 권한 변경·삭제는 최고 관리자만
  users: "/users",
  user: (userId: number) => `/users/${userId}`,
  // 알림장을 함께 볼 사람 찾기. 로그인한 누구나 부른다
  userSearch: (q: string) => `/users/search?q=${encodeURIComponent(q)}`,

  // 웹 푸시. 구독은 계정이 아니라 기기마다 하나라 users/ 아래가 아니다
  pushKey: "/push/key",
  pushSubscriptions: "/push/subscriptions",
  pushTest: "/push/test",

  // 구글 캘린더. 알리미 → 구글 한쪽으로만 옮겨 담는다
  googleCalendar: "/google/calendar",
  googleCalendarConnect: "/google/calendar/connect",
  googleCalendarSync: "/google/calendar/sync",

  zones: "/zones",
  palette: "/zones/palette",
  zone: (zoneId: number) => `/zones/${zoneId}`,
  // 이 공간의 알림 끄기(POST)·다시 받기(DELETE). 받는 사람마다 따로다
  zoneMute: (zoneId: number) => `/zones/${zoneId}/mute`,
  // 함께 보는 사람. 사람마다 한 번 정하고, 공간은 `shared` 로 켜고 끈다
  sharing: "/sharing",
  sharingPerson: (userId: number) => `/sharing/${userId}`,
  // 나에게 공간을 보여주는 사람들. 그만 볼 수도 있다
  sharingReceived: "/sharing/received",
  sharingReceivedPerson: (ownerId: number) => `/sharing/received/${ownerId}`,

  // 존은 선택 필터일 뿐, 목록의 축은 날짜다
  events: (filter: EventFilter, scope: ZoneScope) =>
    withZone(`/events?filter=${filter}`, scope),
  // 주간 스트립이 그린 기간만. 그 밖은 ‹ › 로 넘겨서 본다
  eventsInRange: (from: string, to: string, scope: ZoneScope) =>
    withZone(`/events?from=${from}&to=${to}`, scope),
  // 달력을 펼쳤을 때 선택한 하루만
  eventsByDate: (date: string, scope: ZoneScope) =>
    withZone(`/events?date=${date}`, scope),
  // 제목·내용 검색. 날짜 창 없이 앞으로의 것 → 지난 것 순으로 온다
  searchEvents: (q: string, scope: ZoneScope) =>
    withZone(`/events?q=${encodeURIComponent(q)}`, scope),
  createEvent: "/events",
  event: (eventId: number) => `/events/${eventId}`,
  // 반복 일정을 "이후 모두" 고치거나 지울 때
  eventScoped: (eventId: number, scope: "this" | "following") =>
    scope === "this" ? `/events/${eventId}` : `/events/${eventId}?scope=${scope}`,
  // 여럿을 한 요청으로 지운다. 전부 지워지거나 하나도 안 지워진다
  bulkDeleteEvents: "/events/bulk-delete",
  // 발송 단위는 Alert 하나다. 상세 화면의 "보내기" 가 쓴다
  sendAlert: (eventId: number, alertId: number) =>
    `/events/${eventId}/alerts/${alertId}/send`,

  calendar: (from: string, to: string, scope: ZoneScope) =>
    withZone(`/calendar?from=${from}&to=${to}`, scope),

  // 특일(공휴일·절기·기념일)은 공간과 상관없다 — 모두가 같은 날을 본다. ?zone= 도 없다.
  specialDays: (from: string, to: string) => `/special-days?from=${from}&to=${to}`,
  // 종류별 색·표시 여부. 사람마다 다르다
  markStyles: "/special-days/styles",
  markStyle: (kind: string) => `/special-days/styles/${kind}`,
  // 고를 수 있는 색. 공간 팔레트와 따로다 — 그쪽은 칩 배경, 이쪽은 흰 바탕의 글자
  markPalette: "/special-days/palette",
} as const;

export const pageUrl = {
  // 소개. 로그인 없이 열린다 — 설치한 앱은 /home 으로 열려 이 화면을 지나치지 않는다
  intro: "/",
  login: "/login",
  home: "/home",
  past: "/past",
  settings: "/settings",
  // 설정 안쪽 화면
  settingsSharing: "/settings/sharing",
  settingsUsers: "/settings/users",
  search: "/search",
  // 로그인 없이 열린다. 구글 OAuth 동의 화면에 이 주소를 적는다
  privacy: "/privacy",
  event: (eventId: number) => `/events/${eventId}`,
} as const;
