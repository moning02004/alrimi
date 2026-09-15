# 공휴일·절기 넣기 (특일 동기화)

달력의 빨간 날(공휴일)과 절기를 서버에 넣는 방법. n8n 이 공공데이터포털에서 받아와
이 API 로 넘기는 것이 정상 경로다.

**사용자는 이 자료를 고칠 수 없다.** 웹에는 읽기만 있고, 넣고 빼는 길은 아래
`POST /special-days/sync` 하나뿐이다. 설정에서 고를 수 있는 것은 "무슨 색으로 볼지"
뿐이다.

---

## 한눈에

```bash
curl -X POST "$API/special-days/sync?kind=holiday" \
  -H "X-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"days": [
    {"locdate": 20260101, "dateName": "1월 1일",  "isHoliday": "Y"},
    {"locdate": 20260302, "dateName": "삼일절",   "isHoliday": "Y"}
  ]}'

# → {"kind":"holiday","from":"2026-01-01","to":"2026-12-31",
#    "added":2,"updated":0,"removed":0,"kept":0}
```

절기는 `kind` 만 바꾸면 된다. 받은 응답을 **손대지 않고 통째로** 넘긴다:

```bash
curl -X POST "$API/special-days/sync?kind=term" \
  -H "X-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"source":"api","updatedAt":"2026-09-14T16:52:16.267Z",
        "current":{"name":"백로","date":"2026-09-07","isHoliday":false},
        "next":{"name":"추분","date":"2026-09-23","isHoliday":false},
        "terms":[{"name":"소한","sunLongitude":null,"date":"2026-01-05",
                  "time":"17:23","at":"2026-01-05T17:23:00+09:00",
                  "ts":1767601380000,"isHoliday":false}, … ]}]'

# → {"kind":"term","from":"2026-01-01","to":"2027-12-31",
#    "added":48,"updated":0,"removed":0,"kept":0}
```

`source`·`updatedAt`·`current`·`next` 는 무시하고 `terms` 만 집어낸다. 줄에 붙은
`sunLongitude`·`time`·`at`·`ts` 도 달력이 쓰지 않으므로 그냥 흘린다.

같은 요청을 한 번 더 보내면 이렇게 온다. **이것이 평소에 보게 될 모습이다:**

```
{"kind":"term","from":"2026-01-01","to":"2027-12-31",
 "added":0,"updated":0,"removed":0,"kept":48}
```

위 응답은 24절기 **두 해치(48건)** 라 응답의 창도 2026-01-01 … 2027-12-31 로 잡힌다.
기간을 따로 적을 것이 없다 — **받아온 것이 곧 맞출 범위다.**

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
POST {API}/special-days/sync?kind=
X-API-KEY: {N8N_API_KEY}
Content-Type: application/json
```

### 쿼리 파라미터

| 이름 | 필수 | 값 | 설명 |
|---|---|---|---|
| `kind` | 아니오 | `holiday` · `term` | 기본값 `holiday`. 아래 표 참고 |
| `force` | 아니오 | `true` · `1` | 대량 삭제 가드를 넘긴다. 아래 "많이 지우게 되면" 참고 |

**기간은 적지 않는다.** 보낸 자료에서 뽑는다 — 아래 참고.

### 기간은 자료가 말한다

창은 **자료에 들어 있는 해 전체**다. 2026-01-05 … 2027-12-22 를 보내면
2026-01-01 … 2027-12-31 이 맞춰진다. 응답의 `from`·`to` 가 무엇이 맞춰졌는지 말해준다.

날짜의 최소~최대가 아니라 **해 전체**인 데는 까닭이 있다. 최소~최대로 잡으면 한 해의
마지막 공휴일이 취소됐을 때 그 날짜가 목록에서 사라지고, 그러면 창 끝도 그만큼
당겨져서 **정작 지워야 할 그 줄이 창 밖에 남는다.** 달력에 유령이 되어 영영 붙어
있게 된다. 첫 공휴일이 취소돼도 같다. 해 전체로 넓히면 그럴 수가 없다.

그래서 **한 해치를 통째로 보내야 한다.** 한 달치만 보내면 그 해 나머지 열한 달이 창
안에 들어와 지워질 판이 되는데, 그쪽은 아래 가드가 막는다.

기간을 안 보내는 까닭은 하나다: 받아온 것과 어긋나게 적으면 **안 받아온 기간이
지워지는데, 그 어긋남은 아무도 모르게 일어난다.** 자료가 스스로 말하게 두면 그럴 수가
없다. 실제로 두 해치 중 2026년만 골라 보내면 창도 2026년만 잡혀 2027년은 그대로 있다.

한 번에 최대 **10개 해**까지.

### kind 와 공공데이터포털 엔드포인트

| `kind` | 뜻 | 받아올 곳 (한국천문연구원 특일 정보) |
|---|---|---|
| `holiday` | 공휴일 (쉬는 날) | `getRestDeInfo` |
| `term` | 24절기 | `get24DivisionsInfo` |

쉬지 않는 기념일(식목일·스승의날)은 담지 않는다. 한 해에 수십 개인데 쉬는 날도 아니라
달력이 이름으로 덮이기만 하고, 대부분은 찾지 않는다.

### 본문

**받은 것을 손대지 말고 그대로 넘기면 된다.** 아래 셋을 다 알아본다:

```jsonc
// 1. 벌거벗은 배열
[ {"date": "2026-03-20", "name": "춘분"} ]

