import { dehydrate, hydrate, type Query, type QueryClient } from "@tanstack/react-query";

/**
 * 오프라인 보기 — 받아둔 일정을 이 기기에 남겨 두었다가, 연결이 없을 때 그것으로 그린다.
 *
 * **읽기 전용이다.** 연결이 없는 동안 등록·수정·삭제는 막는다(`lib/api.ts`). 오프라인에서
 * 고친 것을 모았다가 보내면, 그 사이 다른 기기나 공간 주인이 고친 것과 부딪혔을 때 어느
 * 쪽을 남길지 사람에게 물어야 한다. 지하철에서 "내일 준비물이 뭐였지" 를 보는 데는
 * 읽기만으로 충분하다.
 *
 * **남기는 것은 화면을 그리는 데 드는 것뿐이다** — 내 정보·공간·일정·달력·특일. 사용자
 * 관리 목록·푸시·구글 연결 상태는 남기지 않는다. 오프라인에서 쓸 일이 없고, 기기에
 * 오래 남을수록 새어나갈 거리만 는다.
 *
 * 로그아웃하거나 로그인이 풀리면 지운다(`lib/session.ts`). 한 기기를 여럿이 쓸 때
 * 앞사람 일정이 다음 사람 화면에 남지 않아야 한다.
 */

export const OFFLINE_CACHE_KEY = "alrimi-offline-v1";

/** 이보다 오래된 것은 버린다. 두 주 전 목록을 "지금 일정" 으로 보여주면 틀린 말이 된다 */
export const OFFLINE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const KEPT_PREFIXES = new Set([
  "me",
  "zones",
  "events",
  "event",
  "calendar",
  "special-days",
  "mark-styles",
]);

/** 남길 쿼리인가. 성공한 것만 — 실패·로딩 상태를 되살리면 오프라인 화면이 오류로 뜬다 */
export function keepQuery(query: Pick<Query, "queryKey" | "state">): boolean {
  const head = query.queryKey[0];
  return query.state.status === "success" && typeof head === "string" && KEPT_PREFIXES.has(head);
}

interface Saved {
  savedAt: number;
  state: ReturnType<typeof dehydrate>;
}

/** 브라우저 밖(테스트·서버 렌더)에서도 부를 수 있게 저장소를 받는다 */
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // 사생활 보호 모드 등에서 접근 자체가 막힐 수 있다. 그때는 오프라인 보기만 없다.
    return null;
  }
}

/** 남겨둔 것을 캐시에 되살린다. 되살렸으면 저장한 시각, 아니면 null */
export function restoreOfflineCache(
  client: QueryClient,
  storage: Storage | null = browserStorage(),
  now = Date.now(),
): number | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(OFFLINE_CACHE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    if (!saved?.state || now - saved.savedAt > OFFLINE_MAX_AGE_MS) {
      storage.removeItem(OFFLINE_CACHE_KEY);
      return null;
    }
    hydrate(client, saved.state);
    return saved.savedAt;
  } catch {
    // 모양이 바뀐 옛 저장본 등. 못 읽는 것은 버리고 새로 받는다.
    storage.removeItem(OFFLINE_CACHE_KEY);
    return null;
  }
}

/** 지금 캐시 중 남길 것을 저장한다 */
export function saveOfflineCache(
  client: QueryClient,
  storage: Storage | null = browserStorage(),
  now = Date.now(),
): void {
  if (!storage) return;
  const state = dehydrate(client, { shouldDehydrateQuery: keepQuery });
  // 받아둔 것이 없으면 쓰지 않는다 — 로그아웃 직후 빈 캐시가 앞선 저장본을 덮어쓰는 순서를 피한다
  if (state.queries.length === 0) return;
  try {
    storage.setItem(OFFLINE_CACHE_KEY, JSON.stringify({ savedAt: now, state } satisfies Saved));
  } catch {
    // 용량이 찼다. 오프라인 보기가 조금 옛것일 뿐 앱은 그대로 돈다.
  }
}

export function forgetOfflineCache(storage: Storage | null = browserStorage()): void {
  try {
    storage?.removeItem(OFFLINE_CACHE_KEY);
  } catch {
    // 접근이 막힌 저장소에는 애초에 남긴 것도 없다
  }
}

/** 남겨둔 것이 있는가. 연결 없이 앱을 열었을 때 로그인 화면 대신 오프라인 보기로 갈지 가른다 */
export function hasOfflineCache(storage: Storage | null = browserStorage(), now = Date.now()): boolean {
  try {
    const raw = storage?.getItem(OFFLINE_CACHE_KEY);
    if (!raw) return false;
    return now - (JSON.parse(raw) as Saved).savedAt <= OFFLINE_MAX_AGE_MS;
  } catch {
    return false;
  }
}

/**
 * 캐시가 바뀔 때마다 (잠깐 모았다가) 저장한다. 돌려주는 함수로 구독을 푼다.
 *
 * 쿼리 하나 받을 때마다 통째로 직렬화하면 주를 넘기며 훑는 동안 저장이 수십 번 돈다.
 */
export function persistOfflineCache(client: QueryClient, delayMs = 1000): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => saveOfflineCache(client), delayMs);
  });
  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}
