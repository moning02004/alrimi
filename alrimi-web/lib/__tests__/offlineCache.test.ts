import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  OFFLINE_CACHE_KEY,
  OFFLINE_MAX_AGE_MS,
  forgetOfflineCache,
  hasOfflineCache,
  restoreOfflineCache,
  saveOfflineCache,
} from "../offlineCache";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    map,
  };
}

describe("오프라인 보기 — 받아둔 일정을 기기에 남긴다", () => {
  it("화면에 드는 것만 남기고 되살린다", () => {
    const storage = memoryStorage();
    const before = new QueryClient();
    before.setQueryData(["events", "range", "2026-09-13", "2026-09-19", null], [{ id: 1 }]);
    before.setQueryData(["zones"], [{ id: 3 }]);
    // 사용자 관리 목록·구글 연결 상태는 오프라인에서 쓸 일이 없다
    before.setQueryData(["users"], [{ id: 9 }]);
    before.setQueryData(["google-calendar"], { connected: true });

    saveOfflineCache(before, storage, 1_000);

    const after = new QueryClient();
    expect(restoreOfflineCache(after, storage, 2_000)).toBe(1_000);
    expect(after.getQueryData(["events", "range", "2026-09-13", "2026-09-19", null])).toEqual([{ id: 1 }]);
    expect(after.getQueryData(["zones"])).toEqual([{ id: 3 }]);
    expect(after.getQueryData(["users"])).toBeUndefined();
    expect(after.getQueryData(["google-calendar"])).toBeUndefined();
  });

  it("두 주가 지난 것은 버린다", () => {
    const storage = memoryStorage();
    const client = new QueryClient();
    client.setQueryData(["zones"], []);
    saveOfflineCache(client, storage, 0);

    expect(hasOfflineCache(storage, OFFLINE_MAX_AGE_MS + 1)).toBe(false);
    expect(restoreOfflineCache(new QueryClient(), storage, OFFLINE_MAX_AGE_MS + 1)).toBeNull();
    expect(storage.map.has(OFFLINE_CACHE_KEY)).toBe(false);
  });

  it("빈 캐시로는 앞선 저장본을 덮지 않는다", () => {
    const storage = memoryStorage();
    const client = new QueryClient();
    client.setQueryData(["zones"], [{ id: 3 }]);
    saveOfflineCache(client, storage, 0);

    saveOfflineCache(new QueryClient(), storage, 10);

    expect(hasOfflineCache(storage, 20)).toBe(true);
  });

  it("못 읽는 저장본은 지우고 넘어간다", () => {
    const storage = memoryStorage();
    storage.setItem(OFFLINE_CACHE_KEY, "{not json");

    expect(restoreOfflineCache(new QueryClient(), storage)).toBeNull();
    expect(storage.map.has(OFFLINE_CACHE_KEY)).toBe(false);
  });

  it("지우면 남은 것이 없다", () => {
    const storage = memoryStorage();
    const client = new QueryClient();
    client.setQueryData(["me"], { username: "mom" });
    saveOfflineCache(client, storage, 0);

    forgetOfflineCache(storage);

    expect(hasOfflineCache(storage, 0)).toBe(false);
  });
});
