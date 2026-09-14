# 공휴일·절기 넣기 (특일 동기화)

달력의 빨간 날(공휴일)과 절기를 서버에 넣는 방법. n8n 이 공공데이터포털에서 받아와
이 API 로 넘기는 것이 정상 경로다.

**사용자는 이 자료를 고칠 수 없다.** 웹에는 읽기만 있고, 넣고 빼는 길은 아래
`POST /special-days/sync` 하나뿐이다. 설정에서 고를 수 있는 것은 "무슨 색으로 볼지"
뿐이다.

---

## 한눈에

```bash
curl -X POST "$API/special-days/sync?kind=holiday&from=2026-01-01&to=2026-12-31" \
  -H "X-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"days": [
    {"locdate": 20260101, "dateName": "1월 1일",  "isHoliday": "Y"},
    {"locdate": 20260302, "dateName": "삼일절",   "isHoliday": "Y"}
  ]}'

# → {"kind":"holiday","from":"2026-01-01","to":"2026-12-31",
#    "added":2,"updated":0,"removed":0,"kept":0}
```

절기는 `kind` 만 바꾸면 된다.

```bash
curl -X POST "$API/special-days/sync?kind=term&from=2026-01-01&to=2026-12-31" \
  -H "X-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"days": [
    {"locdate": 20260204, "dateName": "입춘", "isHoliday": "N"},
    {"locdate": 20260320, "dateName": "춘분", "isHoliday": "N"}
  ]}'
```

---

## 이 API 가 하는 일

**"이 기간의 이 종류는 이게 전부다" 라는 선언이다.** 부분 수정이 아니다. 한 번 부르면
그 기간의 그 종류가 보낸 것과 똑같아진다:

| 상황 | 결과 |
|---|---|
| 보낸 목록에 있는데 서버에 없는 날 | 생긴다 (새로 지정된 대체공휴일) |
| 양쪽에 있는데 이름이 다른 날 | 고쳐진다 |
| 서버에 있는데 보낸 목록에 없는 날 | **지워진다** (지정이 취소된 경우) |
| 양쪽에 똑같이 있는 날 | 그대로 (`kept`) |

낱개로 넣고 빼는 API 가 아닌 까닭이 여기 있다. 그랬다면 n8n 이 "서버에는 있는데
이번 응답에는 없는 날" 을 스스로 가려내 지워야 하는데, 그 비교를 워크플로에 적어두면
조용히 틀리기 좋은 자리가 하나 더 생긴다. 지금 방식은 받은 것을 그대로 넘기기만 하면
되고, **같은 요청을 몇 번 돌려도 결과가 같다.**

건드리지 않는 것 두 가지:

- **기간 밖** — 2026년치를 맞춰도 2025년 기록은 그대로다.
- **다른 종류** — 공휴일을 맞춰도 같은 기간의 절기는 그대로다. 그래서 둘을 따로
  돌려도 되고, 하나만 돌려도 나머지가 지워지지 않는다.

---

## 요청

```
POST {API}/special-days/sync?kind=&from=&to=
X-API-KEY: {N8N_API_KEY}
Content-Type: application/json
```

### 쿼리 파라미터

| 이름 | 필수 | 값 | 설명 |
|---|---|---|---|
| `kind` | 아니오 | `holiday` · `term` | 기본값 `holiday`. 아래 표 참고 |
| `from` | **예** | `2026-01-01` 또는 `20260101` | 맞출 기간의 첫날 |
| `to` | **예** | 〃 | 맞출 기간의 마지막 날 (포함) |
| `allow_empty` | 아니오 | `true` · `1` | 빈 목록을 허용한다. 아래 "빈 응답" 참고 |

기간은 한 번에 최대 **800일**. 오타 한 번에 몇 년치를 훑어 지우는 것을 막는 선이다.

### kind 와 공공데이터포털 엔드포인트

| `kind` | 뜻 | 받아올 곳 (한국천문연구원 특일 정보) |
|---|---|---|
| `holiday` | 공휴일 (쉬는 날) | `getRestDeInfo` |
| `term` | 24절기 | `get24DivisionsInfo` |

쉬지 않는 기념일(식목일·스승의날)은 담지 않는다. 한 해에 수십 개인데 쉬는 날도 아니라
달력이 이름으로 덮이기만 하고, 대부분은 찾지 않는다.

### 본문

```json
{ "days": [ { "locdate": 20260101, "dateName": "1월 1일", "isHoliday": "Y" } ] }
```

**공공데이터포털 응답의 `items` 를 그대로 실어도 된다.** 줄마다 아래를 알아본다:

| 보낼 값 | 별칭 | 형식 |
|---|---|---|
| `date` | `locdate` | `"2026-01-01"` · `"20260101"` · `20260101` (숫자) |
| `name` | `dateName` | 40자 이내 |
| `isHoliday` | — | `kind=holiday` 일 때만 본다. 아래 참고 |

