import type { TalkTopic } from "../data/talkTopics.seed";

const DELEGATED_CHOICE = /\b(?:anything(?:\s+is)?\s+fine|you\s+(?:can\s+)?choose|pick\s+(?:something|one)|surprise\s+me|whatever\s+you\s+like|i\s+don'?t\s+know)\b/i;
const TOPIC_ALIASES: Readonly<Record<string, readonly string[]>> = {
  Pets: ["animal", "animals", "pet", "pets"],
  Travel: ["travel", "trip", "trips", "traveling", "travelling"],
  Music: ["music", "song", "songs"],
  Food: ["food", "meal", "meals", "cooking"],
};

function normalizedWords(text: string): string[] {
  return text.normalize("NFKC").toLocaleLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

export function delegatesTopicChoice(text: string): boolean {
  return DELEGATED_CHOICE.test(text.normalize("NFKC"));
}

export function resolveRequestedTopic(
  text: string,
  topics: readonly TalkTopic[],
  excludedTopicId?: string,
): TalkTopic | null {
  const words = new Set(normalizedWords(text));
  if (!words.size) return null;
  let best: { topic: TalkTopic; score: number } | null = null;
  for (const topic of topics) {
    if (topic.id === excludedTopicId) continue;
    const titleWords = normalizedWords(topic.title);
    const aliases = TOPIC_ALIASES[topic.title] ?? [];
    const score = titleWords.filter((word) => words.has(word) || words.has(word.replace(/s$/, ""))).length * 2
      + aliases.filter((alias) => words.has(alias)).length * 3;
    if (score > 0 && (!best || score > best.score)) best = { topic, score };
  }
  return best?.topic ?? null;
}
