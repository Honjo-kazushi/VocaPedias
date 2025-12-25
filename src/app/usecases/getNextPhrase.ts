import type { Phrase } from "../ports/PhraseRepository";
import type { PhraseRepository } from "../ports/PhraseRepository";
import type { PickLog } from "../../ui/pages/HomePage";

export type PickReason = {
  rule: string;
  detail: string;
};

export type PickResult = {
  phrase: Phrase;
  reason: PickReason;
};

export async function getNextPhrase(
  repo: PhraseRepository,
  lastPhraseId: string | undefined,
  pickLogs: PickLog[]
): Promise<PickResult> {
  const all = await repo.listAll();
  if (all.length === 0) {
    throw new Error("No phrases available");
  }

  // intent ごとに束ねる
  const intentBuckets = new Map<string, Phrase[]>();
  for (const p of all) {
    const intent = p.tags[0] ?? "unknown";
    if (!intentBuckets.has(intent)) intentBuckets.set(intent, []);
    intentBuckets.get(intent)!.push(p);
  }

  const intents = Array.from(intentBuckets.keys());
  const pickedIntent = intents[Math.floor(Math.random() * intents.length)];

  // ★ 直近1件回避
  let candidates = intentBuckets.get(pickedIntent)!;
  if (lastPhraseId && candidates.length > 1) {
    candidates = candidates.filter(p => p.id !== lastPhraseId);
  }

const { phrase, lane } = (() => {
  const recentTags2 = new Set(
    pickLogs
      .slice(-2)
      .map(l => l.primaryTag)
      .filter((t): t is string => !!t)
  );

  const recentTags = new Set(
    pickLogs
      .slice(-3)
      .map(l => l.primaryTag)
      .filter((t): t is string => !!t)
  );

  const { main, review } = splitByLane(all, pickLogs, recentTags);

  const REVIEW_RATE = 0.1;
  const canUseReview =
    review.length > 0 &&
    !wasRecentReview(pickLogs);

  // ===== Review 割り込み =====
  if (canUseReview && Math.random() < REVIEW_RATE) {
    // ★ Review 側にも念のため recent-avoid
    let reviewSource = review;
    if (lastPhraseId && reviewSource.length > 1) {
      const filtered = reviewSource.filter(p => p.id !== lastPhraseId);
      if (filtered.length > 0) reviewSource = filtered;
    }

    return {
      phrase: reviewSource[Math.floor(Math.random() * reviewSource.length)],
      lane: "REVIEW" as const,
    };
  }

  // ===== Main =====
  let source = main.filter(
    p => (p.tags?.[0] ?? "unknown") === pickedIntent
  );

  // Ver.1.2：2-back Avoidance（タグ）
  if (recentTags2.size > 0) {
    const filtered = source.filter(
      p => !recentTags2.has(p.tags?.[0] ?? "")
    );
    if (filtered.length > 0) {
      source = filtered;
    }
  }

  // ★★★ ここが最重要：最終 recent-avoid ★★★
  if (lastPhraseId && source.length > 1) {
    source = source.filter(p => p.id !== lastPhraseId);
  }

  // フォールバック
  if (source.length === 0) {
    source = main.length > 0 ? main : all;

    const filtered = source.filter(
    p => !recentTags2.has(p.tags?.[0] ?? "")
  );
  if (filtered.length > 0) {
    source = filtered;
  }
    // ★ フォールバック後も必ず recent-avoid
    if (lastPhraseId && source.length > 1) {
      source = source.filter(p => p.id !== lastPhraseId);
    }
  }

  return {
    phrase: source[Math.floor(Math.random() * source.length)],
    lane: "MAIN" as const,
  };
})();

  const actualIntent = phrase.tags?.[0] ?? "unknown";
  
  return {
    phrase,
    reason: {
      rule: "intent-bucket+recent-avoid",
      detail: (
        lastPhraseId
        ? `「${actualIntent}」から直近回避で選択`
        : `「${actualIntent}」から選択`
        ) + (lane === "REVIEW" ? " [REVIEW]" : ""),
      },
    };
  }



// Review を直近で出していないか？
function wasRecentReview(pickLogs: any[]): boolean {
  const last = pickLogs[pickLogs.length - 1];
  if (!last) return false;

  return last.detail?.includes("[REVIEW]");
}

function splitByLane(
  candidates: Phrase[],
  pickLogs: PickLog[],
  recentTags: Set<string>
) {
  const main: Phrase[] = [];
  const review: Phrase[] = [];

  for (const phrase of candidates) {
    if (isReviewCandidateV11(phrase, pickLogs, recentTags)) {
      review.push(phrase);
    } else {
      main.push(phrase);
    }
  }

  return { main, review };
}

// V11: タグの出現回数ベース
function isReviewCandidateV11(
  phrase: Phrase,
  pickLogs: PickLog[],
  recentTags: Set<string>
): boolean {
  const tag = phrase.tags?.[0];
  if (!tag) return false;

  const tagOrder = pickLogs.filter(l => l.primaryTag === tag).length;

  return (
    tagOrder >= 4 &&
    !recentTags.has(tag)
  );
}

