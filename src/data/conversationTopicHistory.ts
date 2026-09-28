import type { CharacterId } from "../characters/characterProfiles";
import type { TalkTopic } from "./talkTopics.seed";

export type ConversationTopicHistory = {
  topicId: string;
  normalizedTitle: string;
  source: "fixed" | "fresh";
  characterId: string;
  angle: string;
  opening: string;
  firstQuestion?: string;
  usedAt: number;
};

export type OpeningVariationContext = {
  recentSameCharacter: string[];
  recentOtherCharacters: string[];
};

export const CONVERSATION_TOPIC_HISTORY_KEY = "tossaspeak:conversation-topic-history:v1";
export const CONVERSATION_TOPIC_HISTORY_LIMIT = 20;

export function normalizeTopicTitle(title: string): string {
  return title.trim().toLowerCase();
}

export function filterTopicChoices<T extends Pick<TalkTopic, "id" | "title">>(
  topics: readonly T[],
  recentNormalizedTitle: string | null,
  previousTopicId: string | null,
): T[] {
  const differentTitleChoices = topics.filter((topic) => normalizeTopicTitle(topic.title) !== recentNormalizedTitle);
  if (differentTitleChoices.length > 0) return differentTitleChoices;
  const differentIdChoices = topics.filter((topic) => topic.id !== previousTopicId);
  return differentIdChoices.length > 0 ? differentIdChoices : [...topics];
}

function isHistoryEntry(value: unknown): value is ConversationTopicHistory {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.topicId === "string" &&
    typeof entry.normalizedTitle === "string" &&
    (entry.source === "fixed" || entry.source === "fresh") &&
    typeof entry.characterId === "string" &&
    typeof entry.angle === "string" &&
    typeof entry.opening === "string" &&
    (entry.firstQuestion === undefined || typeof entry.firstQuestion === "string") &&
    typeof entry.usedAt === "number";
}

export function readConversationTopicHistory(): ConversationTopicHistory[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(CONVERSATION_TOPIC_HISTORY_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(isHistoryEntry).slice(0, CONVERSATION_TOPIC_HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function writeConversationTopicHistory(entries: readonly ConversationTopicHistory[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      CONVERSATION_TOPIC_HISTORY_KEY,
      JSON.stringify(entries.slice(0, CONVERSATION_TOPIC_HISTORY_LIMIT)),
    );
  } catch {
    // Conversation can continue when storage is unavailable or full.
  }
}

export function extractFirstQuestion(opening: string): string | undefined {
  const question = opening.match(/(?:^|[.!]\s+)([^?]+\?)/)?.[1] ?? opening.match(/[^?]+\?/)?.[0];
  return question?.trim();
}

export function recordConversationTopicHistory(
  topic: TalkTopic,
  characterId: CharacterId,
  angle: string | null,
  opening: string,
  usedAt: number = Date.now(),
): ConversationTopicHistory[] {
  const entry: ConversationTopicHistory = {
    topicId: topic.id,
    normalizedTitle: normalizeTopicTitle(topic.title),
    source: topic.source === "fresh" ? "fresh" : "fixed",
    characterId,
    angle: angle ?? "",
    opening,
    firstQuestion: extractFirstQuestion(opening),
    usedAt,
  };
  const next = [entry, ...readConversationTopicHistory()].slice(0, CONVERSATION_TOPIC_HISTORY_LIMIT);
  writeConversationTopicHistory(next);
  return next;
}

export function getRecentTopicHistory(
  topic: TalkTopic,
  history: readonly ConversationTopicHistory[] = readConversationTopicHistory(),
): ConversationTopicHistory[] {
  const normalizedTitle = normalizeTopicTitle(topic.title);
  return history.filter((entry) => entry.normalizedTitle === normalizedTitle);
}

export function buildOpeningVariationContext(
  topic: TalkTopic,
  characterId: CharacterId,
  history: readonly ConversationTopicHistory[] = readConversationTopicHistory(),
): OpeningVariationContext {
  const recent = getRecentTopicHistory(topic, history);
  const describe = (entry: ConversationTopicHistory) => entry.firstQuestion || entry.opening;
  return {
    recentSameCharacter: recent.filter((entry) => entry.characterId === characterId).slice(0, 4).map(describe),
    recentOtherCharacters: recent.filter((entry) => entry.characterId !== characterId).slice(0, 4).map(describe),
  };
}
