export type ConversationHistoryEntry = Readonly<{
  at: number;
  kind: "ai" | "stt" | "decision" | "gemini";
  text?: string;
  data?: Readonly<Record<string, unknown>>;
}>;

let entries: ConversationHistoryEntry[] = [];

export function clearConversationHistory(): void {
  entries = [];
}

export function recordConversationHistory(entry: Omit<ConversationHistoryEntry, "at">): void {
  entries.push(Object.freeze({ at: Date.now(), ...entry }));
}

export function getConversationHistory(): readonly ConversationHistoryEntry[] {
  return entries;
}

export function formatConversationHistory(): string {
  return ["=== CONVERSATION HISTORY ===", ...entries.map((entry) => {
    const detail = entry.data ? ` ${JSON.stringify(entry.data)}` : "";
    return `${new Date(entry.at).toISOString()} ${entry.kind.toUpperCase()}: ${entry.text ?? ""}${detail}`.trimEnd();
  })].join("\n");
}

declare global {
  interface Window { __tossaConversationHistory?: () => string; }
}

if (typeof window !== "undefined") window.__tossaConversationHistory = formatConversationHistory;
