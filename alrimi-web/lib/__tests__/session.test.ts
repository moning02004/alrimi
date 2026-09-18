import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { clearOnLogout } from "../session";
import { useAuthStore } from "@/store/auth";
import { useZoneStore } from "@/store/zone";

/*
  새로고침 없이 로그아웃 → 다른 사람으로 로그인하면, 캐시에 남은 앞사람의 내 정보가
  먼저 그려져 설정에 앞사람 이름이 보였다. 토큰이 사라지는 순간 캐시를 비운다.
*/
describe("clearOnLogout — 로그인이 풀리면 앞사람 것을 버린다", () => {
  let client: QueryClient;
  let stop: () => void;

  beforeEach(() => {
    client = new QueryClient();
    useAuthStore.setState({ token: "a-token" });
    useZoneStore.setState({ hiddenZoneIds: [3] });
    client.setQueryData(["me"], { username: "앞사람" });
    stop = clearOnLogout(client);
  });

  afterEach(() => {
    stop();
    useAuthStore.setState({ token: null });
  });

  it("로그아웃하면 받아둔 내 정보와 고른 공간이 사라진다", () => {
    useAuthStore.getState().clear();

    expect(client.getQueryData(["me"])).toBeUndefined();
    expect(useZoneStore.getState().hiddenZoneIds).toEqual([]);
  });

  it("토큰이 새것으로 바뀌는 것은 같은 사람이라 그대로 둔다", () => {
    // 재발급·비밀번호 변경
    useAuthStore.getState().setToken("b-token");

    expect(client.getQueryData(["me"])).toEqual({ username: "앞사람" });
    expect(useZoneStore.getState().hiddenZoneIds).toEqual([3]);
  });

  it("처음 로그인하는 것(없던 토큰이 생기는 것)으로는 비우지 않는다", () => {
    useAuthStore.setState({ token: null });
    client.setQueryData(["me"], { username: "받은 것" });

    useAuthStore.getState().setToken("c-token");

    expect(client.getQueryData(["me"])).toEqual({ username: "받은 것" });
  });
});

describe("clearOnLogout — 오프라인 보기에서 풀려도 비운다", () => {
  it("연결이 돌아와 로그인이 거절되면 남겨둔 것까지 버린다", () => {
    const client = new QueryClient();
    useAuthStore.setState({ token: null, offline: true });
    client.setQueryData(["me"], { username: "앞사람" });
    const stop = clearOnLogout(client);

    useAuthStore.getState().clear();

    expect(client.getQueryData(["me"])).toBeUndefined();
    stop();
  });
});
