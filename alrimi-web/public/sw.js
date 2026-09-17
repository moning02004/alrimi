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

/*
  ── 오프라인 보기: 앱 껍데기 ─────────────────────────────────────────────

  연결이 없어도 앱이 열리게 HTML·JS·CSS·아이콘을 받아둔다. **일정 자료는 여기서 받아두지
  않는다** — 그것은 앱이 기기에 남긴다(`lib/offlineCache.ts`). API 는 다른 주소에 있고
  로그인 토큰을 실어 보내므로, 워커가 응답을 주소로만 쌓아두면 한 기기를 쓰는 다음
  사람에게 앞사람 일정이 그대로 나간다.

  - `/_next/static/…` 은 파일 이름에 내용 해시가 붙어 바뀌지 않는다 → 받아둔 것부터 쓴다.
  - 화면(HTML)은 늘 새로 받고, 못 받을 때만 받아둔 것을 쓴다. 새 배포를 옛 화면으로
    가리지 않기 위해서다.
  - 한 번도 연 적 없는 화면(예: 처음 보는 일정 상세)은 받아둔 것이 없다. 그때는 홈으로
    가는 안내 한 장을 준다.

  **localhost 에서는 아무것도 받아두지 않는다.** 개발 서버의 번들은 해시 없이 저장할
  때마다 바뀌어서, 붙잡고 있으면 고친 것이 화면에 안 나온다. (알림을 시험하느라 개발
  중에도 이 워커가 등록될 수 있다.)
*/
var SHELL_CACHE = "alrimi-shell-v1";
var CACHING = self.location.hostname !== "localhost" && self.location.hostname !== "127.0.0.1";

// 글꼴 CSS 는 다른 주소(jsDelivr)에서 온다. 이것까지 받아둬야 오프라인에서도 글꼴이 같다.
var FONT_HOST = "cdn.jsdelivr.net";

function isShellAsset(url) {
  if (url.origin === self.location.origin) {
    return (
      url.pathname.indexOf("/_next/static/") === 0 ||
      /\.(png|svg|ico|json|woff2?)$/.test(url.pathname)
    );
  }
  return url.hostname === FONT_HOST;
}

function offlinePage() {
  var html =
    '<!doctype html><html lang="ko"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<title>오프라인 · 일정 알리미</title>" +
    '<body style="font-family:system-ui,sans-serif;background:#f2f4f3;color:#16283c;' +
    'display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px">' +
    '<div style="max-width:320px;text-align:center">' +
    '<p style="font-weight:600;margin:0 0 8px">오프라인이라 이 화면을 열 수 없어요</p>' +
    '<p style="font-size:14px;color:#6b7b87;margin:0 0 16px">받아둔 일정은 홈에서 볼 수 있어요.</p>' +
    '<a href="/home" style="color:#2f7a63">홈으로</a></div></body></html>';
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (!CACHING || request.method !== "GET") return;

  var url = new URL(request.url);

  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          if (response.ok) {
            var copy = response.clone();
            // 같은 화면은 쿼리(?event=3)가 달라도 한 장만 둔다
            caches.open(SHELL_CACHE).then(function (cache) {
              cache.put(url.origin + url.pathname, copy);
            });
          }
          return response;
        })
        .catch(function () {
          return caches.match(url.origin + url.pathname).then(function (cached) {
            return cached || offlinePage();
          });
        }),
    );
    return;
  }

  if (isShellAsset(url)) {
    event.respondWith(
      caches.match(request).then(function (cached) {
        if (cached) return cached;
        return fetch(request).then(function (response) {
          // 다른 주소의 no-cors 응답은 ok 를 읽을 수 없다(opaque). 그것도 받아둔다.
          if (response.ok || response.type === "opaque") {
            var copy = response.clone();
            caches.open(SHELL_CACHE).then(function (cache) {
              cache.put(request, copy);
            });
          }
          return response;
        });
      }),
    );
  }
});

// 새 워커를 기다리게 두지 않는다. 알림 문구나 동작을 고쳤을 때 사람들이 모든 탭을
// 닫을 때까지 옛 워커가 남아 있으면, 고친 것이 언제 반영되는지 알 수 없다.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    // 이름이 바뀐 옛 껍데기는 지운다. 배포마다 해시가 바뀌어 옛 파일이 쌓이기만 한다.
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.indexOf("alrimi-shell-") === 0 && name !== SHELL_CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);

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
    /*
      안드로이드 상태 표시줄의 작은 단색 아이콘. 없으면 브라우저 로고가 뜬다.

      **앱 아이콘을 쓰면 안 된다.** 안드로이드는 여기서 알파 채널만 가져다 쓰고 색은
      전부 버린 뒤, 불투명한 자리를 시스템 색으로 칠한다. icon-192.png 는 초록으로
      꽉 차 있어서(95% 불투명) 모양 없는 흰 덩어리가 되고, 밝은 상태 표시줄에서는
      그대로 묻힌다. badge-96.png 는 선만 불투명한 별도 파일이다(public/badge.svg).

      데스크톱 Chrome 과 iOS 는 이 값을 아예 무시한다 — 안드로이드에서만 보인다.
    */
    badge: "/badge-96.png",
    // 같은 이름의 알림은 쌓이지 않고 덮인다. 크론이 한 번 걸러 따라잡느라 같은
    // 묶음을 다시 보내는 일이 있어서 필요하다.
    tag: payload.tag || "alrimi",
    // 덮어쓸 때 소리·진동을 다시 내지 않는다. 같은 내용으로 두 번 울리면
    // 새 일이 생긴 것으로 읽힌다.
    renotify: false,
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
        /*
          같은 출처의 창이면 새로 열지 않고 그 창을 알림이 가리키는 화면으로 옮긴다.
          앞으로 가져오기만 하면 보던 화면이 그대로라, 알림 내용을 보려고 누른 사람이
          다시 찾아가야 한다.

          `navigate` 는 이 워커가 제어하는 창에서만 된다(설치 직후의 창은 아닐 수 있다).
          안 되면 앞으로 가져오는 것까지만 한다.
        */
        if (client.url.indexOf(self.registration.scope) === 0 && "focus" in client) {
          return client.focus().then(function (focused) {
            var win = focused || client;
            if (win.url === new URL(target, self.location.origin).href) return win;
            if ("navigate" in win) {
              return win.navigate(target).catch(function () {
                return win;
              });
            }
            return win;
          });
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    }),
  );
});
