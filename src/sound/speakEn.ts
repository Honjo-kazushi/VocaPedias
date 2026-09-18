import { CHARACTER_PROFILES, type CharacterId, type CharacterProfile } from "../characters/characterProfiles";
import { selectCharacterVoice } from "./selectCharacterVoice";

export type SpeechLocale = "ja-JP" | "en-US";
export type SpeechQueueItem = { lang: SpeechLocale; text: string; brightJapanese?: boolean; characterId?: CharacterId; avoidVoiceCharacterId?: CharacterId };

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
        warming = false;
        warmup = undefined;
        scheduleStart();
        return;
      }
      warmup.volume = 0;
      let finished = false;
      const finishWarmup = () => {
        if (disposed || finished) return;
        finished = true;
        warming = false;
        warmedVoiceKeys.add(key);
        window.clearTimeout(timer);
        if (warmup) {
          warmup.onend = null;
          warmup.onerror = null;
        }
        scheduleStart();
      };
      warmup.onend = finishWarmup;
      warmup.onerror = finishWarmup;
      timer = window.setTimeout(finishWarmup, SPEECH_WARMUP_TIMEOUT_MS);
      synth.speak(warmup);
    } catch {
      // Warm-up is best-effort; never prevent the real utterance.
      scheduleStart();
    }
  };
  const hasRequestedVoice = () => {
    try {
      const prefix = warmupVoice.locale === "ja-JP" ? "ja" : "en";
      return synth.getVoices().some((voice) => new RegExp(`^${prefix}(?:[-_]|$)`, "i").test(voice.lang));
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

function createUtterance(text: string, lang: "en" | "ja" | SpeechLocale, characterId?: CharacterId, brightJapanese = false, avoidVoiceCharacterId?: CharacterId): SpeechSynthesisUtterance {
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
    if (onStart) onStart();
  };
  utter.onboundary = (event) => onBoundary?.(event);
  utter.onend = () => {
    if (onEnd) onEnd();
  };
  utter.onerror = () => {
    if (onEnd) onEnd();
  };

  speechSynthesis.cancel();
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
    ));
  }, () => {
    if (stopped) return;
    if (cancelPendingStart === cancel) cancelPendingStart = undefined;
    try {
      queue.forEach((item, index) => {
        if (stopped) return;
        const utterance = preparedUtterances[index];
        utterance.onstart = () => {
          if (stopped || ended.has(index)) return;
          activeIndex = index;
          callbacks.onItemStart(item, index);
        };
        utterance.onboundary = (event) => {
          if (!stopped && activeIndex === index && !ended.has(index)) callbacks.onBoundary?.(event);
        };
        utterance.onend = () => {
          if (stopped || ended.has(index)) return;
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
        utterance.onerror = () => cancel("error");
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
    preparedUtterances = sentences.map((sentence) => createUtterance(sentence, locale, characterId));
  }, () => {
    if (stopped) return;
    if (cancelPendingStart === cancel) cancelPendingStart = undefined;
    try {
      sentences.forEach((sentence, index) => {
        if (stopped) return;
        const utter = preparedUtterances[index];
        utter.onstart = () => {
          if (stopped || ended.has(index)) return;
          activeIndex = index;
          callbacks.onSentenceStart(sentence);
        };
        utter.onboundary = (event) => {
          if (!stopped && activeIndex === index && !ended.has(index)) callbacks.onBoundary?.(event);
        };
        utter.onend = () => {
          if (stopped || ended.has(index)) return;
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
        utter.onerror = () => cancel("error");
        synth.speak(utter);
      });
    } catch {
      cancel("error");
    }
  });
  return cancel;
}
