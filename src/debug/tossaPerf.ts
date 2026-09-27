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
const DEBUG_MODE_STORAGE_KEY = "debugMode";
export const TOSSA_DEBUG_MODE_CHANGE_EVENT = "tossa-debug-mode-change";

declare global {
  interface Window {
    __tossaPerf?: typeof tossaPerf;
  }
}

export function isTossaPerfDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("perfDebug") === "1" || isTossaDeveloperModeEnabled();
}

export function isTossaDeveloperModeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return JSON.parse(window.localStorage.getItem(DEBUG_MODE_STORAGE_KEY) ?? "false") === true;
  } catch {
    return false;
  }
}

export function isTossaRescueDiagnosticEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("rescueDiagnostic") === "1" || isTossaDeveloperModeEnabled();
}

export function setTossaDeveloperModeEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEBUG_MODE_STORAGE_KEY, JSON.stringify(enabled));
  syncTossaPerfGlobal();
  window.dispatchEvent(new Event(TOSSA_DEBUG_MODE_CHANGE_EVENT));
}

export function subscribeTossaDebugMode(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === DEBUG_MODE_STORAGE_KEY) listener();
  };
  window.addEventListener(TOSSA_DEBUG_MODE_CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(TOSSA_DEBUG_MODE_CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
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

function syncTossaPerfGlobal(): void {
  if (typeof window === "undefined") return;
  if (isTossaPerfDebugEnabled()) window.__tossaPerf = tossaPerf;
  else delete window.__tossaPerf;
}

syncTossaPerfGlobal();
