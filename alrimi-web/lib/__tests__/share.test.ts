import { describe, expect, it } from "vitest";
import { CONTENT_MAX, TITLE_MAX, draftFromShare, hasDraft } from "../share";

describe("draftFromShare — 넘어온 글을 제목과 내용으로 가른다", () => {
  it("첫 줄이 제목, 나머지가 내용이다", () => {
    const draft = draftFromShare({
      text: "가을 소풍 안내\n10월 2일 목요일\n도시락과 돗자리를 챙겨주세요",
    });

    expect(draft.title).toBe("가을 소풍 안내");
    expect(draft.content).toBe("10월 2일 목요일 도시락과 돗자리를 챙겨주세요");
  });

  it("보내는 앱이 제목을 따로 주면 글은 통째로 내용이다", () => {
    const draft = draftFromShare({ title: "어린이집 공지", text: "가을 소풍 안내" });

    expect(draft.title).toBe("어린이집 공지");
    expect(draft.content).toBe("가을 소풍 안내");
  });

  it("빈 줄과 앞뒤 공백은 버린다", () => {
    const draft = draftFromShare({ text: "  체육복  \n\n\n  물통  \n" });

    expect(draft.title).toBe("체육복");
    expect(draft.content).toBe("물통");
  });

  it("긴 첫 줄은 자르되 잘린 뒤가 내용 앞에 남는다", () => {
    const long = "가".repeat(TITLE_MAX + 12);
    const draft = draftFromShare({ text: `${long}\n뒷줄` });

    expect(draft.title).toHaveLength(TITLE_MAX);
    // 옮겨 적는 수고를 덜려고 받은 글이다. 여기서 글자가 사라지면 도로 손으로 적어야 한다.
    expect(draft.content).toBe(`${"가".repeat(12)} 뒷줄`);
  });

  it("내용이 넘치면 자른 것을 말줄임으로 보여준다", () => {
    const draft = draftFromShare({ text: `제목\n${"나".repeat(CONTENT_MAX + 50)}` });

    expect(draft.content).toHaveLength(CONTENT_MAX);
    expect(draft.content.endsWith("…")).toBe(true);
  });

  it("링크는 글에 없을 때만 뒤에 붙인다", () => {
    const withUrl = draftFromShare({ text: "공지", url: "https://example.com/a" });
    expect(withUrl.content).toBe("https://example.com/a");

    const already = draftFromShare({
      text: "공지\nhttps://example.com/a",
      url: "https://example.com/a",
    });
    expect(already.content).toBe("https://example.com/a");
  });

  it("아무것도 안 오면 빈 초안이고, 그것으로는 폼을 열지 않는다", () => {
    expect(hasDraft(draftFromShare({}))).toBe(false);
    expect(hasDraft(draftFromShare({ text: "   " }))).toBe(false);
    expect(hasDraft(draftFromShare({ text: "체육복" }))).toBe(true);
  });
});
