export type SpeechRateIntent = "slow" | "normal" | "faster" | null;

const normalizeEnglish = (text: string) => text.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z'\s]/g, " ").replace(/\s+/g, " ").trim();

export function detectSpeechRateIntent(text: string): SpeechRateIntent {
  const value = normalizeEnglish(text);
  if (/\b(?:speak normally|normal speed(?: is okay)?|speak at (?:a )?normal speed|you can speak normally)\b/.test(value)) return "normal";
  if (/\b(?:speak faster|a little faster|talk faster|speed up)\b/.test(value)) return "faster";
  if (/\b(?:speak|talk)(?: a little| a bit| more)? slower\b/.test(value) ||
      /\b(?:speak|talk)(?: a little| a bit)? more slowly\b/.test(value) ||
      /\bslow down(?: a little| a bit)?\b/.test(value) ||
      /\b(?:you are|you're|you re) (?:speaking|talking) too fast\b/.test(value) ||
      /\ba little slower\b/.test(value)) return "slow";
  return null;
}

export function applySpeechRateIntent(current: number, intent: SpeechRateIntent): number {
  if (intent === "normal") return 1;
  if (intent === "slow") return Math.max(0.8, Math.round((current - 0.1) * 10) / 10);
  if (intent === "faster") return Math.min(1, Math.round((current + 0.1) * 10) / 10);
  return current;
}
