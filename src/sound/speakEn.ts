import type { CharacterId } from "../characters/characterProfiles";
import { tossaPerf as logTossaPerf } from "../debug/tossaPerf";
import { detectDeviceGroup, selectCharacterVoice } from "./selectCharacterVoice";
import { cancelSpeechSynthesis, setActiveTtsState } from "./cancelSpeechSynthesis";

export type TossaTtsProbe = {
  phase: "speak" | "onstart" | "onend" | "onerror";
  characterId: CharacterId | null;
  sourceFunction: "speakEn" | "speakSpeechQueue" | "speakEnSentences";
  utteranceId: number;
  voiceName: string | null;
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
  speakCalledAt: number;
  eventAt: number;
  error?: string;
};

declare global {
  interface Window {
    __TOSSA_TTS_PROBE__?: TossaTtsProbe;
  }
}

function tossaPerf(event: string, details: Record<string, unknown> = {}): void {
  const ua = navigator.userAgent;
  const deviceGroup = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    ? "apple-touch"
    : /Mac/i.test(navigator.platform)
      ? "mac"
      : /Android/i.test(ua)
        ? "android"
        : /Win/i.test(navigator.platform)
          ? "windows"
          : "other";
  logTossaPerf("TTS", event, { deviceGroup, ...details });
}

function voiceDetails(voice: SpeechSynthesisVoice | null): Record<string, unknown> {
  return {
    voice: voice?.name ?? null,
    voiceName: voice?.name ?? "browser default (utterance.voice = null)",
    voiceLang: voice?.lang ?? null,
    localService: voice?.localService ?? null,
    default: voice?.default ?? null,
  };
}

let utteranceSequence = 0;
let speechGenerationSequence = 0;

function writeTtsProbe(
  phase: TossaTtsProbe["phase"],
  utterance: SpeechSynthesisUtterance,
  characterId: CharacterId | undefined,
  sourceFunction: TossaTtsProbe["sourceFunction"],
  utteranceId: number,
  speakCalledAt: number,
  error?: string,
): void {
  window.__TOSSA_TTS_PROBE__ = {
    phase,
    characterId: characterId ?? null,
    sourceFunction,
    utteranceId,
    voiceName: utterance.voice?.name ?? null,
    lang: utterance.lang,
    rate: utterance.rate,
    pitch: utterance.pitch,
    volume: utterance.volume,
    speakCalledAt,
    eventAt: performance.now(),
    ...(error ? { error } : {}),
  };
  console.log("[TOSSA TTS PROBE]", window.__TOSSA_TTS_PROBE__);
}

function mainSpeechDetails(
  utterance: SpeechSynthesisUtterance,
  characterId: CharacterId | undefined,
  sourceFunction: "speakEn" | "speakSpeechQueue" | "speakEnSentences",
  utteranceId: number,
  index: number,
): Record<string, unknown> {
  return {
    kind: "main",
    characterId: characterId ?? null,
    sourceFunction,
    utteranceId,
    index,
    textStart: utterance.text.slice(0, 48),
    textLength: utterance.text.length,
    lang: utterance.lang,
    ...voiceDetails(utterance.voice),
    rate: utterance.rate,
    pitch: utterance.pitch,
    volume: utterance.volume,
    synthesisSpeaking: window.speechSynthesis?.speaking ?? false,
    synthesisPending: window.speechSynthesis?.pending ?? false,
  };
}

export type SpeechLocale = "ja-JP" | "en-US";
export type SpeechQueueItem = { lang: SpeechLocale; text: string; brightJapanese?: boolean; characterId?: CharacterId; avoidVoiceCharacterId?: CharacterId; rateMultiplier?: number };

// cancel() stops the native queue, but the voice engine may still be settling.
const SPEECH_START_DELAY_MS = 250;
const VOICE_READY_TIMEOUT_MS = 1000;
const SPEECH_WARMUP_TIMEOUT_MS = 1000;
const APPLE_VOICE_RETRY_INTERVAL_MS = 120;
const APPLE_VOICE_RETRY_MAX = 4;
export const APPLE_UTTERANCE_GAP_MS = 120;
type CancelSpeech = (requestReason?: string) => void;
let cancelPendingStart: CancelSpeech | undefined;
const warmedVoiceKeys = new Set<string>();
let appleTtsUnlocked = false;