n8n 이 `{date, name}` 으로 옮겨 적게 하면 워크플로에 매핑 노드가 하나 더 붙고, 그
노드가 곧 고장날 자리가 된다. 두 이름을 다 받는 것은 그 노드를 없애려는 것이다.

`days` 대신 `holidays` 라는 이름으로 보내도 받는다 — 공휴일만 있던 시절의 이름이라,
이미 그렇게 짜둔 워크플로가 있으면 그대로 돈다.

#### `isHoliday` 처리

- `kind=holiday` — `"N"` 인 줄은 **버린다.** `getHoliDeInfo` 는 공휴일(삼일절)과 쉬지
  않는 기념일(식목일)을 한 배열에 섞어 주는데, 그 응답을 그대로 넘겨도 쉬는 날만
  들어간다. 값이 아예 없으면 공휴일 전용 응답(`getRestDeInfo`)으로 보고 받는다.
- `kind=term` — **보지 않는다.** 절기는 전부 `"N"` 으로 오지만 그것이 "안 쉬는 기념일"
  이라는 뜻은 아니다.

---

## 응답

```json
{
  "kind": "holiday",
  "from": "2026-01-01",
  "to": "2026-12-31",
  "added": 1,      // 새로 생긴 날
  "updated": 0,    // 이름이 바뀐 날
  "removed": 1,    // 응답에 없어서 지운 날
  "kept": 14       // 그대로인 날
}
```

평소에는 `added=0, updated=0, removed=0` 이어야 정상이다. 여기 숫자가 튀면 공휴일이
실제로 바뀌었거나, 받아온 자료가 이상한 것이다 — **n8n 에서 이 값을 슬랙 등으로
알리게 해두면 대체공휴일 지정을 자동으로 알게 된다.**

### 실패

**값은 문자열이 아니라 배열이다** (DRF 관례). `{"days": ["..."]}` 처럼 온다.

| 코드 | 언제 | 본문 |
|---|---|---|
| 400 | 기간이 없거나·뒤집혔거나·800일을 넘음 | `{"detail": ["from 과 to 가 필요합니다."]}` |
| 400 | 어느 줄의 날짜·이름이 틀림 | `{"days": ["2번째 줄: 날짜 형식이 올바르지 않습니다: '2026/01/02' (YYYY-MM-DD 또는 YYYYMMDD)"]}` |
| 400 | 기간 밖 날짜 | `{"days": ["기간(2026-01-01 ~ 2026-12-31) 밖의 날짜가 있습니다: 2027-01-01"]}` |
| 400 | 같은 날짜에 이름이 둘 | `{"days": ["같은 날짜에 이름이 둘입니다: 2026-01-01 (a / b)"]}` |
| 400 | 목록이 비었는데 `allow_empty` 가 없음 | 아래 참고 |
| 400 | `kind` 가 `holiday`·`term` 이 아님 | `{"kind": ["kind 는 holiday · term 중 하나여야 합니다."]}` |
| 403 | `X-API-KEY` 가 없거나 틀림 | `{"detail": "API 키가 올바르지 않습니다."}` |

줄 번호는 **사람이 세는 대로 1부터**다 — 위 예시의 "2번째 줄" 은 배열의 두 번째 항목을
가리킨다.

401 이 아니라 403 인 것은 이 자리에 로그인 방식이 아예 없어서다(크론이 부르는 다른
자리들과 같다).

---

## 빈 응답은 막힌다

공휴일 API 가 잠깐 죽어 빈 배열을 주는 일이 있다. 그대로 흘려보내면 **그 해 달력이
통째로 지워진다 — 그것도 아무도 모르게.** 그래서 빈 목록은 기본적으로 400 이다.

```json
{"detail": "목록이 비어 있습니다. 특일 API 가 응답하지 못한 것일 수 있어 기간을 비우지 않았습니다. 정말 비우려면 allow_empty=true 를 붙여주세요."}
```

`isHoliday` 로 걸러낸 뒤 비게 된 경우도 같다. 정말 비우려면:

```bash
curl -X POST "$API/special-days/sync?kind=holiday&from=2026-01-01&to=2026-12-31&allow_empty=true" \
  -H "X-API-KEY: $N8N_API_KEY" -H "Content-Type: application/json" \
  -d '{"days": []}'
```

n8n 워크플로에는 `allow_empty` 를 **넣지 않는 편이 낫다.** 그것이 이 가드의 쓸모다.

---

## n8n 워크플로

노드 셋이면 끝난다. 종류마다 한 벌씩, 둘이니 두 벌.

```
[Schedule]  →  [HTTP: 공공데이터포털]  →  [HTTP: POST /special-days/sync]
```

### 1. 공공데이터포털에서 받기

```
GET http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo
  serviceKey = {발급받은 키}
  solYear    = 2026
  numOfRows  = 100
  _type      = json
```

