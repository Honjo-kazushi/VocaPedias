import type { TalkTopic, TalkTopicCategory } from "./talkTopics.seed";
import { tossaPerf } from "../debug/tossaPerf";

function perfFresh(event: string, details: Record<string, unknown> = {}): void {
  tossaPerf("FRESH", event, details);
}

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

const CACHE_KEY = "tossaspeak:fresh-topics:v3";
export const FRESH_TOPIC_CACHE_MS = 24 * 60 * 60 * 1000;
export const FRESH_TOPIC_MIX_RATIO = 0.4;
export const FRESH_TOPIC_REQUEST_TIMEOUT_MS = 50_000;
const CATEGORIES = new Set<TalkTopicCategory>(["experience", "opinion", "comparison", "social", "imagination"]);
let pendingRequest: Promise<FreshTalkTopic[]> | null = null;

function isFreshTopic(value: unknown): value is FreshTalkTopic {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const title = typeof item.title === "string" ? item.title.trim() : "";
  const titleWordCount = title.split(/\s+/).filter(Boolean).length;
  return typeof item.id === "string" && item.id.startsWith("fresh-") &&
    title.length > 0 && title.length <= 40 && titleWordCount <= 3 &&
    typeof item.context === "string" && item.context.trim().length > 0 && item.context.length <= 320 &&
    typeof item.category === "string" && CATEGORIES.has(item.category as TalkTopicCategory) &&
    Array.isArray(item.angles) && item.angles.length >= 4 && item.angles.length <= 6 &&
    item.angles.every((angle) => typeof angle === "string" && angle.trim().length > 0 && angle.length <= 100);
}

function normalizeTopics(value: unknown): FreshTalkTopic[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isFreshTopic).slice(0, 10).map((topic) => ({
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
  perfFresh("cache check", { cacheKey: CACHE_KEY, now });
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
  const startedAt = performance.now();
  perfFresh("fresh request start");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), FRESH_TOPIC_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("/api/fresh-topics?count=10", { signal: controller.signal });
    if (!response.ok) {
      perfFresh("fresh response", { ok: false, status: response.status, durationMs: performance.now() - startedAt });
      return [];
    }
    const body = await response.json() as FreshTopicResponse;
    const topics = normalizeTopics(body.topics);
    if (topics.length < 3) {
      perfFresh("fresh response", { ok: false, topicCount: topics.length, durationMs: performance.now() - startedAt });
      return [];
    }
    writeCache(topics, now);
    perfFresh("fresh response", { ok: true, topicCount: topics.length, durationMs: performance.now() - startedAt });
    return topics;
  } catch (error) {
    perfFresh("fresh response", { ok: false, error: error instanceof Error ? error.name : "unknown", durationMs: performance.now() - startedAt });
    return [];
  } finally {
    window.clearTimeout(timeout);
  }
}

export function loadFreshTopics(now: number = Date.now()): Promise<FreshTalkTopic[]> {
  const cached = readCache(now);
  if (cached) {
    perfFresh("cache hit", { topicCount: cached.length });
    return Promise.resolve(cached);
  }
  perfFresh("cache miss");
  if (pendingRequest) {
    perfFresh("pending request reused");
    return pendingRequest;
  }
  pendingRequest = requestFreshTopics(now).finally(() => { pendingRequest = null; });
  return pendingRequest;
}

export function isFreshTalkTopic(topic: TalkTopic): topic is FreshTalkTopic {
  return topic.source === "fresh";
}
