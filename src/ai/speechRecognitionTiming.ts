import type { DeviceGroup } from "../sound/selectCharacterVoice";

export type UserTurnSoftTimeoutKind = "completeShort" | "normal" | "likelyContinuing";

export type UserTurnSoftTimeoutContext = {
  transcript: string;
  language: "en" | "ja";
  lastResultIntervalMs: number | null;
  recentGrowthCount: number;
  continuationHold?: boolean;
};

export type UserTurnSoftTimeoutDecision = {
  kind: UserTurnSoftTimeoutKind;
  timeoutMs: 1400 | 1800 | 2400;
  reasons: string[];
  transcriptLength: number;
  wordCount: number;
  lastWord: string;
  lastResultIntervalMs: number | null;
  recentGrowthCount: number;
  continuationHold: boolean;
};

export type SoftTimerFireContext = {
  recentGrowthCount: number;
  lastGrowthAgeMs: number | null;
  lastResultAgeMs: number | null;
  continuationHold: boolean;
  latestIsFinal: boolean;
  alreadyExtended: boolean;
};

export type SoftTimerFireDecision = {
  extend: boolean;
  extensionMs: 0 | 800;
  reason: "recent-growth-hold" | "continuation-hold" | "final-or-stable" | "already-extended";
};

export const CONTINUATION_HOLD_MIN_WORDS = 8;
export const CONTINUATION_HOLD_MS = 3000;
export const SOFT_TIMER_EXTENSION_MS = 800;

const CONTINUATION_WORDS = new Set(["to", "and", "but", "because", "so", "if", "when", "while", "or"]);
const COMPLETE_SHORT_EXPRESSIONS = new Set([
  "yes",
  "no",
  "sure",
  "maybe",
  "of course",
  "i don't know",
  "not really",
  "sounds good",
  "that's right",
]);
const INCOMPLETE_PATTERN = /(?:^|\s)(?:i want to|i'd like to|i would like to|i think that|because i|when i|if i)$/;

function normalizeEnglishTranscript(transcript: string): string {
  return transcript
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.!?,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyUserTurnSoftTimeout({
  transcript,
  language,
  lastResultIntervalMs,
  recentGrowthCount,
  continuationHold = false,
}: UserTurnSoftTimeoutContext): UserTurnSoftTimeoutDecision {
  const trimmedTranscript = transcript.trim();
  const normalized = language === "en" ? normalizeEnglishTranscript(trimmedTranscript) : trimmedTranscript;
  const words = normalized ? normalized.split(/\s+/) : [];
  const lastWord = words.at(-1) ?? "";
  const base = {
    transcriptLength: trimmedTranscript.length,
    wordCount: words.length,
    lastWord,
    lastResultIntervalMs,
    recentGrowthCount,
    continuationHold: false,
  };

  if (language === "en") {
    const continuingReasons: string[] = [];
    if (CONTINUATION_WORDS.has(lastWord)) continuingReasons.push("continuation-word");
    if (INCOMPLETE_PATTERN.test(normalized)) continuingReasons.push("incomplete-pattern");
    if (recentGrowthCount >= 2 && lastResultIntervalMs !== null && lastResultIntervalMs < 900) {
      continuingReasons.push("recent-growth");
    }
    if (continuationHold && words.length >= CONTINUATION_HOLD_MIN_WORDS && continuingReasons.length === 0) {
      continuingReasons.push("continuation-hold");
    }
    if (continuingReasons.length > 0) {
      return { kind: "likelyContinuing", timeoutMs: 2400, reasons: continuingReasons, ...base, continuationHold: continuingReasons.includes("continuation-hold") };
    }

    if (words.length <= 4 && COMPLETE_SHORT_EXPRESSIONS.has(normalized) && recentGrowthCount < 2) {
      return { kind: "completeShort", timeoutMs: 1400, reasons: ["complete-short-expression"], ...base };
    }
  }

  return { kind: "normal", timeoutMs: 1800, reasons: ["default"], ...base };
}

export function userTurnSoftTimeoutMs(): number {
  return 1800;
}

export function decideSoftTimerFire({
  recentGrowthCount,
  lastGrowthAgeMs,
  lastResultAgeMs,
  continuationHold,
  latestIsFinal,
  alreadyExtended,
}: SoftTimerFireContext): SoftTimerFireDecision {
  if (alreadyExtended) return { extend: false, extensionMs: 0, reason: "already-extended" };

  const recentGrowthStillRelevant = recentGrowthCount >= 2
    && lastGrowthAgeMs !== null
    && lastGrowthAgeMs <= CONTINUATION_HOLD_MS;
  const resultStreamWasRecentlyActive = lastResultAgeMs !== null
    && lastResultAgeMs <= CONTINUATION_HOLD_MS;
  if (recentGrowthStillRelevant && resultStreamWasRecentlyActive) {
    return { extend: true, extensionMs: SOFT_TIMER_EXTENSION_MS, reason: "recent-growth-hold" };
  }
  if (continuationHold && resultStreamWasRecentlyActive) {
    return { extend: true, extensionMs: SOFT_TIMER_EXTENSION_MS, reason: "continuation-hold" };
  }
  void latestIsFinal;
  return { extend: false, extensionMs: 0, reason: "final-or-stable" };
}

export function ttsRecognitionRestartDelayMs(deviceGroup: DeviceGroup): number {
  return deviceGroup === "ios" ? 750 : 250;
}
