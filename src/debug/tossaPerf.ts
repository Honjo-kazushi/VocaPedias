export function isTossaPerfDebugEnabled(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("perfDebug") === "1";
}

export function tossaPerf(area: "FLOW" | "TTS" | "SPEECH", event: string, details: Record<string, unknown> = {}): void {
  if (!isTossaPerfDebugEnabled()) return;
  console.log(`[TOSSA PERF][${area}] ${JSON.stringify({
    timestamp: performance.now(),
    event,
    ...details,
  })}`);
}
