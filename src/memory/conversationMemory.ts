import { tossaPerf } from "../debug/tossaPerf";

export const CONVERSATION_MEMORY_STORAGE_KEY = "tossaspeak.conversation-memory.v1";
export const MAX_CONVERSATION_MEMORIES = 15;
export const MAX_PROMPT_MEMORIES = 5;

export type ConversationMemory = {
  id: string;
  key: string;
  text: string;
  category?: string;
  createdAt: number;
  updatedAt: number;
};

export type MemoryCandidate = {
  action: "upsert" | "remove";
  key: string;
  text?: string;
  category?: string;
  evidence: string;
};

export type MemoryApplyResult = {
  memories: ConversationMemory[];
  added: number;
  updated: number;
  removed: number;
  ignored: Array<{ reason: string }>;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const SENSITIVE_PATTERNS = [
  /\b(?:password|passcode|pin)\b/i,
  /\b(?:credit\s*card|bank\s*account|routing\s*number)\b/i,
  /\b(?:diagnos(?:is|ed)|medication|prescription|disease|illness)\b/i,
  /\b(?:religion|religious|church|temple|mosque|political|party|vot(?:e|ed|ing)|sexual)\b/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?:https?:\/\/|www\.)/i,
  /\b(?:\+?\d[\d ()-]{7,}\d)\b/,
  /\b(?:住所|電話番号|メールアドレス|パスワード|暗証番号|口座|銀行|クレジットカード|病名|薬|持病|健康状態|宗教|政党|投票|性的)\b/,
];

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\s.,!?。、！？'"’“”_-]+/g, " ").trim();
}

function isSensitive(value: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(value));
}

function safeStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isMemory(value: unknown): value is ConversationMemory {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ConversationMemory>;
  return typeof item.id === "string" && typeof item.key === "string" && typeof item.text === "string" &&
    typeof item.createdAt === "number" && typeof item.updatedAt === "number" &&
    !isSensitive(`${item.key} ${item.text}`);
}

export function loadConversationMemories(storage: StorageLike | null = safeStorage()): ConversationMemory[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(CONVERSATION_MEMORY_STORAGE_KEY) ?? "[]");
    const memories = Array.isArray(parsed) ? parsed.filter(isMemory).slice(-MAX_CONVERSATION_MEMORIES) : [];
    tossaPerf("MEMORY", "memory load", { count: memories.length });
    return memories;
  } catch {
    tossaPerf("MEMORY", "memory ignored", { reason: "malformed storage" });
    return [];
  }
}

export function saveConversationMemories(memories: ConversationMemory[], storage: StorageLike | null = safeStorage()): void {
  if (!storage) return;
  storage.setItem(CONVERSATION_MEMORY_STORAGE_KEY, JSON.stringify(memories.slice(-MAX_CONVERSATION_MEMORIES)));
}

export function parseMemoryCandidates(text: string): MemoryCandidate[] {
  try {
    const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed: unknown = JSON.parse(unfenced);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is MemoryCandidate => {
      if (!value || typeof value !== "object") return false;
      const item = value as Partial<MemoryCandidate>;
      return (item.action === "upsert" || item.action === "remove") &&
        typeof item.key === "string" && Boolean(item.key.trim()) &&
        typeof item.evidence === "string" && Boolean(item.evidence.trim()) &&
        (item.action === "remove" || (typeof item.text === "string" && Boolean(item.text.trim())));
    });
  } catch {
    return [];
  }
}

export function applyMemoryCandidates(
  existing: readonly ConversationMemory[],
  candidates: readonly MemoryCandidate[],
  userUtterances: readonly string[],
  now = Date.now(),
): MemoryApplyResult {
  let memories = existing.filter(isMemory).slice(-MAX_CONVERSATION_MEMORIES);
  const source = normalize(userUtterances.join(" \n "));
  const result: MemoryApplyResult = { memories, added: 0, updated: 0, removed: 0, ignored: [] };

  for (const candidate of candidates) {
    const key = normalize(candidate.key);
    const evidence = normalize(candidate.evidence);
    const text = candidate.text?.trim() ?? "";
    const reject = (reason: string) => result.ignored.push({ reason });
    if (!key || !evidence || !source.includes(evidence)) {
      reject("evidence not found in user statements");
      continue;
    }
    if (isSensitive(`${candidate.key} ${text} ${candidate.evidence}`)) {
      reject("sensitive information");
      continue;
    }
    const index = memories.findIndex((memory) => normalize(memory.key) === key);
    if (candidate.action === "remove") {
      if (index < 0) reject("no matching memory");
      else {
        memories = memories.filter((_, memoryIndex) => memoryIndex !== index);
        result.removed += 1;
      }
      continue;
    }
    if (!text || text.length > 160 || candidate.key.length > 80) {
      reject("invalid candidate length");
      continue;
    }
    const category = candidate.category?.trim().slice(0, 40) || undefined;
    if (index >= 0) {
      if (normalize(memories[index].text) === normalize(text)) {
        reject("duplicate");
        continue;
      }
      memories[index] = { ...memories[index], text, category, updatedAt: now };
      result.updated += 1;
    } else {
      memories.push({ id: globalThis.crypto?.randomUUID?.() ?? `memory-${now}-${memories.length}`, key, text, category, createdAt: now, updatedAt: now });
      result.added += 1;
    }
  }
  result.memories = memories.sort((a, b) => a.updatedAt - b.updatedAt).slice(-MAX_CONVERSATION_MEMORIES);
  return result;
}

export function getPromptMemories(memories = loadConversationMemories()): ConversationMemory[] {
  return [...memories].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_PROMPT_MEMORIES);
}
