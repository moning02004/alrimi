/**
 * 다른 앱에서 넘어온 글을 일정 초안으로 바꾼다.
 *
 * 안드로이드 공유 시트에서 이 앱을 고르면 서비스 워커가 받아 남겨두고(`public/sw.js`),
 * 앱이 그것을 읽어 등록 폼을 채운다. 카톡 공지 한 덩어리가 제목과 내용으로 갈리는 자리다.
 *
 * **여기서 날짜는 읽지 않는다.** "다음 주 화요일" 을 알아맞히는 일은 틀렸을 때 조용히
 * 잘못된 날에 알림이 가는 쪽으로 실패한다. 날짜는 사람이 고르게 두고, 옮겨 적는 수고만 던다.
 */

/** 서버 `Event` 의 칸 길이. 넘겨 보내면 400 이 온다 */
export const TITLE_MAX = 80;
export const CONTENT_MAX = 200;

/** 서비스 워커가 남겨두는 자리. `public/sw.js` 의 같은 이름과 짝이다 */
export const SHARE_CACHE = "alrimi-share";
export const SHARE_KEY = "/__shared__";

/**
 * 넘어온 것이 얼마나 오래되면 버리는가.
 *
 * 로그인이 풀린 채 공유하면 앱이 로그인 화면으로 보내므로, 남겨둔 것이 바로 쓰이지 못하고
 * 다음 번 열 때까지 남는다. 방금 공유한 것이면 그때 열어주는 편이 맞지만, 어제 것이
 * 오늘 아침에 불쑥 뜨면 그건 고장으로 읽힌다.
 */
export const SHARE_TTL_MS = 10 * 60 * 1000;

/** 공유 시트가 주는 것. 셋 다 없을 수도 있다 — 보내는 앱마다 채우는 칸이 다르다 */
export interface SharedPayload {
  title?: string | null;
  text?: string | null;
  url?: string | null;
  /** 서비스 워커가 받은 때 */
  at?: number;
}

export interface SharedDraft {
  title: string;
  content: string;
}

const clean = (value: string | null | undefined) =>
  (value ?? "").replace(/\r\n?/g, "\n").trim();

/**
 * 제목 한 줄과 내용으로 가른다.
 *
 * - 보내는 앱이 `title` 을 따로 주면 그것이 제목이고, 글은 통째로 내용이 된다.
 * - 대개는 `text` 하나만 오므로 **첫 줄이 제목**, 나머지가 내용이다.
 * - 첫 줄이 너무 길면 자르되 **잘린 뒤는 내용 앞에 붙인다** — 옮겨 적는 수고를 덜려고
 *   받은 글인데 여기서 글자가 사라지면 도로 손으로 적어야 한다.
 * - 링크는 글에 이미 들어 있지 않을 때만 뒤에 붙인다(카톡은 대개 둘 다 보낸다).
 */
export function draftFromShare(payload: SharedPayload): SharedDraft {
  const given = clean(payload.title);
  const text = clean(payload.text);
  const url = clean(payload.url);

  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);

  let title: string;
  let rest: string[];
  if (given) {
    title = given;
    rest = lines;
  } else {
    title = lines[0] ?? "";
    rest = lines.slice(1);
  }

  if (title.length > TITLE_MAX) {
    rest = [title.slice(TITLE_MAX).trim(), ...rest];
    title = title.slice(0, TITLE_MAX).trim();
  }

  if (url && !text.includes(url) && url !== given) rest = [...rest, url];

  // 줄바꿈은 상세에서 그대로 한 줄로 이어 보이므로(`<p>`), 여기서 미리 한 줄로 만든다
  let content = rest.join(" ").replace(/\s+/g, " ").trim();
  // 자른 것이 보여야 사람이 손볼 마음이 난다. 말없이 사라지면 잘린 줄도 모른다.
  if (content.length > CONTENT_MAX) content = content.slice(0, CONTENT_MAX - 1).trim() + "…";

  return { title, content };
}

/** 쓸 만한 것이 왔는가. 빈 공유(제목도 글도 없음)로 폼을 열지 않는다 */
export const hasDraft = (draft: SharedDraft) => Boolean(draft.title || draft.content);
