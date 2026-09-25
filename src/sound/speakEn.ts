import { CHARACTER_PROFILES, type CharacterId, type CharacterProfile } from "../characters/characterProfiles";
import { tossaPerf as logTossaPerf } from "../debug/tossaPerf";
import { selectCharacterVoice } from "./selectCharacterVoice";

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
    textLength: utterance.text.length,
    lang: utterance.lang,
    ...voiceDetails(utterance.voice),
    rate: utterance.rate,
    pitch: utterance.pitch,
    volume: utterance.volume,
  };
}

export type SpeechLocale = "ja-JP" | "en-US";
export type SpeechQueueItem = { lang: SpeechLocale; text: string; brightJapanese?: boolean; characterId?: CharacterId; avoidVoiceCharacterId?: CharacterId; rateMultiplier?: number };

// cancel() stops the native queue, but the voice engine may still be settling.
const SPEECH_START_DELAY_MS = 250;
const VOICE_READY_TIMEOUT_MS = 1000;
const SPEECH_WARMUP_TIMEOUT_MS = 1000;
let cancelPendingStart: (() => void) | undefined;
const warmedVoiceKeys = new Set<string>();

type WarmupVoice = {
  locale: SpeechLocale;
  characterId?: CharacterId;
  brightJapanese?: boolean;
  avoidVoiceCharacterId?: CharacterId;
};

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
      warmup.volume = 0;
      tossaPerf("warmup start", { kind: "warmup", characterId: warmupVoice.characterId, voiceKey: key, ...voiceDetails(warmup.voice), lang: warmup.lang });
      let finished = false;
      const finishWarmup = (outcome: "onend" | "onerror" | "timeout") => {
        if (disposed || finished) return;
        finished = true;
        warming = false;
        warmedVoiceKeys.add(key);
        tossaPerf(`warmup ${outcome}`, { kind: "warmup", characterId: warmupVoice.characterId, voiceKey: key });
        window.clearTimeout(timer);
        if (warmup) {
          warmup.onend = null;
          warmup.onerror = null;
        }
        scheduleStart();
      };
      warmup.onend = () => finishWarmup("onend");
      warmup.onerror = () => finishWarmup("onerror");
      timer = window.setTimeout(() => finishWarmup("timeout"), SPEECH_WARMUP_TIMEOUT_MS);
      tossaPerf("TTS warmup speak", { kind: "warmup", characterId: warmupVoice.characterId, voiceKey: key, textLength: warmup.text.length, ...voiceDetails(warmup.voice), lang: warmup.lang, rate: warmup.rate, pitch: warmup.pitch, volume: warmup.volume });
      synth.speak(warmup);
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
    // Keep the existing browser-default fallback if discovery never succeeds.
    timer = window.setTimeout(warmThenSchedule, VOICE_READY_TIMEOUT_MS);
    onVoicesChanged();
  }
  return dispose;
}

function createUtterance(text: string, lang: "en" | "ja" | SpeechLocale, characterId?: CharacterId, brightJapanese = false, avoidVoiceCharacterId?: CharacterId, rateMultiplier = 1): SpeechSynthesisUtterance {
  const utter = new SpeechSynthesisUtterance(text);
  const isJapanese = lang === "ja" || lang === "ja-JP";
  const locale: SpeechLocale = isJapanese ? "ja-JP" : "en-US";

  if (characterId) {
    const profile: CharacterProfile = CHARACTER_PROFILES[characterId];
    const preferences = locale === "ja-JP"
      ? brightJapanese
        ? profile.brightJapaneseVoicePreferences ?? profile.japaneseVoicePreferences ?? profile.voicePreferences
        : profile.japaneseVoicePreferences ?? profile.voicePreferences
      : profile.voicePreferences;
    const fallback = preferences.fallback;
    utter.lang = locale;
    utter.rate = fallback.rate;
    utter.pitch = fallback.pitch;
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
  onBoundary?: (event: SpeechSynthesisEvent) => void
): string | null {
  if (!window.speechSynthesis) return null;
  cancelPendingStart?.();
  const utter = createUtterance(text, lang);

  utter.onstart = () => {
    tossaPerf("TTS main onstart", mainSpeechDetails(utter, undefined, "speakEn", utteranceId, 0));
    if (onStart) onStart();
  };
  utter.onboundary = (event) => onBoundary?.(event);
  utter.onend = () => {
    tossaPerf("TTS main onend", mainSpeechDetails(utter, undefined, "speakEn", utteranceId, 0));
    if (onEnd) onEnd();
  };
  utter.onerror = (event) => {
    tossaPerf("TTS main onerror", { ...mainSpeechDetails(utter, undefined, "speakEn", utteranceId, 0), error: event.error });
    if (onEnd) onEnd();
  };

  speechSynthesis.cancel();
  const utteranceId = ++utteranceSequence;
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

export function speakSpeechQueue(items: SpeechQueueItem[], callbacks: SpeechQueueCallbacks, characterId?: CharacterId): () => void {
  const synth = window.speechSynthesis;
  const queue = items.filter((item) => item.text.trim());
  if (!synth || queue.length === 0) {
    callbacks.onFinish?.(!synth ? "error" : "complete");
    return () => {};
  }
  let stopped = false;
  let activeIndex = -1;
  const ended = new Set<number>();
  const cancel = (reason: SpeechFinishReason = "cancel") => {
    if (stopped) return;
    stopped = true;
    disposeStart?.();
    if (cancelPendingStart === cancel) cancelPendingStart = undefined;
    synth.cancel();
    if (activeIndex >= 0 && !ended.has(activeIndex)) {
      callbacks.onItemEnd(queue[activeIndex], activeIndex);
    }
    callbacks.onFinish?.(reason);
  };

  cancelPendingStart?.();
  synth.cancel();
  cancelPendingStart = cancel;
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
    if (cancelPendingStart === cancel) cancelPendingStart = undefined;
    try {
      queue.forEach((item, index) => {
        if (stopped) return;
        const utterance = preparedUtterances[index];
        const utteranceId = ++utteranceSequence;
        const details = () => mainSpeechDetails(utterance, item.characterId ?? characterId, "speakSpeechQueue", utteranceId, index);
        utterance.onstart = () => {
          if (stopped || ended.has(index)) return;
          activeIndex = index;
          tossaPerf("TTS main onstart", details());
          callbacks.onItemStart(item, index);
        };
        utterance.onboundary = (event) => {
          if (!stopped && activeIndex === index && !ended.has(index)) callbacks.onBoundary?.(event);
        };
        utterance.onend = () => {
          if (stopped || ended.has(index)) return;
          tossaPerf("TTS main onend", details());
          ended.add(index);
          if (activeIndex === index) {
            activeIndex = -1;
            callbacks.onItemEnd(item, index);
          }
          if (index === queue.length - 1) {
            stopped = true;
            callbacks.onFinish?.("complete");
          }
        };
        utterance.onerror = (event) => {
          tossaPerf("TTS main onerror", { ...details(), error: event.error });
          cancel("error");
        };
        tossaPerf("TTS main speak", details());
        synth.speak(utterance);
      });
    } catch {
      cancel("error");
    }
  });
  return cancel;
}