type WarmupVoice = {
  locale: SpeechLocale;
  characterId?: CharacterId;
  brightJapanese?: boolean;
  avoidVoiceCharacterId?: CharacterId;
};

export type AppleTtsUnlockSource = "startup-dialog" | "topic-fallback" | "scene-fallback";

export function unlockAppleTtsOnUserGesture(unlockSource: AppleTtsUnlockSource): void {
  const deviceGroup = detectDeviceGroup();
  if (deviceGroup !== "ios") {
    tossaPerf("apple tts unlock skipped", { unlockSource, reason: "non-apple", detectedDeviceGroup: deviceGroup });
    return;
  }
  if (appleTtsUnlocked) {
    tossaPerf("apple tts unlock skipped", { unlockSource, reason: "already-unlocked" });
    return;
  }
  if (typeof window === "undefined" || !window.speechSynthesis) {
    tossaPerf("apple tts unlock skipped", { unlockSource, reason: "speech-synthesis-unavailable" });
    return;
  }

  const synth = window.speechSynthesis;
  let voices: SpeechSynthesisVoice[] = [];
  try {
    voices = synth.getVoices();
  } catch {
    // Synchronous user-gesture execution is more important than voice discovery.
  }
  const selectedVoice = selectCharacterVoice("emma", voices, { locale: "en-US" }).voice;
  tossaPerf("apple tts unlock requested", {
    unlockSource,
    voiceCount: voices.length,
    ...voiceDetails(selectedVoice),
    synthesisSpeaking: synth.speaking,
    synthesisPending: synth.pending,
  });

  try {
    const utterance = new SpeechSynthesisUtterance(".");
    utterance.lang = "en-US";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 0.01;
    if (selectedVoice) utterance.voice = selectedVoice;
    const details = () => ({
      unlockSource,
      voiceCount: voices.length,
      ...voiceDetails(utterance.voice),
      lang: utterance.lang,
      rate: utterance.rate,
      pitch: utterance.pitch,
      volume: utterance.volume,
      synthesisSpeaking: synth.speaking,
      synthesisPending: synth.pending,
    });
    utterance.onstart = () => tossaPerf("apple tts unlock onstart", details());
    utterance.onend = () => tossaPerf("apple tts unlock onend", details());
    utterance.onerror = (event) => tossaPerf("apple tts unlock onerror", { ...details(), error: event.error });
    tossaPerf("apple tts unlock speak", details());
    synth.speak(utterance);
    appleTtsUnlocked = true;
  } catch (error) {
    tossaPerf("apple tts unlock onerror", {
      unlockSource,
      voiceCount: voices.length,
      ...voiceDetails(selectedVoice),
      error: error instanceof Error ? error.message : String(error),
      synthesisSpeaking: synth.speaking,
      synthesisPending: synth.pending,
    });
  }
}

function voiceKey(utterance: SpeechSynthesisUtterance): string {
  const voice = utterance.voice;
  return voice ? `${voice.voiceURI || voice.name}|${utterance.lang}` : `default|${utterance.lang}`;
}