// 2. 이름표가 달린 것 — days · holidays · terms · items 중 아무거나
{ "terms": [ {"date": "2026-03-20", "name": "춘분"} ] }

// 3. n8n 이 한 겹 싸서 내보낸 것 (실제로 가장 흔하다)
[ { "source": "api", "updatedAt": "…", "current": {…}, "next": {…},
    "terms": [ {"date": "2026-03-20", "name": "춘분"}, … ] } ]
```

3번에서 `source`·`updatedAt`·`current`·`next` 같은 곁다리는 무시하고 **목록만**
집어낸다. `current`·`next` 는 `terms` 안의 항목을 가리키는 것이라 두 번 세지 않는다.
싼 것이 여럿이면(달마다 부른 것을 모을 때) 이어 붙인다.

옮겨 담는 노드를 워크플로에 두지 않으려는 것이다 — 그 노드가 곧 조용히 고장날
자리가 된다.

#### 줄 하나가 갖춰야 할 것

| 보낼 값 | 별칭 | 형식 |
|---|---|---|
| `date` | `locdate` | `"2026-01-01"` · `"20260101"` · `20260101` (숫자) |
| `name` | `dateName` | 40자 이내 |
| `isHoliday` | — | `kind=holiday` 일 때만 본다. 아래 참고 |

**그 밖의 값은 무시한다.** 절기 자료의 `sunLongitude`·`time`·`at`·`ts` 처럼 달력이
쓰지 않는 것이 붙어 와도 걸리적거리지 않는다.

#### `isHoliday` 처리

`kind=holiday` 일 때만 본다. "안 쉰다" 고 적힌 줄은 **버린다** — `getHoliDeInfo` 는
공휴일(삼일절)과 쉬지 않는 기념일(식목일)을 한 배열에 섞어 주는데, 그 응답을 그대로
넘겨도 쉬는 날만 들어간다.

**주는 곳마다 다르게 적어서, 다음을 모두 같은 뜻으로 읽는다:**

| 값 | 뜻 |
|---|---|
| `"N"` · `"NO"` · `"FALSE"` · `"F"` · `"0"` · `false` · `0` | 안 쉬는 날 → 버린다 |
| `"Y"` · `true` · 그 밖의 값 | 쉬는 날 → 받는다 |
| 키가 아예 없음 | 거를 근거가 없다 → 받는다 (`getRestDeInfo` 가 그렇다) |

`kind=term` 일 때는 **보지 않는다.** 절기는 전부 `false`(또는 `"N"`)로 오지만 그것이
"안 쉬는 기념일" 이라는 뜻은 아니다.

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
| 400 | 어느 줄의 날짜·이름이 틀림 | `{"days": ["2번째 줄: 날짜 형식이 올바르지 않습니다: '2026/01/02' (YYYY-MM-DD 또는 YYYYMMDD)"]}` |
| 400 | 같은 날짜에 이름이 둘 | `{"days": ["같은 날짜에 이름이 둘입니다: 2026-01-01 (a / b)"]}` |
| 400 | 목록이 비었음 | 아래 "빈 목록" 참고 |
| 400 | 한꺼번에 많이 지우게 됨 | 아래 "많이 지우게 되면" 참고 |
| 400 | 날 목록을 못 찾음 | `{"days": ["날 목록을 찾지 못했습니다. days · holidays · terms · items 중 하나에 담아주세요."]}` |
| 400 | `kind` 가 `holiday`·`term` 이 아님 | `{"kind": ["kind 는 holiday · term 중 하나여야 합니다."]}` |
| 403 | `X-API-KEY` 가 없거나 틀림 | `{"detail": "API 키가 올바르지 않습니다."}` |

줄 번호는 **사람이 세는 대로 1부터**다 — 위 예시의 "2번째 줄" 은 배열의 두 번째 항목을
가리킨다.

401 이 아니라 403 인 것은 이 자리에 로그인 방식이 아예 없어서다(크론이 부르는 다른
자리들과 같다).

---

## 빈 목록

빈 목록은 **늘 400** 이다. 처음부터 비어 왔든, `isHoliday` 로 걸러내고 나니 비었든.

```json
{"days": ["목록이 비어 있습니다. 특일 API 가 응답하지 못했거나 쉬는 날이 하나도 없는 응답일 수 있습니다. 한 해를 정말 비우려면 관리자 화면에서 지워주세요."]}
```

창을 자료에서 뽑으므로 빈 목록에는 **"어느 기간을 비우라는 것인지" 가 없다.** 한 해를
정말 비울 일이 생기면 Django 관리자에서 지운다 — 실제로 그럴 일은 거의 없고, 자료가
틀렸으면 맞는 것으로 다시 동기화하면 그 기간이 통째로 갈아끼워진다.

---

## 많이 지우게 되면 막힌다

**남길 것보다 지울 것이 많으면** 400 이다(세 건 이상 지울 때부터).

```json
{"detail": "2026-01-01 ~ 2026-12-31 의 term 에서 20건을 지우고 3건만 남기게 됩니다. 받아온 자료가 한 해치가 맞는지 확인해주세요. 정말 이대로 맞추려면 force=true 를 붙여주세요."}
```

이럴 때 걸린다:

- 특일 API 가 반쯤 죽어 몇 줄만 줬을 때
- **한 달치를 한 해인 줄 알고 보냈을 때** — 창은 해 전체로 잡히므로 나머지 열한 달이
  통째로 지워질 판이 된다. `numOfRows` 를 안 올려 목록이 잘린 경우도 여기 걸린다.
- 엉뚱한 `kind` 로 보냈을 때

**평소 동기화는 걸리지 않는다.** 대체공휴일이 취소돼도 `removed=1, kept=19` 라 그냥
지나간다. 세 건 미만은 아예 나서지 않는데, 자료가 몇 건뿐인 해를 고치는 일마다 걸리면
정작 필요할 때 `force=true` 를 습관처럼 붙이게 되기 때문이다.

정말 그럴 작정이면:

```bash
curl -X POST "$API/special-days/sync?kind=holiday&force=true" \
  -H "X-API-KEY: $N8N_API_KEY" -H "Content-Type: application/json" \
  -d '{"days": [ … ]}'