// The native speech queue owns progression. No boundary or delayed JS callback
// starts another sentence. The returned cancel also clears the pending start.
export function speakEnSentences(
  text: string,
  callbacks: SentenceSpeechCallbacks,
  characterId?: CharacterId,
  locale: SpeechLocale = "en-US",
  rateMultiplier = 1,
): () => void {
  const synth = window.speechSynthesis;
  const sentences = splitSpeechSentences(text);
  if (!synth || sentences.length === 0) {
    callbacks.onSentenceEnd();
    callbacks.onFinish?.(!synth ? "error" : "complete");
    return () => {};
  }
  let stopped = false;
  let activeIndex = -1;
  const ended = new Set<number>();
  const cancel = (reason: SpeechFinishReason = "cancel") => {
    if (stopped) return;
    stopped = true;
    disposeStart?.();
    if (cancelPendingStart === cancel) cancelPendingStart = undefined;
    synth.cancel();
    callbacks.onSentenceEnd();
    callbacks.onFinish?.(reason);
  };

  cancelPendingStart?.();
  synth.cancel();
  cancelPendingStart = cancel;
  // Prepare real speech before warm-up completion so voice initialization does
  // not compete with the first audible word.
  let preparedUtterances: SpeechSynthesisUtterance[] = [];
  const disposeStart = deferSpeechStart(synth, { locale, characterId }, () => {
    preparedUtterances = sentences.map((sentence) => createUtterance(sentence, locale, characterId, false, undefined, rateMultiplier));
  }, () => {
    if (stopped) return;
    if (cancelPendingStart === cancel) cancelPendingStart = undefined;
    try {
      sentences.forEach((sentence, index) => {
        if (stopped) return;
        const utter = preparedUtterances[index];
        const utteranceId = ++utteranceSequence;
        const details = () => mainSpeechDetails(utter, characterId, "speakEnSentences", utteranceId, index);
        utter.onstart = () => {
          if (stopped || ended.has(index)) return;
          activeIndex = index;
          tossaPerf("TTS main onstart", details());
          callbacks.onSentenceStart(sentence);
        };
        utter.onboundary = (event) => {
          if (!stopped && activeIndex === index && !ended.has(index)) callbacks.onBoundary?.(event);
        };
        utter.onend = () => {
          if (stopped || ended.has(index)) return;
          tossaPerf("TTS main onend", details());
          ended.add(index);
          if (activeIndex === index) {
            activeIndex = -1;
            callbacks.onSentenceEnd();
          }
          if (index === sentences.length - 1) {
            stopped = true;
            callbacks.onFinish?.("complete");
          }
        };
        utter.onerror = (event) => {
          tossaPerf("TTS main onerror", { ...details(), error: event.error });
          cancel("error");
        };
        tossaPerf("TTS main speak", details());
        synth.speak(utter);
      });
    } catch {
      cancel("error");
    }
  });
  return cancel;
}
