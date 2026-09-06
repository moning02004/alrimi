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

/** 동시에 401이 여러 개 떠도 재발급은 한 번만 나가도록 진행 중 요청을 공유 */
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
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
        return null;
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
    if (!next) {
      useAuthStore.getState().clear();
      throw new ApiError(401);
    }
    res = await send(next);
  }

  if (!res.ok) {
    throw new ApiError(res.status, await res.json().catch(() => undefined));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