절기는 `getRestDeInfo` 자리에 `get24DivisionsInfo` 를 넣는다.

> **`numOfRows` 를 꼭 올려라.** 기본값이 10 이라 그냥 부르면 한 해치가 잘린다 —
> 공휴일은 해마다 20건 안팎, 절기는 24건이다. 잘린 채로 넘기면 이 API 는 그것을
> "나머지는 없어졌다" 로 읽고 **지운다.**
>
> `solMonth` 를 함께 넘겨 달마다 부르는 방식도 된다. 그때는 12번을 모아 한 번에
> 넘기거나, `from`/`to` 를 그 달로 잡아 12번 나눠 부른다 — 어느 쪽이든 **받아온 기간과
> `from`/`to` 가 같아야** 한다. 어긋나면 안 받아온 기간의 자료가 지워진다.

응답은 `response.body.items.item` 아래에 있고, 한 건뿐인 달에는 배열이 아니라 객체로
온다. 그 경우를 배열로 감싸는 처리가 필요하다.

### 2. 이 API 로 넘기기

```
POST {API}/special-days/sync?kind=holiday&from=2026-01-01&to=2026-12-31
  헤더 X-API-KEY = {N8N_API_KEY}
  본문 { "days": {{ 1번 노드의 items }} }
```

옮겨 적을 것이 없다 — `locdate`·`dateName`·`isHoliday` 를 그대로 알아본다.

### 언제 돌릴까

- **매년 1월 초** — 그 해 전체를 한 번.
- **분기마다 한 번** — 대체공휴일은 연중에 지정되기도 하고, 지정됐다 바뀌기도 한다.
  같은 요청을 몇 번 돌려도 결과가 같으니 자주 돌려도 손해가 없다.
- 다음 해 것은 보통 전년도 하반기에 확정된다. 12월에 한 번 더 돌려 **다음 해를 미리**
  채워두면 연초에 빈 달력을 보지 않는다.

---

## 확인하기

### 웹이 보는 것과 같은 조회

```bash
curl "$API/special-days?from=2026-09-01&to=2026-10-31" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# → [{"date":"2026-09-23","kind":"holiday","name":"추석"},
#    {"date":"2026-09-23","kind":"term","name":"추분"}, ...]
```

읽기 전용이고 로그인이 필요하다. 한 번에 최대 400일. POST·PATCH·DELETE 는 405 다 —
사용자가 고칠 길은 어디에도 없다.

같은 날에 공휴일과 절기가 겹치면 **두 줄**로 온다. 달력의 좁은 칸은 공휴일 쪽 이름과
색을 쓰고(쉬는 날이 하루의 쓰임을 바꾸는 정보라서), 나머지는 목록의 날짜 줄과 하루
보기가 받는다.

### 서버에서 직접 보기

```bash
# 도커로 띄운 경우
docker compose exec api python manage.py shell -c "
from special_days.models import SpecialDay
for d in SpecialDay.objects.filter(date__year=2026): print(d)
"
```

Django 관리자(`/admin`)에도 있다. 손으로 급히 한 건 고칠 때를 위한 자리인데, **다음
동기화가 그 기간의 그 종류를 통째로 다시 맞추므로 공공데이터포털에 없는 날은 도로
지워진다.**

---

## 색

자료에는 색이 없다. 무슨 색으로 볼지는 **보는 사람이** 설정 › 달력 표시에서 고른다
(공휴일 기본 빨강, 절기 기본 파랑). 색을 자료에 박아두면 한 사람이 빨강을 바꾸려고
모두의 달력을 고치게 된다.

색이 안 갈리는 눈을 위해 특일의 날짜 숫자는 언제나 굵게 적고, 이름도 함께 나온다 —
색 하나에만 기대는 표시는 두지 않았다.

---

## 관련 파일

| 무엇 | 어디 |
|---|---|
| 모델 (`SpecialDay` · `MarkStyle`) | `alrimi-api/special_days/models.py` |
| 동기화 로직 | `alrimi-api/special_days/views.py` |
| 들어온 줄 읽기 · `isHoliday` 처리 | `alrimi-api/special_days/serializers.py` |
| 고를 수 있는 색 | `alrimi-api/special_days/palette.py` |
| 이 문서가 말하는 규칙들의 시험 | `alrimi-api/special_days/tests.py` |
| 달력이 색을 얹는 곳 | `alrimi-web/lib/marks.ts` |

`N8N_API_KEY` 는 `alrimi-api/.env.local` 에 있다. 크론이 부르는 다른 자리들
(`/events/weekly`, `/events/alerts`)과 같은 열쇠를 쓴다.

---

이 문서의 예시와 응답·오류 메시지는 전부 실제 서버에 돌려보고 적었다. 규칙이 바뀌면
`alrimi-api/special_days/tests.py` 가 먼저 막는다 — 고칠 때 그쪽도 같이 본다.
