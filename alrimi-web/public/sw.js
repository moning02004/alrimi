/*
  서비스 워커 — 웹 푸시를 받아 알림으로 띄운다.

  이 파일만 앱과 따로 산다. 탭이 다 닫혀 있어도 브라우저가 이것만 깨워 실행하므로,
  React 도 상태 저장소도 여기서는 쓸 수 없고 `window` 조차 없다. 서버가 보낸
  JSON(`notices/webpush.py` 의 _payload)을 읽어 알림 하나를 띄우는 일만 한다.

  **빌드를 타지 않는다.** public/ 에 있는 그대로 /sw.js 로 나가므로 트랜스파일이
  없다 — 여기에는 TypeScript 도 최신 문법도 넣지 않는다.

  고칠 때 주의: 브라우저는 이 파일을 바이트 단위로 비교해 바뀌었을 때만 새로
  설치한다. 그래서 한 글자만 고쳐도 다음 방문에 갱신되지만, 이미 떠 있는 탭은
  옛 워커를 그대로 쓴다(`skipWaiting`).
*/

// 새 워커를 기다리게 두지 않는다. 알림 문구나 동작을 고쳤을 때 사람들이 모든 탭을
// 닫을 때까지 옛 워커가 남아 있으면, 고친 것이 언제 반영되는지 알 수 없다.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", function (event) {
  // 본문 없는 푸시도 규격상 올 수 있다(구독을 되살릴 때 등). 그때는 조용히 넘긴다 —
  // 빈 알림을 띄우면 받는 쪽은 고장으로 읽는다.
  if (!event.data) return;

  var payload;
  try {
    payload = event.data.json();
  } catch (e) {
    return;
  }

  var title = payload.title || "일정 알리미";
  var options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    // 안드로이드 상태 표시줄의 작은 단색 아이콘. 없으면 브라우저 로고가 뜬다.
    badge: "/icon-192.png",
    // 같은 이름의 알림은 쌓이지 않고 덮인다. 크론이 한 번 걸러 따라잡느라 같은
    // 묶음을 다시 보내는 일이 있어서 필요하다.
    tag: payload.tag || "alrimi",
    // 덮어쓸 때 소리·진동을 다시 내지 않는다. 같은 내용으로 두 번 울리면
    // 새 일이 생긴 것으로 읽힌다.
    renotify: false,
    // 긴급(5)은 손으로 치울 때까지 남긴다. 잠깐 떴다 사라지면 못 본 채 지나간다.
    requireInteraction: payload.priority === 5,
    data: { url: payload.url || "/" },
  };

  // waitUntil 없이 두면 알림을 띄우기 전에 워커가 잠들 수 있다.
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  var target = (event.notification.data && event.notification.data.url) || "/";

  /*
    이미 열려 있는 탭이 있으면 그것을 앞으로 가져온다. 누를 때마다 새 탭을 열면
    알림 다섯 개를 확인한 뒤 같은 앱이 다섯 번 떠 있다.
  */
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var client = list[i];
        // 같은 출처의 창이면 어느 화면이든 그것을 쓴다 — 알림을 눌렀다고 보던
        // 화면을 빼앗지 않는다.
        if (client.url.indexOf(self.registration.scope) === 0 && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    }),
  );
});
