import { API_HOST, apiUrl } from "@/constants/routeUrl";
import { useAuthStore } from "@/store/auth";

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail?: unknown,
  ) {
    super(`API ${status}`);
  }
}

/** 서버가 어느 칸이 틀렸는지 말해주므로 그대로 보여준다 */
export function firstError(error: unknown, fallback: string) {
  const detail = error instanceof ApiError ? (error.detail as Record<string, unknown>) : undefined;
  for (const value of Object.values(detail ?? {})) {
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    if (typeof value === "string") return value;
  }
  return fallback;
}

/** 오프라인에서 고치려 할 때. 폼들이 `firstError` 로 이 말을 그대로 보여준다 */
export const OFFLINE_MESSAGE = "오프라인이라 저장하지 않았어요. 연결되면 다시 해주세요.";

/** 지금 연결이 없는가. 브라우저가 모르면(서버 렌더 등) 연결된 것으로 본다 */
export const isOffline = () =>
  useAuthStore.getState().offline || (typeof navigator !== "undefined" && navigator.onLine === false);

/** 동시에 401이 여러 개 떠도 재발급은 한 번만 나가도록 진행 중 요청을 공유 */
let refreshing: Promise<string | null | "unreachable"> | null = null;

/** 새 access 토큰. 거절당하면 null, 서버에 닿지 못했으면 "unreachable" */
async function refreshAccessToken(): Promise<string | null | "unreachable"> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(API_HOST + apiUrl.refreshToken, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { access_token: string };
        useAuthStore.getState().setToken(data.access_token);
        return data.access_token;
      } catch {
        // 닿지 못한 것은 거절이 아니다. 여기서 로그아웃시키면 지하철에서 앱이 로그인 화면으로 튄다.
        return "unreachable";
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  skipAuth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, skipAuth, headers, ...rest } = options;
  const method = (rest.method ?? "GET").toUpperCase();

  /*
    오프라인은 읽기 전용이다(`lib/offlineCache.ts`). 고치는 요청은 보내지 않고 바로
    돌려준다 — 모아뒀다가 나중에 보내면 그 사이 바뀐 것과 부딪힌다.

    오프라인 보기 중(토큰 없음)에는 읽기도 보내지 않는다. 토큰 없이 나간 요청이 401 을
    받으면 아래에서 로그인이 풀린 것으로 처리된다.
  */
  if (method !== "GET" && isOffline()) {
    throw new ApiError(0, { detail: OFFLINE_MESSAGE });
  }
  if (useAuthStore.getState().offline && !skipAuth) {
    throw new ApiError(0, { detail: OFFLINE_MESSAGE });
  }

  const send = (token: string | null) =>
    fetch(API_HOST + path, {
      ...rest,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  const token = skipAuth ? null : useAuthStore.getState().token;
  let res = await send(token);

  // 만료가 화면에 드러나지 않도록 재발급 후 원래 요청을 그대로 재시도
  if (res.status === 401 && !skipAuth) {
    const next = await refreshAccessToken();
    if (next === "unreachable") throw new ApiError(0, { detail: OFFLINE_MESSAGE });
    if (!next) {
      useAuthStore.getState().clear();
      throw new ApiError(401);
    }
    res = await send(next);
  }

  if (!res.ok) {
    throw new ApiError(res.status, await res.json().catch(() => undefined));
  }
  /*
    본문이 비어 있을 수 있다 — 204 만이 아니다. 201 로 "만들었다" 만 답하는 자리도
    있고(웹 푸시 구독 등록), 그때 `res.json()` 은 빈 문자열을 파싱하다 터진다.
    부르는 쪽에서는 그것이 "요청이 실패했다" 로 보여서, 실제로는 성공한 일을
    실패로 그리게 된다.
  */
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  // 지울 것을 본문으로 짚는 자리가 있다(웹 푸시 구독은 endpoint 로 가리킨다).
  // 경로에 담지 않는 이유는 그 값이 URL 이라 인코딩해도 로그·기록에 그대로 남기 때문이다.
  delete: <T>(path: string, body?: unknown) => request<T>(path, { method: "DELETE", body }),
};
