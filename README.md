# 일정 알리미

어린이집·학교 안내문 같은 "언제까지 뭘 챙겨야 하는" 일정을 넣어두면 때가 됐을 때
알림을 보내주는 앱. 백엔드는 `alrimi-api`(Django + DRF), 프런트는 `alrimi-web`(Next.js).

알림은 **웹 푸시**로 먼저 가고, 켜둔 기기에 한 대도 못 닿았을 때만 **ntfy** 가 뒤를
받는다 — 둘을 함께 보내면 같은 알림을 폰에서 두 번 받는다
(`alrimi-api/README.md` 의 "두 길, 그리고 순서").

## 실행

```bash
cp alrimi-api/.env.example alrimi-api/.env.local   # 값 채우기 (없으면 뜨지 않는다)
docker compose up --build
```

| | 주소 | |
| --- | --- | --- |
| web | http://localhost:3000 | Next.js 개발 서버 |
| api | http://localhost:8000 | Django + postgres |
| db | localhost:5432 | postgres 17 · `pgdata` 볼륨에 남는다 |

**앞뒤 모두 저장하면 바로 반영된다.** 소스를 컨테이너에 물려주고 각자의 리로더가
다시 읽는다 — 프런트는 `next dev`, 백엔드는 `runserver` 의 StatReloader.

계정은 회원가입이 없다. 처음이면 데모 계정을 만든다.

```bash
docker compose exec api python manage.py seed_demo   # demo / demo-pw-1234
```

**컨테이너의 프런트는 webpack 으로 돈다.** 기본 번들러인 Turbopack 이 아니라.
mac 의 바인드 마운트에서는 호스트의 파일 변경이 컨테이너 안 inotify 로 전달되지
않아서 Turbopack 이 다시 컴파일하지 않는다(컨테이너 안 파일은 분명히 바뀌어 있다).
Turbopack 에는 폴링 스위치가 없고 webpack 에는 `WATCHPACK_POLLING` 이 있어서 이쪽을
쓴다. 폴링 간격을 늘리려면 `WATCHPACK_POLLING=1000`(ms).

그래서 **프런트만 만지는 동안에는 호스트의 `npm run dev` 가 여전히 제일 빠르다** —
Turbopack 그대로에 파일 이벤트도 바로 온다.

```bash
docker compose up -d db api      # 백엔드만 띄우고
cd alrimi-web && npm run dev     # 프런트는 호스트에서
```

의존성을 추가했을 때만 이미지를 다시 굽는다 — `node_modules` 는 호스트 것이 아니라
이미지 것을 쓰기 때문이다(호스트 것은 darwin 바이너리라 리눅스에서 안 돈다).

```bash
docker compose build web
```

포트가 이미 쓰이고 있으면 `WEB_PORT`·`API_PORT`·`DB_PORT` 로 옮긴다
(`WEB_PORT=3001 docker compose up`). 웹 포트를 옮길 때는 그 오리진을
`alrimi-api/.env.local` 의 `CORS_ALLOWED_ORIGINS` 에도 넣어야 한다.

## 운영

**릴리스를 만들면 이미지가 구워져 GHCR 에 올라간다.** 배포는 자동으로 하지 않는다 —
서버에 들어가서 받는다.

```
GitHub 릴리스 생성 → .github/workflows/release.yml
  → ghcr.io/<owner>/alrimi-api:<태그> · :latest
  → ghcr.io/<owner>/alrimi-web:<태그> · :latest
```

`latest` 는 **정식 릴리스일 때만** 옮긴다. 프리릴리스나 손으로 다시 구운
(`workflow_dispatch`) 것은 태그만 붙는다 — `latest` 가 뒤로 가지 않게.

`NEXT_PUBLIC_API_HOST` 는 저장소 시크릿에서 온다(Settings → Secrets and variables →
Actions). 번들에 박히는 값이라 비어 있으면 배포 후 브라우저에서만 조용히 실패하므로,
워크플로가 굽기 전에 비었는지 보고 멈춘다.

서버에서는 받아서 올린다. `docker-compose.prod.yml` 로 띄우는데 **이 파일은 git 에
없다** — 배포하는 자리마다 주소와 계정이 달라서 서버에서 각자 갖는다(`.gitignore`).

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

| | 운영 | 개발 |
| --- | --- | --- |
| web | `output: "standalone"` 결과물 + `node server.js` | `next dev` |
| api | gunicorn (3 워커) · migrate + collectstatic 후 기동 | `runserver` |
| db | 포트를 밖으로 열지 않는다 | localhost:5432 |
| 포트 | 127.0.0.1 에만 붙인다 (앞에 프록시를 둔다) | 0.0.0.0 |

**web 은 standalone 이미지다.** `next build` 가 실제로 쓰는 파일만 추려 최소한의
`node_modules` 와 함께 담으므로 소스도 devDependencies 도 들어가지 않는다.
`public` 과 `.next/static` 은 standalone 에 안 들어와서(원래 CDN 이 맡는 자리다)
Dockerfile 이 따로 복사한다 — 앞에 CDN 없이 `server.js` 가 직접 내준다.

**`collectstatic` 은 이미지 빌드가 아니라 기동 때 돈다.** prod 설정이
`DJANGO_SECRET_KEY` 같은 값을 요구해서 환경변수가 들어오는 실행 시점에야
돌릴 수 있고, whitenoise 의 매니페스트도 이때 만들어진다.

TLS 는 스택 밖에서 끊는다(nginx·Caddy·클라우드 LB). prod 설정이 프록시 뒤라고 보고
`X-Forwarded-Proto` 를 읽는다.

필요한 것은 둘이다.

- `alrimi-api/.env.prod` — `DJANGO_SECRET_KEY`·`DJANGO_ALLOWED_HOSTS`·`POSTGRES_*`·
  `CORS_ALLOWED_ORIGINS`·`NTFY_*` (`alrimi-api/.env.example` 참고). 빠지면 부팅
  단계에서 바로 죽는다.
- compose 파일 옆의 `.env` — `GHCR_OWNER`(소문자), `IMAGE_TAG`(생략하면 `latest`),
  `POSTGRES_*`.

API 주소는 서버에서 못 바꾼다. 이미 이미지 안에 박혀 있어서, 바꾸려면 시크릿을 고치고
다시 구워야 한다.

## 설정

API 설정은 모두 `alrimi-api/.env.local` 하나에서 온다 — ntfy 주소·발행 계정,
CORS 오리진, 토큰 수명 등. `alrimi-api/.env.example` 에 항목마다 설명이 있다.

db 계정은 compose 안에 로컬용 기본값(`alrimi` / `alrimi-local`)이 박혀 있고,
셸 환경변수나 이 파일 옆의 `.env` 로 덮을 수 있다.

`NEXT_PUBLIC_API_HOST` 는 개발 서버가 컴파일할 때마다 읽으므로 환경변수로 바꾸면 된다
(`NEXT_PUBLIC_API_HOST=... docker compose up web`). 배포 이미지
(`docker build --target prod`)에서는 빌드 때 번들에 박히므로 빌드 인자로 준다.

## 더 읽을 것

- `alrimi-api/README.md` — 엔드포인트, 발송, 색 팔레트, 환경 분기
- `alrimi-web/README.md` — 화면 구성과 그렇게 만든 까닭