function deferSpeechStart(
  synth: SpeechSynthesis,
  warmupVoice: WarmupVoice,
  prepare: () => void,
  start: () => void,
): () => void {
  let timer: number | undefined;
  let disposed = false;
  let scheduled = false;
  let prepared = false;
  let warming = false;
  let warmup: SpeechSynthesisUtterance | undefined;
  const dispose = () => {
    disposed = true;
    window.clearTimeout(timer);
    synth.removeEventListener("voiceschanged", onVoicesChanged);
    if (warmup) {
      warmup.onstart = null;
      warmup.onend = null;
      warmup.onerror = null;
    }
  };
  const scheduleStart = () => {
    if (disposed || scheduled) return;
    scheduled = true;
    if (!prepared) {
      prepared = true;
      prepare();
    }
    window.clearTimeout(timer);
    synth.removeEventListener("voiceschanged", onVoicesChanged);
    timer = window.setTimeout(() => {
      if (disposed) return;
      dispose();
      tossaPerf("fixed delay complete", { characterId: warmupVoice.characterId, delayMs: SPEECH_START_DELAY_MS });
      start();
    }, SPEECH_START_DELAY_MS);
  };
  const warmThenSchedule = () => {
    if (disposed || scheduled || warming) return;
    warming = true;
    window.clearTimeout(timer);
    synth.removeEventListener("voiceschanged", onVoicesChanged);
    try {
      // A punctuation utterance reliably reaches the speech engine where empty
      // strings and whitespace may be discarded. volume=0 keeps it inaudible.
      warmup = createUtterance(
        ".",
        warmupVoice.locale,
        warmupVoice.characterId,
        warmupVoice.brightJapanese,
        warmupVoice.avoidVoiceCharacterId,
      );
      const key = voiceKey(warmup);
      if (warmedVoiceKeys.has(key)) {
        tossaPerf("warmup skipped", { characterId: warmupVoice.characterId, voiceKey: key });
        warming = false;
        warmup = undefined;
        scheduleStart();
        return;
      }
      const appleWarmup = detectDeviceGroup() === "ios";
      const firstWarmup = warmup;
      const warmupDetails = () => ({
        kind: "warmup",
        characterId: warmupVoice.characterId,
        voiceKey: key,
        retryCount,
        ...voiceDetails(warmup?.voice ?? null),
        lang: warmup?.lang ?? warmupVoice.locale,
        synthesisSpeaking: synth.speaking,
        synthesisPending: synth.pending,
      });
      let finished = false;
      let retryCount = 0;
      let warmupStarted = false;
      const clearWarmupHandlers = () => {
        if (!warmup) return;
        warmup.onstart = null;
        warmup.onend = null;
        warmup.onerror = null;
      };
      const finishWarmup = (outcome: "onend" | "onerror" | "timeout") => {
        if (disposed || finished) return;
        finished = true;
        warming = false;
        if (!appleWarmup || warmupStarted || outcome !== "timeout") warmedVoiceKeys.add(key);
        if (retryCount > 0) tossaPerf(`warmup retry ${outcome}`, warmupDetails());
        tossaPerf(`warmup ${outcome}`, warmupDetails());
        window.clearTimeout(timer);
        clearWarmupHandlers();
        if (outcome === "timeout" && appleWarmup) {
          cancelSpeechSynthesis(synth, {
            reason: "warmup-timeout-reset-native-queue",
            source: "deferSpeechStart.warmup-timeout",
            characterId: warmupVoice.characterId,
          });
        }
        scheduleStart();
      };
      const startWarmup = (isRetry: boolean) => {
        if (disposed || finished) return;
        retryCount = isRetry ? 1 : 0;
        warmupStarted = false;
        const attempt = isRetry
          ? createUtterance(
              ".",
              warmupVoice.locale,
              warmupVoice.characterId,
              warmupVoice.brightJapanese,
              warmupVoice.avoidVoiceCharacterId,
            )
          : firstWarmup;
        warmup = attempt;
        if (isRetry) {
          attempt.voice = firstWarmup.voice;
          attempt.lang = firstWarmup.lang;
          attempt.rate = firstWarmup.rate;
          attempt.pitch = firstWarmup.pitch;
          tossaPerf("warmup retry start", warmupDetails());
        }
        attempt.volume = 0;
        if (!isRetry) tossaPerf("warmup start", warmupDetails());
        attempt.onstart = () => {
          warmupStarted = true;
          if (isRetry) tossaPerf("warmup retry onstart", warmupDetails());
          tossaPerf("warmup onstart", warmupDetails());
        };
        attempt.onend = () => finishWarmup("onend");
        attempt.onerror = () => finishWarmup("onerror");
        timer = window.setTimeout(() => {
          if (disposed || finished) return;
          if (appleWarmup && !warmupStarted && !isRetry) {
            tossaPerf("warmup timeout", warmupDetails());
            clearWarmupHandlers();
            cancelSpeechSynthesis(synth, {
              reason: "apple-warmup-not-started-retry",
              source: "deferSpeechStart.warmup-retry",
              characterId: warmupVoice.characterId,
            });
            tossaPerf("warmup retry scheduled", warmupDetails());
            timer = window.setTimeout(() => startWarmup(true), SPEECH_START_DELAY_MS);
            return;
          }
          finishWarmup("timeout");
        }, SPEECH_WARMUP_TIMEOUT_MS);
        tossaPerf("TTS warmup speak", { kind: "warmup", characterId: warmupVoice.characterId, voiceKey: key, retryCount, textLength: attempt.text.length, ...voiceDetails(attempt.voice), lang: attempt.lang, rate: attempt.rate, pitch: attempt.pitch, volume: attempt.volume });
        synth.speak(attempt);
      };
      startWarmup(false);
    } catch {
      // Warm-up is best-effort; never prevent the real utterance.
      scheduleStart();
    }
  };
  const hasRequestedVoice = () => {
    try {
      const prefix = warmupVoice.locale === "ja-JP" ? "ja" : "en";
      tossaPerf("getVoices start", { characterId: warmupVoice.characterId, locale: warmupVoice.locale });
      const voices = synth.getVoices();
      tossaPerf("getVoices complete", { characterId: warmupVoice.characterId, locale: warmupVoice.locale, voiceCount: voices.length });
      if (detectDeviceGroup() === "ios" && warmupVoice.characterId) {
        const selection = selectCharacterVoice(warmupVoice.characterId, voices, {
          locale: warmupVoice.locale,
          brightJapanese: warmupVoice.brightJapanese,
        });
        if (selection.deviceGroup === "ios") return selection.selectionReason === "preferredName";
      }
      return voices.some((voice) => new RegExp(`^${prefix}(?:[-_]|$)`, "i").test(voice.lang));
    } catch {
      return false;
    }
  };
  function onVoicesChanged() {
    if (hasRequestedVoice()) warmThenSchedule();
  }
  if (hasRequestedVoice()) {
    warmThenSchedule();
  } else {
    synth.addEventListener("voiceschanged", onVoicesChanged);
    if (detectDeviceGroup() === "ios") {
      const retryAppleVoice = (retryIndex: number) => {
        timer = window.setTimeout(() => {
          if (disposed || scheduled || warming) return;
          let voiceCount = 0;
          try { voiceCount = synth.getVoices().length; } catch { /* logged by hasRequestedVoice */ }
          tossaPerf("apple voice retry", { characterId: warmupVoice.characterId, retryIndex, voiceCount });
          if (hasRequestedVoice()) warmThenSchedule();
          else if (retryIndex < APPLE_VOICE_RETRY_MAX) retryAppleVoice(retryIndex + 1);
          else warmThenSchedule();
        }, APPLE_VOICE_RETRY_INTERVAL_MS);
      };
      retryAppleVoice(1);
    } else {
      // Keep the existing browser-default fallback if discovery never succeeds.
      timer = window.setTimeout(warmThenSchedule, VOICE_READY_TIMEOUT_MS);
    }
    onVoicesChanged();
  }
  return dispose;
}

