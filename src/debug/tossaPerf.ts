export type TossaPerfArea = "FLOW" | "TTS" | "SPEECH" | "FRESH" | "IMAGE";

export type TossaPerfEntry = {
  at: number;
  area: TossaPerfArea;
  event: string;
  data: Record<string, unknown>;
};

const MAX_ENTRIES = 300;
const entries: TossaPerfEntry[] = [];
let snapshot: readonly TossaPerfEntry[] = [];
const listeners = new Set<() => void>();

declare global {
  interface Window {
    __tossaPerf?: typeof tossaPerf;
  }
}

export function isTossaPerfDebugEnabled(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("perfDebug") === "1";
}

export function tossaPerf(area: TossaPerfArea, event: string, details: Record<string, unknown> = {}): void {
  if (!isTossaPerfDebugEnabled()) return;
  const entry: TossaPerfEntry = {
    at: performance.now(),
    area,
    event,
    data: details,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  snapshot = entries.slice();
  console.log(`[TOSSA PERF][${area}] ${JSON.stringify({ timestamp: entry.at, event, ...details })}`);
  listeners.forEach((listener) => listener());
}

export function getTossaPerfEntries(): readonly TossaPerfEntry[] {
  return snapshot;
}

export function clearTossaPerfEntries(): void {
  if (!isTossaPerfDebugEnabled()) return;
  entries.length = 0;
  snapshot = [];
  listeners.forEach((listener) => listener());
}

export function subscribeTossaPerf(listener: () => void): () => void {
  if (!isTossaPerfDebugEnabled()) return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (isTossaPerfDebugEnabled()) window.__tossaPerf = tossaPerf;
