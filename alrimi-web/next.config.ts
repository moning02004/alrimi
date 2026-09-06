import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 운영 이미지를 위해 `.next/standalone` 을 만든다.
   *
   * 빌드가 실제로 쓰는 파일만 추려서 최소한의 `node_modules` 와 함께 담고,
   * `next start` 대신 쓸 `server.js` 를 함께 내놓는다. 그래서 운영 이미지에는
   * 소스도 devDependencies 도 넣지 않는다.
   *
   * `public` 과 `.next/static` 은 따로 복사해야 한다 — 원래 CDN 이 맡는 자리라
   * standalone 에 안 들어온다. Dockerfile 이 그 두 줄을 한다.
   */
  output: "standalone",
};

export default nextConfig;