function createUtterance(text: string, lang: "en" | "ja" | SpeechLocale, characterId?: CharacterId, brightJapanese = false, avoidVoiceCharacterId?: CharacterId, rateMultiplier = 1): SpeechSynthesisUtterance {
  const utter = new SpeechSynthesisUtterance(text);
  const isJapanese = lang === "ja" || lang === "ja-JP";
  const locale: SpeechLocale = isJapanese ? "ja-JP" : "en-US";

  if (characterId) {
    const baseline = selectCharacterVoice(characterId, [], { locale, brightJapanese });
    utter.lang = locale;
    utter.rate = baseline.rate;
    utter.pitch = baseline.pitch;
    try {
      const voices = speechSynthesis.getVoices();
      const avoidedVoice = avoidVoiceCharacterId
        ? selectCharacterVoice(avoidVoiceCharacterId, voices, { locale, brightJapanese }).voice
        : null;
      const selectedWithoutPrevious = selectCharacterVoice(characterId, voices, {
        debug: true,
        locale,
        brightJapanese,
        excludedVoiceNames: avoidedVoice ? [avoidedVoice.name] : [],
      });
      const selected = selectedWithoutPrevious.voice
        ? selectedWithoutPrevious
        : selectCharacterVoice(characterId, voices, { debug: true, locale, brightJapanese });
      if (selected.voice) utter.voice = selected.voice;
      utter.lang = locale === "ja-JP" ? "ja-JP" : selected.lang;
      utter.rate = selected.rate;
      utter.pitch = selected.pitch;
    } catch {
      // Voice discovery/selection must not interrupt the character's speech queue.
    }
    if (!isJapanese) utter.rate *= Math.max(0.8, Math.min(1, rateMultiplier));
    return utter;
  }

  utter.lang = isJapanese ? "ja-JP" : "en-US";
  utter.rate = isJapanese ? 1.3 : 1.0;
  if (!isJapanese) utter.rate *= Math.max(0.8, Math.min(1, rateMultiplier));


  const voices = speechSynthesis.getVoices();
  const englishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  const femaleEnglishVoice = englishVoices.find((voice) =>
    /aria|jenny|zira|samantha|victoria|karen|moira|tessa|female/i.test(voice.name)
  );
  const voice = isJapanese
    ? voices.find((candidate) => candidate.lang.toLowerCase().startsWith("ja"))
    : femaleEnglishVoice ??
      englishVoices.find((candidate) => candidate.lang.toLowerCase() === "en-us") ??
      englishVoices[0];
  if (voice) utter.voice = voice;
  return utter;
}

