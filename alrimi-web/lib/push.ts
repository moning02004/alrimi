/**
 * 웹 푸시 — 브라우저 쪽 손잡이.
 *
 * 세 가지가 각각 따로 논다. 하나로 뭉뚱그리면 "왜 안 되는지" 를 말할 수 없다.
 *
 * 1. **지원 여부** — 브라우저에 푸시 기능이 있는가. iOS 는 홈 화면에 추가한
 *    뒤에만 생긴다(사파리 탭에서는 아예 없다).
 * 2. **권한** — 사람이 허용했는가. 거절은 우리가 되돌릴 수 없고, 브라우저 설정에서
 *    풀어야 한다.
 * 3. **구독** — 이 기기가 실제로 등록돼 있는가. 권한만 있고 구독이 없을 수 있다
 *    (다른 기기에서 켰거나, 브라우저가 구독을 갈아치웠을 때).
 */

/** 이 브라우저가 웹 푸시를 할 수 있는가. iOS 사파리 탭에서는 false 다. */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * iOS 에서 홈 화면에 추가하지 않은 상태인가.
 *
 * 같은 "지원 안 함" 이라도 이쪽은 사람이 할 수 있는 일이 있다 — 공유 버튼에서
 * "홈 화면에 추가" 를 하면 된다. 그 말을 못 하면 아이폰 사용자에게는 이 기능이
 * 그냥 고장으로 보인다.
 */
export function iosNeedsInstall(): boolean {
  if (typeof window === "undefined" || pushSupported()) return false;

  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  // 이미 홈 화면에서 연 것이면 다른 까닭으로 못 쓰는 것이다(너무 옛 iOS 등)
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  return isIos && !standalone;
}

/**
 * 서버가 준 공개키(base64url)를 브라우저가 받는 바이트 배열로 바꾼다.
 *
 * `applicationServerKey` 는 Uint8Array 만 받는다. base64url 은 표준 base64 와
 * 두 글자(-_ ↔ +/)가 다르고 패딩도 빠져 있어서, `atob` 에 그대로 넣으면 깨진다.
 */
function decodeKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), "=");
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));

  // `Uint8Array.from` 이 아니라 버퍼를 먼저 만든다. from 이 주는 타입은 공유 버퍼일
  // 수도 있는 것으로 잡혀서(Uint8Array<ArrayBufferLike>) applicationServerKey 가 받지 않는다.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * 서비스 워커를 등록하고 준비될 때까지 기다린다.
 *
 * `register` 가 끝나도 아직 활성 워커가 아닐 수 있다 — 그 상태에서 구독을 만들면
 * 실패한다. `ready` 가 활성된 등록을 준다.
 */
export async function ensureWorker(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

/** 이 기기가 지금 들고 있는 구독. 없으면 null. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/**
 * 권한을 묻고 구독을 만든다. 이미 있으면 그것을 그대로 쓴다.
 *
 * 이미 있는 구독을 지우고 새로 만들지 않는 이유: 브라우저는 같은 공개키에 대해
 * 같은 구독을 돌려주고, 지웠다 만들면 그 사이에 오는 알림이 갈 곳을 잃는다.
 */
export async function subscribe(publicKey: string): Promise<PushSubscription> {
  const registration = await ensureWorker();

  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  return registration.pushManager.subscribe({
    // false 는 못 쓴다. 크롬은 "본문 없는 조용한 푸시" 를 막아뒀다.
    userVisibleOnly: true,
    applicationServerKey: decodeKey(publicKey),
  });
}
