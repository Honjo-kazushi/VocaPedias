import type { TalkTopic, TalkTopicCategory } from "./talkTopics.seed";

export type FreshTalkTopic = TalkTopic & {
  source: "fresh";
  context: string;
};

type FreshTopicResponse = {
  topics?: unknown;
  generatedAt?: unknown;
};

type FreshTopicCache = {
  expiresAt: number;
  topics: FreshTalkTopic[];
};

const CACHE_KEY = "tossaspeak:fresh-topics:v1";
export const FRESH_TOPIC_CACHE_MS = 24 * 60 * 60 * 1000;
export const FRESH_TOPIC_MIX_RATIO = 0.2;
const CATEGORIES = new Set<TalkTopicCategory>(["experience", "opinion", "comparison", "social", "imagination"]);
let pendingRequest: Promise<FreshTalkTopic[]> | null = null;

function isFreshTopic(value: unknown): value is FreshTalkTopic {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && item.id.startsWith("fresh-") &&
    typeof item.title === "string" && item.title.trim().length > 0 && item.title.length <= 80 &&
    typeof item.context === "string" && item.context.trim().length > 0 && item.context.length <= 320 &&
    typeof item.category === "string" && CATEGORIES.has(item.category as TalkTopicCategory) &&
    Array.isArray(item.angles) && item.angles.length >= 4 && item.angles.length <= 6 &&
    item.angles.every((angle) => typeof angle === "string" && angle.trim().length > 0 && angle.length <= 100);
}

function normalizeTopics(value: unknown): FreshTalkTopic[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isFreshTopic).slice(0, 5).map((topic) => ({
    ...topic,
    source: "fresh",
    openingQuestion: "",
    deepQuestion: "",
    title: topic.title.trim(),
    context: topic.context.trim(),
    angles: topic.angles?.map((angle) => angle.trim()),
  }));
}

function readCache(now: number): FreshTalkTopic[] | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as FreshTopicCache | null;
    if (!parsed || parsed.expiresAt <= now) return null;
    const topics = normalizeTopics(parsed.topics);
    return topics.length >= 3 ? topics : null;
  } catch {
    return null;
  }
}

function writeCache(topics: FreshTalkTopic[], now: number): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ expiresAt: now + FRESH_TOPIC_CACHE_MS, topics } satisfies FreshTopicCache));
  } catch {
    // Storage may be unavailable in private browsing. The in-memory result is still usable.
  }
}

async function requestFreshTopics(now: number): Promise<FreshTalkTopic[]> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch("/api/fresh-topics", { signal: controller.signal });
    if (!response.ok) return [];
    const body = await response.json() as FreshTopicResponse;
    const topics = normalizeTopics(body.topics);
    if (topics.length < 3) return [];
    writeCache(topics, now);
    return topics;
  } catch {
    return [];
  } finally {
    window.clearTimeout(timeout);
  }
}

export function loadFreshTopics(now: number = Date.now()): Promise<FreshTalkTopic[]> {
  const cached = readCache(now);
  if (cached) return Promise.resolve(cached);
  if (pendingRequest) return pendingRequest;
  pendingRequest = requestFreshTopics(now).finally(() => { pendingRequest = null; });
  return pendingRequest;
}

export function isFreshTalkTopic(topic: TalkTopic): topic is FreshTalkTopic {
  return topic.source === "fresh";
}