export function speakEn(
  text: string,
  onEnd?: () => void,
  lang: "en" | "ja" = "en",
  onStart?: () => void,
  onBoundary?: (event: SpeechSynthesisEvent) => void,
  rateMultiplier = 1,
): string | null {
  if (!window.speechSynthesis) return null;
  cancelPendingStart?.("speakEn:replace-pending-start");
  const utter = createUtterance(text, lang, undefined, false, undefined, rateMultiplier);
  const utteranceId = ++utteranceSequence;
  const generation = ++speechGenerationSequence;
  let speakCalledAt = 0;

  utter.onstart = () => {
    setActiveTtsState({ phase: "onstart" });
    writeTtsProbe("onstart", utter, undefined, "speakEn", utteranceId, speakCalledAt);
    tossaPerf("TTS main onstart", mainSpeechDetails(utter, undefined, "speakEn", utteranceId, 0));
    if (onStart) onStart();
  };
  utter.onboundary = (event) => onBoundary?.(event);
  utter.onend = () => {
    setActiveTtsState({ phase: "onend" });
    writeTtsProbe("onend", utter, undefined, "speakEn", utteranceId, speakCalledAt);
    tossaPerf("TTS main onend", mainSpeechDetails(utter, undefined, "speakEn", utteranceId, 0));
    if (onEnd) onEnd();
  };
  utter.onerror = (event) => {
    setActiveTtsState({ phase: `onerror:${event.error}` });
    writeTtsProbe("onerror", utter, undefined, "speakEn", utteranceId, speakCalledAt, event.error);
    tossaPerf("TTS main onerror", { ...mainSpeechDetails(utter, undefined, "speakEn", utteranceId, 0), error: event.error });
    if (onEnd) onEnd();
  };

  cancelSpeechSynthesis(speechSynthesis, {
    reason: "speakEn:reset-native-queue",
    source: "speakEn.before-speak",
  });
  speakCalledAt = performance.now();
  setActiveTtsState({ characterId: null, utteranceId, generation, phase: "speak-called", source: "speakEn" });
  writeTtsProbe("speak", utter, undefined, "speakEn", utteranceId, speakCalledAt);
  tossaPerf("TTS main speak", mainSpeechDetails(utter, undefined, "speakEn", utteranceId, 0));
  speechSynthesis.speak(utter);
  return utter.voice?.name ?? "Browser default voice";
}

