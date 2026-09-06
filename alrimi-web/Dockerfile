# 세 갈래다.
#
#   dev     — 개발 서버(`next dev`). 소스는 굽지 않고 compose 가 물려준다.
#   builder — `next build`. 운영 이미지가 여기서 결과물만 가져간다.
#   prod    — standalone 결과물만 담은 운영 이미지 (기본값)
#
# 기본값이 prod 인 것은, 태그 없이 빌드해 그대로 띄웠을 때 개발 서버가
# 떠 있는 상황을 만들지 않기 위해서다.

FROM node:22-alpine AS deps
WORKDIR /app
# 잠금 파일 그대로. 소스보다 먼저 복사해야 소스만 바뀔 때 캐시가 산다.
COPY package.json package-lock.json ./
RUN npm ci

# ── 개발 ──────────────────────────────────────────────────────────────
# 소스를 COPY 하지 않는다. compose 가 호스트 디렉터리를 그대로 물려주고,
# node_modules 는 이미지 것을 쓰도록 익명 볼륨으로 가려둔다(호스트의 것은
# darwin 바이너리라 리눅스 컨테이너에서 안 돈다).
FROM deps AS dev
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ── 빌드 ──────────────────────────────────────────────────────────────
FROM deps AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
# NEXT_PUBLIC_* 은 빌드 때 번들에 박힌다. 런타임 환경변수로는 바뀌지 않으므로
# 운영 주소를 여기서 넣어야 한다.
ARG NEXT_PUBLIC_API_HOST=http://localhost:8000
ENV NEXT_PUBLIC_API_HOST=$NEXT_PUBLIC_API_HOST
RUN npm run build

# ── 운영 ──────────────────────────────────────────────────────────────
# next.config.ts 의 output: "standalone" 이 만든 것만 담는다. 소스도,
# devDependencies 도, npm 도 필요 없다 — `node server.js` 하나로 돈다.
FROM node:22-alpine AS prod
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# 루트로 돌리지 않는다. node 이미지에 이미 있는 계정을 쓴다.
USER node

# standalone 은 `public` 과 `.next/static` 을 안 챙긴다 — 원래 CDN 이 맡는
# 자리라서다. 앞에 CDN 없이 서비스하므로 둘 다 넣어 server.js 가 직접 내주게 한다.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
