import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";

/**
 * 응답 본문을 읽는 규칙.
 *
 * 여기가 틀리면 **성공한 요청이 실패로 보인다** — 실제로 그랬다. 웹 푸시 구독
 * 등록은 201 을 본문 없이 돌려주는데, 204 만 빈 응답으로 치던 시절에는 그 뒤
 * `res.json()` 이 빈 문자열을 파싱하다 터졌다. 구독은 이미 만들어진 뒤라, 화면만
 * "안 켜졌다" 로 되돌아가고 새로고침하면 켜져 있었다.
 */
const respond = (status: number, body: string, headers: Record<string, string> = {}) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body || null, { status, headers }));

afterEach(() => vi.restoreAllMocks());

describe("응답 본문", () => {
  it("본문 없는 201 은 성공이다", async () => {
    respond(201, "");
    await expect(api.post("/push/subscriptions", { endpoint: "https://x" })).resolves.toBeUndefined();
  });

  it("204 도 그대로 성공이다", async () => {
    respond(204, "");
    await expect(api.delete("/push/subscriptions")).resolves.toBeUndefined();
  });

  it("본문이 있으면 파싱해서 준다", async () => {
    respond(200, JSON.stringify({ delivered: 2 }), { "content-type": "application/json" });
    await expect(api.post("/push/test")).resolves.toEqual({ delivered: 2 });
  });

  it("실패는 본문이 비어 있어도 상태 코드로 던진다", async () => {
    respond(502, "");
    await expect(api.post("/push/test")).rejects.toMatchObject({ status: 502 });
  });
});