export function splitSpeechSentences(text: string): string[] {
  return (text.match(/[^.!?。？！]+(?:[.!?。？！]+["'”’）)\]」』]*|$)|[.!?。？！]+/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => /[^\s.!?。？！"'”’）)\]」』]/.test(sentence));
}

export type SpeechFinishReason = "complete" | "cancel" | "error";

export type SentenceSpeechCallbacks = {
  onFinish?: (reason: SpeechFinishReason) => void;
  onSentenceStart: (sentence: string) => void;
  onSentenceEnd: () => void;
  onBoundary?: (event: SpeechSynthesisEvent) => void;
};

export type SpeechQueueCallbacks = {
  onFinish?: (reason: SpeechFinishReason) => void;
  onItemStart: (item: SpeechQueueItem, index: number) => void;
  onItemEnd: (item: SpeechQueueItem, index: number) => void;
  onBoundary?: (event: SpeechSynthesisEvent) => void;
};

function runPreparedUtterances(
  count: number,
  sequential: boolean,
  speakAt: (index: number, advance: () => void) => void,
): void {
  if (!count) return;
  if (!sequential) {
    for (let index = 0; index < count; index += 1) speakAt(index, () => {});
    return;
  }
  const run = (index: number) => {
    speakAt(index, () => {
      if (index + 1 < count) {
        window.setTimeout(() => run(index + 1), APPLE_UTTERANCE_GAP_MS);
      }
    });
  };
  run(0);
}

export function speakSpeechQueue(items: SpeechQueueItem[], callbacks: SpeechQueueCallbacks, characterId?: CharacterId): CancelSpeech {
  const synth = window.speechSynthesis;
  const generation = ++speechGenerationSequence;
  const sequential = detectDeviceGroup() === "ios";
  const queue = items.filter((item) => item.text.trim());
  if (!synth || queue.length === 0) {
    callbacks.onFinish?.(!synth ? "error" : "complete");
    return () => {};
  }
  let stopped = false;
  let activeIndex = -1;
  let previousOnEndAt: number | null = null;
  const ended = new Set<number>();
  const cancel = (finishReason: SpeechFinishReason = "cancel", requestReason = "speakSpeechQueue:cancel-callback") => {
    if (stopped) return;
    stopped = true;
    disposeStart?.();
    if (cancelPendingStart === pendingCancel) cancelPendingStart = undefined;
    cancelSpeechSynthesis(synth, {
      reason: requestReason,
      source: "speakSpeechQueue.cancel",
      characterId,
      generation,
    });
    if (activeIndex >= 0 && !ended.has(activeIndex)) {
      callbacks.onItemEnd(queue[activeIndex], activeIndex);
    }
    callbacks.onFinish?.(finishReason);
  };

  cancelPendingStart?.("speakSpeechQueue:replace-pending-start");
  cancelSpeechSynthesis(synth, {
    reason: "speakSpeechQueue:reset-native-queue",
    source: "speakSpeechQueue.before-start",
  });
  const pendingCancel: CancelSpeech = (requestReason) => cancel("cancel", requestReason);
  cancelPendingStart = pendingCancel;
  // Resolve the main utterances while the selected voice is warming and
  // settling. Once the delay ends, speak() is the only remaining startup work.
  let preparedUtterances: SpeechSynthesisUtterance[] = [];
  const firstItem = queue[0];
  const disposeStart = deferSpeechStart(synth, {
    locale: firstItem.lang,
    characterId: firstItem.characterId ?? characterId,
    brightJapanese: firstItem.brightJapanese,
    avoidVoiceCharacterId: firstItem.avoidVoiceCharacterId,
  }, () => {
    preparedUtterances = queue.map((item) => createUtterance(
      item.text,
      item.lang,
      item.characterId ?? characterId,
      item.brightJapanese,
      item.avoidVoiceCharacterId,
      item.rateMultiplier,
    ));
  }, () => {
    if (stopped) return;
    if (cancelPendingStart === pendingCancel) cancelPendingStart = undefined;
    try {
      runPreparedUtterances(queue.length, sequential, (index, advance) => {
        if (stopped) return;
        const item = queue[index];
        const utterance = preparedUtterances[index];
        const utteranceId = ++utteranceSequence;
        let speakCalledAt = 0;
        const details = () => ({
          ...mainSpeechDetails(utterance, item.characterId ?? characterId, "speakSpeechQueue", utteranceId, index),
          previousOnEndToSpeakMs: previousOnEndAt === null || speakCalledAt === 0 ? null : Math.round(speakCalledAt - previousOnEndAt),
        });
        utterance.onstart = () => {
          if (stopped || ended.has(index)) return;
          activeIndex = index;
          setActiveTtsState({ phase: "onstart" });
          writeTtsProbe("onstart", utterance, item.characterId ?? characterId, "speakSpeechQueue", utteranceId, speakCalledAt);
          tossaPerf("TTS main onstart", details());
          callbacks.onItemStart(item, index);
        };
        utterance.onboundary = (event) => {
          if (!stopped && activeIndex === index && !ended.has(index)) callbacks.onBoundary?.(event);
        };
        utterance.onend = () => {
          if (stopped || ended.has(index)) return;
          setActiveTtsState({ phase: "onend" });
          writeTtsProbe("onend", utterance, item.characterId ?? characterId, "speakSpeechQueue", utteranceId, speakCalledAt);
          tossaPerf("TTS main onend", details());
          previousOnEndAt = performance.now();
          ended.add(index);
          if (activeIndex === index) {
            activeIndex = -1;
            callbacks.onItemEnd(item, index);
          }
          if (index === queue.length - 1) {
            stopped = true;
            callbacks.onFinish?.("complete");
          } else {
            advance();
          }
        };
        utterance.onerror = (event) => {
          setActiveTtsState({ phase: `onerror:${event.error}` });
          writeTtsProbe("onerror", utterance, item.characterId ?? characterId, "speakSpeechQueue", utteranceId, speakCalledAt, event.error);
          tossaPerf("TTS main onerror", { ...details(), error: event.error });
          cancel("error", "speakSpeechQueue:utterance-onerror");
        };
        speakCalledAt = performance.now();
        setActiveTtsState({
          characterId: item.characterId ?? characterId ?? null,
          utteranceId,
          generation,
          phase: "speak-called",
          source: "speakSpeechQueue",
        });
        writeTtsProbe("speak", utterance, item.characterId ?? characterId, "speakSpeechQueue", utteranceId, speakCalledAt);
        tossaPerf("TTS main speak", details());
        synth.speak(utterance);
      });
    } catch {
      cancel("error", "speakSpeechQueue:start-exception");
    }
  });
  return (requestReason) => cancel("cancel", requestReason);
}

// The native speech queue owns progression. No boundary or delayed JS callback
// starts another sentence. The returned cancel also clears the pending start.
export function speakEnSentences(
  text: string,
  callbacks: SentenceSpeechCallbacks,
  characterId?: CharacterId,
  locale: SpeechLocale = "en-US",
  rateMultiplier = 1,
): CancelSpeech {
  const synth = window.speechSynthesis;
  const generation = ++speechGenerationSequence;
  const sequential = detectDeviceGroup() === "ios";
  const sentences = splitSpeechSentences(text);
  if (!synth || sentences.length === 0) {
    callbacks.onSentenceEnd();
    callbacks.onFinish?.(!synth ? "error" : "complete");
    return () => {};
  }
  let stopped = false;
  let activeIndex = -1;
  let previousOnEndAt: number | null = null;
  const ended = new Set<number>();
  const cancel = (finishReason: SpeechFinishReason = "cancel", requestReason = "speakEnSentences:cancel-callback") => {
    if (stopped) return;
    stopped = true;
    disposeStart?.();
    if (cancelPendingStart === pendingCancel) cancelPendingStart = undefined;
    cancelSpeechSynthesis(synth, {
      reason: requestReason,
      source: "speakEnSentences.cancel",
      characterId,
      generation,
    });
    callbacks.onSentenceEnd();
    callbacks.onFinish?.(finishReason);
  };

  cancelPendingStart?.("speakEnSentences:replace-pending-start");
  cancelSpeechSynthesis(synth, {
    reason: "speakEnSentences:reset-native-queue",
    source: "speakEnSentences.before-start",
  });
  const pendingCancel: CancelSpeech = (requestReason) => cancel("cancel", requestReason);
  cancelPendingStart = pendingCancel;
  // Prepare real speech before warm-up completion so voice initialization does
  // not compete with the first audible word.
  let preparedUtterances: SpeechSynthesisUtterance[] = [];
  const disposeStart = deferSpeechStart(synth, { locale, characterId }, () => {
    preparedUtterances = sentences.map((sentence) => createUtterance(sentence, locale, characterId, false, undefined, rateMultiplier));
  }, () => {
    if (stopped) return;
    if (cancelPendingStart === pendingCancel) cancelPendingStart = undefined;
    try {
      runPreparedUtterances(sentences.length, sequential, (index, advance) => {
        if (stopped) return;
        const sentence = sentences[index];
        const utter = preparedUtterances[index];
        const utteranceId = ++utteranceSequence;
        let speakCalledAt = 0;
        const details = () => ({
          ...mainSpeechDetails(utter, characterId, "speakEnSentences", utteranceId, index),
          previousOnEndToSpeakMs: previousOnEndAt === null || speakCalledAt === 0 ? null : Math.round(speakCalledAt - previousOnEndAt),
        });
        utter.onstart = () => {
          if (stopped || ended.has(index)) return;
          activeIndex = index;
          setActiveTtsState({ phase: "onstart" });
          writeTtsProbe("onstart", utter, characterId, "speakEnSentences", utteranceId, speakCalledAt);
          tossaPerf("TTS main onstart", details());
          callbacks.onSentenceStart(sentence);
        };
        utter.onboundary = (event) => {
          if (!stopped && activeIndex === index && !ended.has(index)) callbacks.onBoundary?.(event);
        };
        utter.onend = () => {
          if (stopped || ended.has(index)) return;
          setActiveTtsState({ phase: "onend" });
          writeTtsProbe("onend", utter, characterId, "speakEnSentences", utteranceId, speakCalledAt);
          tossaPerf("TTS main onend", details());
          previousOnEndAt = performance.now();
          ended.add(index);
          if (activeIndex === index) {
            activeIndex = -1;
            callbacks.onSentenceEnd();
          }
          if (index === sentences.length - 1) {
            stopped = true;
            callbacks.onFinish?.("complete");
          } else {
            advance();
          }
        };
        utter.onerror = (event) => {
          setActiveTtsState({ phase: `onerror:${event.error}` });
          writeTtsProbe("onerror", utter, characterId, "speakEnSentences", utteranceId, speakCalledAt, event.error);
          tossaPerf("TTS main onerror", { ...details(), error: event.error });
          cancel("error", "speakEnSentences:utterance-onerror");
        };
        speakCalledAt = performance.now();
        setActiveTtsState({
          characterId: characterId ?? null,
          utteranceId,
          generation,
          phase: "speak-called",
          source: "speakEnSentences",
        });
        writeTtsProbe("speak", utter, characterId, "speakEnSentences", utteranceId, speakCalledAt);
        tossaPerf("TTS main speak", details());
        synth.speak(utter);
      });
    } catch {
      cancel("error", "speakEnSentences:start-exception");
    }
  });
  return (requestReason) => cancel("cancel", requestReason);
}
