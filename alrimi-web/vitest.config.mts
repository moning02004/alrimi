import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * `@/...` 를 풀어주기 위한 최소 설정.
 *
 * 여태 없어도 됐던 것은 테스트가 쓰던 `@/` 가 전부 타입 import 였기 때문이다 —
 * 타입은 컴파일에서 지워져서 실행할 때 찾을 일이 없다. 값을 가져오는 모듈
 * (`lib/api.ts` 는 `@/constants/routeUrl` 을 쓴다)을 테스트하는 순간 필요해진다.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