```

n8n 워크플로에는 `force` 를 **넣지 않는 편이 낫다.** 그것이 이 가드의 쓸모다.

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
> 공휴일은 해마다 20건 안팎, 절기는 24건이다. 잘린 목록을 넘기면 이 API 는 그것을
> "나머지는 없어졌다" 로 읽는다. 다행히 그때는 대량 삭제 가드가 400 으로 막아주지만,
> 가드에 기대기보다 처음부터 다 받아오는 편이 낫다.
>
> **한 해치를 통째로 받아라.** `solMonth` 로 달마다 부르면 한 번의 응답이 한 달치라,
> 그대로 넘기면 그 해 나머지가 지워질 판이 된다(역시 가드가 막는다). 달마다 부를
> 수밖에 없다면 **12번을 모아 한 번에** 넘긴다.

응답은 `response.body.items.item` 아래에 있고, 한 건뿐인 달에는 배열이 아니라 객체로
온다. 그 경우를 배열로 감싸는 처리가 필요하다.

### 2. 이 API 로 넘기기

```
POST {API}/special-days/sync?kind=holiday
  헤더 X-API-KEY = {N8N_API_KEY}
  본문 {{ 1번 노드의 출력 그대로 }}
```

**옮겨 적을 것도, 기간을 계산할 것도 없다.** 앞 노드가 뱉은 것을 그대로 본문에 꽂으면
끝이다 — 배열이든, `terms`·`items` 에 담겨 있든, n8n 이 한 겹 싼 모양이든 알아본다.
줄 안의 이름도 `date`/`locdate`, `name`/`dateName` 을 함께 받고, `isHoliday` 는
문자열이든 불리언이든 같은 뜻으로 읽는다. 맞출 기간은 자료가 말한다.

손으로 정할 것은 `kind` 하나뿐이다.

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

---

## 붙임: 절기 자료 원본

실제로 받아 쓰는 절기 응답 전문(2026~2027, 48건). **이 문서의 절기 예시와 규칙들은
이 자료를 손대지 않고 그대로 서버에 보내보고 적었다** — `added: 48` 이 나오는 것까지
확인했다. 이 모양이 바뀌면 `alrimi-api/special_days/tests.py` 의
`test_the_shape_n8n_actually_sends` 가 먼저 막는다.

```json
[
  {
    "source": "api",
    "updatedAt": "2026-09-14T16:52:16.267Z",
    "current": {
      "name": "백로",
      "sunLongitude": null,
      "date": "2026-09-07",
      "time": "23:41",
      "at": "2026-09-07T23:41:00+09:00",
      "ts": 1788792060000,
      "isHoliday": false
    },
    "next": {
      "name": "추분",
      "sunLongitude": null,
      "date": "2026-09-23",
      "time": "09:05",
      "at": "2026-09-23T09:05:00+09:00",
      "ts": 1790121900000,
      "isHoliday": false
    },
    "terms": [
      {
        "name": "소한",
        "sunLongitude": null,
        "date": "2026-01-05",
        "time": "17:23",
        "at": "2026-01-05T17:23:00+09:00",
        "ts": 1767601380000,
        "isHoliday": false
      },
      {
        "name": "대한",
        "sunLongitude": null,
        "date": "2026-01-20",
        "time": "10:45",
        "at": "2026-01-20T10:45:00+09:00",
        "ts": 1768873500000,
        "isHoliday": false
      },
      {
        "name": "입춘",
        "sunLongitude": null,
        "date": "2026-02-04",
        "time": "05:02",
        "at": "2026-02-04T05:02:00+09:00",
        "ts": 1770148920000,
        "isHoliday": false
      },
      {
        "name": "우수",
        "sunLongitude": null,
        "date": "2026-02-19",
        "time": "00:52",
        "at": "2026-02-19T00:52:00+09:00",
        "ts": 1771429920000,
        "isHoliday": false
      },
      {
        "name": "경칩",
        "sunLongitude": null,
        "date": "2026-03-05",
        "time": "22:59",
        "at": "2026-03-05T22:59:00+09:00",
        "ts": 1772719140000,
        "isHoliday": false
      },
      {
        "name": "춘분",
        "sunLongitude": null,
        "date": "2026-03-20",
        "time": "23:46",
        "at": "2026-03-20T23:46:00+09:00",
        "ts": 1774017960000,
        "isHoliday": false
      },
      {
        "name": "청명",
        "sunLongitude": null,
        "date": "2026-04-05",
        "time": "03:40",
        "at": "2026-04-05T03:40:00+09:00",
        "ts": 1775328000000,
        "isHoliday": false
      },
      {
        "name": "곡우",
        "sunLongitude": null,
        "date": "2026-04-20",
        "time": "10:39",
        "at": "2026-04-20T10:39:00+09:00",
        "ts": 1776649140000,
        "isHoliday": false
      },
      {
        "name": "입하",
        "sunLongitude": null,
        "date": "2026-05-05",
        "time": "20:49",
        "at": "2026-05-05T20:49:00+09:00",
        "ts": 1777981740000,
        "isHoliday": false
      },
      {
        "name": "소만",
        "sunLongitude": null,
        "date": "2026-05-21",
        "time": "09:37",
        "at": "2026-05-21T09:37:00+09:00",
        "ts": 1779323820000,
        "isHoliday": false
      },
      {
        "name": "망종",
        "sunLongitude": null,
        "date": "2026-06-06",
        "time": "00:48",
        "at": "2026-06-06T00:48:00+09:00",
        "ts": 1780674480000,
        "isHoliday": false
      },
      {
        "name": "하지",
        "sunLongitude": null,
        "date": "2026-06-21",
        "time": "17:25",
        "at": "2026-06-21T17:25:00+09:00",
        "ts": 1782030300000,
        "isHoliday": false
      },
      {
        "name": "소서",
        "sunLongitude": null,
        "date": "2026-07-07",
        "time": "10:57",
        "at": "2026-07-07T10:57:00+09:00",
        "ts": 1783389420000,
        "isHoliday": false
      },
      {
        "name": "대서",
        "sunLongitude": null,
        "date": "2026-07-23",
        "time": "04:13",
        "at": "2026-07-23T04:13:00+09:00",
        "ts": 1784747580000,
        "isHoliday": false
      },
      {
        "name": "입추",
        "sunLongitude": null,
        "date": "2026-08-07",
        "time": "20:43",
        "at": "2026-08-07T20:43:00+09:00",
        "ts": 1786102980000,
        "isHoliday": false
      },
      {
        "name": "처서",
        "sunLongitude": null,
        "date": "2026-08-23",
        "time": "11:19",
        "at": "2026-08-23T11:19:00+09:00",
        "ts": 1787451540000,
        "isHoliday": false
      },
      {
        "name": "백로",
        "sunLongitude": null,
        "date": "2026-09-07",
        "time": "23:41",
        "at": "2026-09-07T23:41:00+09:00",
        "ts": 1788792060000,
        "isHoliday": false
      },
      {
        "name": "추분",
        "sunLongitude": null,
        "date": "2026-09-23",
        "time": "09:05",
        "at": "2026-09-23T09:05:00+09:00",
        "ts": 1790121900000,
        "isHoliday": false
      },
      {
        "name": "한로",
        "sunLongitude": null,
        "date": "2026-10-08",
        "time": "15:29",
        "at": "2026-10-08T15:29:00+09:00",
        "ts": 1791440940000,
        "isHoliday": false
      },
      {
        "name": "상강",
        "sunLongitude": null,
        "date": "2026-10-23",
        "time": "18:38",
        "at": "2026-10-23T18:38:00+09:00",
        "ts": 1792748280000,
        "isHoliday": false
      },
      {
        "name": "입동",
        "sunLongitude": null,
        "date": "2026-11-07",
        "time": "18:52",
        "at": "2026-11-07T18:52:00+09:00",
        "ts": 1794045120000,
        "isHoliday": false
      },
      {
        "name": "소설",
        "sunLongitude": null,
        "date": "2026-11-22",
        "time": "16:23",
        "at": "2026-11-22T16:23:00+09:00",
        "ts": 1795332180000,
        "isHoliday": false
      },
      {
        "name": "대설",
        "sunLongitude": null,
        "date": "2026-12-07",
        "time": "11:53",
        "at": "2026-12-07T11:53:00+09:00",
        "ts": 1796611980000,
        "isHoliday": false
      },
      {
        "name": "동지",
        "sunLongitude": null,
        "date": "2026-12-22",
        "time": "05:50",
        "at": "2026-12-22T05:50:00+09:00",
        "ts": 1797886200000,
        "isHoliday": false
      },
      {
        "name": "소한",
        "sunLongitude": null,
        "date": "2027-01-05",
        "time": "23:10",
        "at": "2027-01-05T23:10:00+09:00",
        "ts": 1799158200000,
        "isHoliday": false
      },
      {
        "name": "대한",
        "sunLongitude": null,
        "date": "2027-01-20",
        "time": "16:30",
        "at": "2027-01-20T16:30:00+09:00",
        "ts": 1800430200000,
        "isHoliday": false
      },
      {
        "name": "입춘",
        "sunLongitude": null,
        "date": "2027-02-04",
        "time": "10:46",
        "at": "2027-02-04T10:46:00+09:00",
        "ts": 1801705560000,
        "isHoliday": false
      },
      {
        "name": "우수",
        "sunLongitude": null,
        "date": "2027-02-19",
        "time": "06:33",
        "at": "2027-02-19T06:33:00+09:00",
        "ts": 1802986380000,
        "isHoliday": false
      },
      {
        "name": "경칩",
        "sunLongitude": null,
        "date": "2027-03-06",
        "time": "04:40",
        "at": "2027-03-06T04:40:00+09:00",
        "ts": 1804275600000,
        "isHoliday": false
      },
      {
        "name": "춘분",
        "sunLongitude": null,
        "date": "2027-03-21",
        "time": "05:25",
        "at": "2027-03-21T05:25:00+09:00",
        "ts": 1805574300000,
        "isHoliday": false
      },
      {
        "name": "청명",
        "sunLongitude": null,
        "date": "2027-04-05",
        "time": "09:17",
        "at": "2027-04-05T09:17:00+09:00",
        "ts": 1806884220000,
        "isHoliday": false
      },
      {
        "name": "곡우",
        "sunLongitude": null,
        "date": "2027-04-20",
        "time": "16:18",
        "at": "2027-04-20T16:18:00+09:00",
        "ts": 1808205480000,
        "isHoliday": false
      },
      {
        "name": "입하",
        "sunLongitude": null,
        "date": "2027-05-06",
        "time": "02:25",
        "at": "2027-05-06T02:25:00+09:00",
        "ts": 1809537900000,
        "isHoliday": false
      },
      {
        "name": "소만",
        "sunLongitude": null,
        "date": "2027-05-21",
        "time": "15:18",
        "at": "2027-05-21T15:18:00+09:00",
        "ts": 1810880280000,
        "isHoliday": false
      },
      {
        "name": "망종",
        "sunLongitude": null,
        "date": "2027-06-06",
        "time": "06:26",
        "at": "2027-06-06T06:26:00+09:00",
        "ts": 1812230760000,
        "isHoliday": false
      },
      {
        "name": "하지",
        "sunLongitude": null,
        "date": "2027-06-21",
        "time": "23:11",
        "at": "2027-06-21T23:11:00+09:00",
        "ts": 1813587060000,
        "isHoliday": false
      },
      {
        "name": "소서",
        "sunLongitude": null,
        "date": "2027-07-07",
        "time": "16:37",
        "at": "2027-07-07T16:37:00+09:00",
        "ts": 1814945820000,
        "isHoliday": false
      },
      {
        "name": "대서",
        "sunLongitude": null,
        "date": "2027-07-23",
        "time": "10:05",
        "at": "2027-07-23T10:05:00+09:00",
        "ts": 1816304700000,
        "isHoliday": false
      },
      {
        "name": "입추",
        "sunLongitude": null,
        "date": "2027-08-08",
        "time": "02:27",
        "at": "2027-08-08T02:27:00+09:00",
        "ts": 1817659620000,
        "isHoliday": false
      },
      {
        "name": "처서",
        "sunLongitude": null,
        "date": "2027-08-23",
        "time": "17:14",
        "at": "2027-08-23T17:14:00+09:00",
        "ts": 1819008840000,
        "isHoliday": false
      },
      {
        "name": "백로",
        "sunLongitude": null,
        "date": "2027-09-08",
        "time": "05:28",
        "at": "2027-09-08T05:28:00+09:00",
        "ts": 1820348880000,
        "isHoliday": false
      },
      {
        "name": "추분",
        "sunLongitude": null,
        "date": "2027-09-23",
        "time": "15:02",
        "at": "2027-09-23T15:02:00+09:00",
        "ts": 1821679320000,
        "isHoliday": false
      },
      {
        "name": "한로",
        "sunLongitude": null,
        "date": "2027-10-08",
        "time": "21:17",
        "at": "2027-10-08T21:17:00+09:00",
        "ts": 1822997820000,
        "isHoliday": false
      },
      {
        "name": "상강",
        "sunLongitude": null,
        "date": "2027-10-24",
        "time": "00:33",
        "at": "2027-10-24T00:33:00+09:00",
        "ts": 1824305580000,
        "isHoliday": false
      },
      {
        "name": "입동",
        "sunLongitude": null,
        "date": "2027-11-08",
        "time": "00:39",
        "at": "2027-11-08T00:39:00+09:00",
        "ts": 1825601940000,
        "isHoliday": false
      },
      {
        "name": "소설",
        "sunLongitude": null,
        "date": "2027-11-22",
        "time": "22:16",
        "at": "2027-11-22T22:16:00+09:00",
        "ts": 1826889360000,
        "isHoliday": false
      },
      {
        "name": "대설",
        "sunLongitude": null,
        "date": "2027-12-07",
        "time": "17:38",
        "at": "2027-12-07T17:38:00+09:00",
        "ts": 1828168680000,
        "isHoliday": false
      },
      {
        "name": "동지",
        "sunLongitude": null,
        "date": "2027-12-22",
        "time": "11:42",
        "at": "2027-12-22T11:42:00+09:00",
        "ts": 1829443320000,
        "isHoliday": false
      }
    ]
  }
]
```