import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { TossaTtsProbe } from "../sound/speakEn.ts";
import AppleVoiceTest from "./AppleVoiceTest";
import {
  clearTossaPerfEntries,
  getTossaPerfEntries,
  subscribeTossaPerf,
  type TossaPerfEntry,
} from "../debug/tossaPerf";

const AREAS = ["FLOW", "TTS", "SPEECH", "FRESH", "IMAGE"] as const;

function detailText(data: Record<string, unknown>): string {
  return Object.entries(data).map(([key, value]) => `${key}=${String(value)}`).join("  ");
}

function last(entries: readonly TossaPerfEntry[], area: string, event: string): TossaPerfEntry | undefined {
  return [...entries].reverse().find((entry) => entry.area === area && entry.event === event);
}

function duration(entries: readonly TossaPerfEntry[], label: string, fromArea: string, fromEvent: string, toArea: string, toEvent: string): string | null {
  const end = last(entries, toArea, toEvent);
  if (!end) return null;
  const start = [...entries].reverse().find((entry) => entry.at <= end.at && entry.area === fromArea && entry.event === fromEvent);
  return start ? `${label}: ${Math.round(end.at - start.at)} ms` : null;
}

function utteranceDuration(entries: readonly TossaPerfEntry[], label: string, fromEvent: string, toEvent: string): string | null {
  const end = last(entries, "TTS", toEvent);
  const utteranceId = end?.data.utteranceId;
  if (!end || utteranceId === undefined) return null;
  const start = [...entries].reverse().find((entry) =>
    entry.at <= end.at && entry.area === "TTS" && entry.event === fromEvent && entry.data.utteranceId === utteranceId
  );
  return start ? `${label}: ${Math.round(end.at - start.at)} ms` : null;
}

function deviceLabel(userAgent: string, platform: string, maxTouchPoints: number): "iPhone" | "iPad" | "Android" | "PC Chrome" {
  if (/iphone/i.test(userAgent)) return "iPhone";
  if (/ipad/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1)) return "iPad";
  if (/android/i.test(userAgent)) return "Android";
  return "PC Chrome";
}

function deviceText(): string {
  return [
    "=== DEVICE ===",
    `DEVICE LABEL: ${deviceLabel(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)}`,
    `UA: ${navigator.userAgent}`,
    `platform: ${navigator.platform || "unknown"}`,
    `maxTouchPoints: ${navigator.maxTouchPoints}`,
    `screen: ${screen.width} x ${screen.height}`,
    `devicePixelRatio: ${window.devicePixelRatio}`,
  ].join("\n");
}

function buildReport(entries: readonly TossaPerfEntry[], voices: readonly SpeechSynthesisVoice[], probe?: TossaTtsProbe): string {
  const timings = [
    duration(entries, "Talk click → Emma TTS request", "FLOW", "Talk Topic click / topic selected", "FLOW", "Emma guide TTS requested"),
    duration(entries, "TTS request → speak", "FLOW", "Emma guide TTS requested", "TTS", "TTS main speak"),
    duration(entries, "TTS request → onstart", "FLOW", "Emma guide TTS requested", "TTS", "TTS main onstart"),
    utteranceDuration(entries, "TTS speak → onstart", "TTS main speak", "TTS main onstart"),
    utteranceDuration(entries, "TTS onstart → onend", "TTS main onstart", "TTS main onend"),
    duration(entries, "Partner selected → Opening request", "FLOW", "Partner selected", "FLOW", "Opening request start"),
    duration(entries, "Opening request → response", "FLOW", "Opening request start", "FLOW", "Opening response"),
    duration(entries, "response → Character speak", "FLOW", "Opening response", "TTS", "TTS main speak"),
    duration(entries, "speechend → final", "SPEECH", "onspeechend/onsoundend", "SPEECH", "final result"),
    duration(entries, "final → soft timer", "SPEECH", "final result", "SPEECH", "soft timer fire"),
    duration(entries, "soft timer → Gemini send", "SPEECH", "soft timer fire", "SPEECH", "Gemini request start"),
    duration(entries, "TTS onend → restart request", "SPEECH", "TTS onend", "SPEECH", "recognition restart requested"),
    duration(entries, "restart request → start()", "SPEECH", "recognition restart requested", "SPEECH", "recognition start() about to call"),
    duration(entries, "start() → onstart", "SPEECH", "recognition start() about to call", "SPEECH", "recognition onstart"),
  ].filter(Boolean);
  const current = last(entries, "TTS", "TTS main speak");
  const sections = AREAS.map((area) => {
    const areaEntries = entries.filter((entry) => entry.area === area);
    return [`=== ${area} ===`, ...areaEntries.map((entry) => `+${Math.round(entry.at)}ms ${entry.event}${Object.keys(entry.data).length ? `  ${detailText(entry.data)}` : ""}`)].join("\n");
  });
  return [
    deviceText(),
    "=== DURATIONS ===",
    timings.length ? timings.join("\n") : "No completed timing pairs yet.",
    "=== CURRENT VOICE ===",
    current ? detailText(current.data) : "No voice selected yet.",
    "=== DIRECT TTS PROBE ===",
    probe ? detailText(probe) : "No main utterance reached the direct probe yet.",
    ...sections,
    "=== VOICES ===",
    voices.length ? voices.map((voice) => `${voice.name} | ${voice.lang} | local=${voice.localService} | default=${voice.default}`).join("\n") : "No voices returned yet.",
  ].join("\n\n");
}

export default function PerfDebugPanel() {
  const [open, setOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [probe, setProbe] = useState<TossaTtsProbe | undefined>(() => window.__TOSSA_TTS_PROBE__);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const entries = useSyncExternalStore(subscribeTossaPerf, () => getTossaPerfEntries(), () => []);
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setProbe(window.__TOSSA_TTS_PROBE__), 250);
    return () => window.clearInterval(timer);
  }, [open]);
  const report = useMemo(() => buildReport(
    entries,
    open && "speechSynthesis" in window ? window.speechSynthesis.getVoices() : [],
    probe,
  ), [entries, open, probe]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopyStatus("Copied");
    } catch {
      textareaRef.current?.focus();
      textareaRef.current?.select();
      setCopyStatus("Select All → Copy");
    }
  };

  return (
    <div className="perf-debug-root">
      <button className="perf-debug-trigger" type="button" onClick={() => setOpen(true)}>PERF</button>
      {open && (
        <div className="perf-debug-overlay" role="dialog" aria-modal="true" aria-label="PERF diagnostics">
          <section className="perf-debug-panel">
            <header>
              <strong>PERF diagnostics</strong>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close PERF diagnostics">×</button>
            </header>
            <div className="perf-debug-actions">
              <button type="button" onClick={() => void copy()}>Copy</button>
              <button type="button" onClick={() => { clearTossaPerfEntries(); setCopyStatus("Cleared"); }}>Clear</button>
              <span aria-live="polite">{copyStatus}</span>
            </div>
            <AppleVoiceTest />
            <textarea ref={textareaRef} readOnly value={report} aria-label="PERF diagnostic report" />
          </section>
        </div>
      )}
    </div>
  );
}
