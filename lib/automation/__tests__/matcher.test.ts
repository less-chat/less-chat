import { describe, expect, it } from "vitest";
import {
  findMatch,
  matchKeyword,
  normalize,
  pickReply,
  renderDm,
  scopeCovers,
  type MatchableAutomation,
} from "../matcher";

describe("normalize", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalize("LINK!!!")).toBe("link");
  });

  it("strips emoji, which real comments are full of", () => {
    expect(normalize("guide 🙏🔥")).toBe("guide");
  });

  it("collapses runs of whitespace", () => {
    expect(normalize("  free    guide  ")).toBe("free guide");
  });

  it("folds accents so 'guíde' matches 'guide'", () => {
    expect(normalize("guíde")).toBe("guide");
  });

  it("folds full-width characters used to dodge filters", () => {
    expect(normalize("ＬＩＮＫ")).toBe("link");
  });

  it("returns empty for emoji-only comments", () => {
    expect(normalize("🔥🔥🔥")).toBe("");
  });
});

describe("matchKeyword — exact_word", () => {
  it("matches a standalone word", () => {
    expect(matchKeyword("send me the LINK please", ["link"], "exact_word")).toBe("link");
  });

  it("does NOT match 'link' inside 'linkedin'", () => {
    expect(matchKeyword("follow me on linkedin", ["link"], "exact_word")).toBeNull();
  });

  it("matches a word adjacent to punctuation", () => {
    expect(matchKeyword("link!", ["link"], "exact_word")).toBe("link");
  });

  it("matches when the comment is only the keyword", () => {
    expect(matchKeyword("Guide", ["guide"], "exact_word")).toBe("guide");
  });

  it("supports multi-word phrases", () => {
    expect(matchKeyword("i want the free guide now", ["free guide"], "exact_word")).toBe(
      "free guide",
    );
  });

  it("returns the first matching keyword from the list", () => {
    expect(matchKeyword("send the guide", ["link", "guide"], "exact_word")).toBe("guide");
  });

  it("returns null when nothing matches", () => {
    expect(matchKeyword("great post!", ["link", "guide"], "exact_word")).toBeNull();
  });

  it("ignores blank keywords rather than matching everything", () => {
    expect(matchKeyword("hello there", ["", "   "], "exact_word")).toBeNull();
  });

  it("returns null for an emoji-only comment", () => {
    expect(matchKeyword("🔥🔥", ["link"], "exact_word")).toBeNull();
  });
});

describe("matchKeyword — contains", () => {
  it("matches inside a larger word", () => {
    expect(matchKeyword("follow me on linkedin", ["link"], "contains")).toBe("link");
  });

  it("still respects normalization", () => {
    expect(matchKeyword("GUIDE!!!", ["guide"], "contains")).toBe("guide");
  });
});

const base: MatchableAutomation = {
  id: "a1",
  status: "live",
  keywords: ["guide"],
  matchMode: "exact_word",
  scope: "all_posts",
  postIds: [],
  appliesFrom: null,
};

describe("scopeCovers", () => {
  it("all_posts covers any post", () => {
    expect(scopeCovers(base, "media-1", new Date())).toBe(true);
  });

  it("specific_posts covers only listed ids", () => {
    const a = { ...base, scope: "specific_posts", postIds: ["media-1"] };
    expect(scopeCovers(a, "media-1", new Date())).toBe(true);
    expect(scopeCovers(a, "media-2", new Date())).toBe(false);
  });

  it("specific_posts fails closed when the media id is unknown", () => {
    const a = { ...base, scope: "specific_posts", postIds: ["media-1"] };
    expect(scopeCovers(a, null, new Date())).toBe(false);
  });

  it("from_now_on excludes comments before the cutoff", () => {
    const a = { ...base, scope: "from_now_on", appliesFrom: new Date("2026-08-27T00:00:00Z") };
    expect(scopeCovers(a, "m", new Date("2026-08-26T23:59:59Z"))).toBe(false);
    expect(scopeCovers(a, "m", new Date("2026-08-27T00:00:01Z"))).toBe(true);
  });

  it("from_now_on fails closed when no cutoff was ever recorded", () => {
    const a = { ...base, scope: "from_now_on", appliesFrom: null };
    expect(scopeCovers(a, "m", new Date())).toBe(false);
  });

  it("an unknown scope fails closed", () => {
    expect(scopeCovers({ ...base, scope: "nonsense" }, "m", new Date())).toBe(false);
  });
});

describe("findMatch", () => {
  const comment = { text: "guide please", mediaId: "m1", commentedAt: new Date() };

  it("finds a live automation", () => {
    expect(findMatch([base], comment)?.keyword).toBe("guide");
  });

  it("skips draft and paused automations", () => {
    expect(findMatch([{ ...base, status: "draft" }], comment)).toBeNull();
    expect(findMatch([{ ...base, status: "paused" }], comment)).toBeNull();
  });

  it("returns only the first match, never several", () => {
    const second = { ...base, id: "a2" };
    const result = findMatch([base, second], comment);
    expect(result?.automation.id).toBe("a1");
  });

  it("skips an automation whose scope excludes the post", () => {
    const scoped = { ...base, scope: "specific_posts", postIds: ["other"] };
    expect(findMatch([scoped], comment)).toBeNull();
  });

  it("falls through a non-covering automation to a covering one", () => {
    const scoped = { ...base, id: "a1", scope: "specific_posts", postIds: ["other"] };
    const open = { ...base, id: "a2" };
    expect(findMatch([scoped, open], comment)?.automation.id).toBe("a2");
  });
});

describe("renderDm", () => {
  it("substitutes the link", () => {
    expect(renderDm("Here: {link}", "https://x.com")).toBe("Here: https://x.com");
  });

  it("substitutes every occurrence", () => {
    expect(renderDm("{link} and {link}", "u")).toBe("u and u");
  });

  it("renders a missing link as empty rather than the literal placeholder", () => {
    expect(renderDm("Here: {link}", null)).toBe("Here: ");
  });
});

describe("pickReply", () => {
  it("returns null when there are no usable variants", () => {
    expect(pickReply([])).toBeNull();
    expect(pickReply(["", "  "])).toBeNull();
  });

  it("only ever returns a non-blank variant", () => {
    for (let i = 0; i < 50; i++) {
      expect(["a", "b"]).toContain(pickReply(["a", "", "b"]));
    }
  });
});
