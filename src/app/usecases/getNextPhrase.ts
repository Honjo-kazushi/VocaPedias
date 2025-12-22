import type { Phrase } from "../ports/PhraseRepository";
import type { PhraseRepository } from "../ports/PhraseRepository";

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
  lastPhraseId?: string
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

  const phrase = candidates[Math.floor(Math.random() * candidates.length)];

  return {
    phrase,
    reason: {
      rule: "intent-bucket+recent-avoid",
      detail: lastPhraseId
        ? `「${pickedIntent}」から直近回避で選択`
        : `「${pickedIntent}」から選択`,
    },
  };
}
