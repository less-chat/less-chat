/**
 * Keyword matching and post scoping.
 *
 * Deliberately pure and dependency-free: no database, no network, no
 * `server-only`. Every rule that decides whether a stranger gets a DM is
 * unit-testable in isolation.
 */

export type MatchMode = "exact_word" | "contains";
export type Scope = "all_posts" | "specific_posts" | "from_now_on";

export interface MatchableAutomation {
  id: string;
  status: string;
  keywords: string[];
  matchMode: string;
  scope: string;
  postIds: string[];
  appliesFrom: Date | null;
}

/**
 * Folds a comment down to a comparable form.
 *
 * Real comments look like "LINK!!! 🙏🙏", "l i n k", "Líñk", "ＬＩＮＫ".
 * NFKD decomposition handles full-width and accented characters; stripping
 * combining marks handles the accents; everything that is not a letter,
 * digit, or space becomes a space so that "link!" and "link" agree.
 */
export function normalize(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Returns the keyword that matched, or null.
 *
 * `exact_word` pads both sides with spaces and looks for the padded keyword,
 * which gives whole-word semantics without regex escaping and still supports
 * multi-word phrases like "free guide". This is what stops the keyword
 * "link" from firing on the word "linkedin" — the single most common
 * false-positive in comment automation, and the reason `exact_word` is the
 * default.
 */
export function matchKeyword(
  text: string,
  keywords: string[],
  mode: MatchMode,
): string | null {
  const haystack = normalize(text);
  if (!haystack) return null;
  const padded = ` ${haystack} `;

  for (const keyword of keywords) {
    const needle = normalize(keyword);
    if (!needle) continue;

    const hit =
      mode === "contains" ? haystack.includes(needle) : padded.includes(` ${needle} `);
    if (hit) return keyword;
  }
  return null;
}

/** Whether an automation covers the post a comment was left on. */
export function scopeCovers(
  automation: Pick<MatchableAutomation, "scope" | "postIds" | "appliesFrom">,
  mediaId: string | null,
  commentedAt: Date | null,
): boolean {
  switch (automation.scope as Scope) {
    case "all_posts":
      return true;

    case "specific_posts":
      return mediaId !== null && automation.postIds.includes(mediaId);

    case "from_now_on": {
      // No cutoff recorded means the automation was never published; fail
      // closed rather than treating it as "everything".
      if (!automation.appliesFrom) return false;
      if (!commentedAt) return false;
      return commentedAt.getTime() >= automation.appliesFrom.getTime();
    }

    default:
      return false;
  }
}

export interface MatchResult {
  automation: MatchableAutomation;
  keyword: string;
}

/**
 * Picks the first live automation that covers the post and matches a
 * keyword. Order is the caller's (newest-first), and only one automation
 * ever fires per comment — Meta permits only one DM per comment anyway, so
 * firing several would produce guaranteed failures.
 */
export function findMatch(
  automations: MatchableAutomation[],
  comment: { text: string; mediaId: string | null; commentedAt: Date | null },
): MatchResult | null {
  for (const automation of automations) {
    if (automation.status !== "live") continue;
    if (!scopeCovers(automation, comment.mediaId, comment.commentedAt)) continue;

    const keyword = matchKeyword(
      comment.text,
      automation.keywords,
      automation.matchMode as MatchMode,
    );
    if (keyword) return { automation, keyword };
  }
  return null;
}

/** Substitutes `{link}` in a DM template. */
export function renderDm(template: string, link: string | null): string {
  return template.replace(/\{link\}/g, link ?? "");
}

/**
 * Picks a public reply at random.
 *
 * Randomised rather than round-robin: Instagram's spam heuristics react to
 * repetitive identical replies, and randomness needs no stored cursor.
 */
export function pickReply(variants: string[]): string | null {
  const usable = variants.map((v) => v.trim()).filter(Boolean);
  if (usable.length === 0) return null;
  return usable[Math.floor(Math.random() * usable.length)];
}
