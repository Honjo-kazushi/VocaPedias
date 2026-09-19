import type { CharacterId } from "../characters/characterProfiles";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  speakEnSentences,
  speakSpeechQueue,
  type SpeechFinishReason,
  type SpeechLocale,
  type SpeechQueueItem,
} from "../sound/speakEn";

type MouthStep = {
  open: boolean;
  duration: number;
};

const MOUTH_TIMING = {
  open: [80, 160],
  close: [50, 120],
  wordGap: [30, 70],
  commaGap: [120, 220],
  ellipsisGap: [450, 700],
} as const;

const JAPANESE_MOUTH_TIMING = {
  open: [180, 260],
  close: [120, 220],
  phrasePause: [280, 420],
} as const;

// [minimum letters, maximum letters, minimum ms, maximum ms]
const FINAL_WORD_CLOSE_TIMING = {
  short: [1, 3, 140, 200],
  normal: [4, 7, 200, 300],
  long: [8, 14, 280, 400],
} as const;

function finalWordCloseDelay(word: string): number {
  const length = Array.from(word.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const [minLength, maxLength, minMs, maxMs] = length <= 3
    ? FINAL_WORD_CLOSE_TIMING.short
    : length <= 7 ? FINAL_WORD_CLOSE_TIMING.normal : FINAL_WORD_CLOSE_TIMING.long;
  const fraction = Math.max(0, Math.min(1, (length - minLength) / (maxLength - minLength)));
  return Math.round(minMs + fraction * (maxMs - minMs));
}

function randomBetween([min, max]: readonly [number, number]): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function setNeutralMouth(image: HTMLImageElement | null, open: boolean) {
  if (!image) return;
  const source = open ? image.dataset.openSrc : image.dataset.closedSrc;
  if (source && image.src !== new URL(source, window.location.href).href) image.src = source;
}

function mouthWords(text: string) {
  return Array.from(text.matchAll(/\S+/g), (match) => ({ text: match[0], charIndex: match.index }));
}

function buildMouthTimeline(text: string): MouthStep[] {
  return mouthWords(text).flatMap(({ text: word }) => {
    const letterCount = (word.match(/[a-z]/gi) ?? []).length;
    const movementRange: readonly [number, number] = letterCount <= 3
      ? [1, 2]
      : letterCount <= 6
        ? [2, 3]
        : [3, 4];
    const movements = randomBetween(movementRange);
    const steps: MouthStep[] = [];

    for (let index = 0; index < movements; index += 1) {
      steps.push({ open: true, duration: randomBetween(MOUTH_TIMING.open) });
      steps.push({ open: false, duration: randomBetween(MOUTH_TIMING.close) });
    }

    const gap = /(?:\.{3}|…+)["')\]]*$/.test(word)
      ? MOUTH_TIMING.ellipsisGap
      : /[,;:]+["')\]]*$/.test(word)
        ? MOUTH_TIMING.commaGap
        : MOUTH_TIMING.wordGap;
    steps.push({ open: false, duration: randomBetween(gap) });
    return steps;
  });
}

// Match the timeline's whitespace-delimited words without losing UTF-16 offsets.
function mouthWordAnchors(text: string, timeline: MouthStep[]) {
  let stepIndex = 0;
  let position = 0;
  return mouthWords(text).map((word) => {
    const anchor = { ...word, endCharIndex: word.charIndex + word.text.length, stepIndex, position };
    // Each word contains open/close pairs followed by one extra closed gap.
    while (timeline[stepIndex]?.open) {
      position += timeline[stepIndex++].duration;
      position += timeline[stepIndex++].duration;
    }
    position += timeline[stepIndex++].duration;
    return anchor;
  });
}

export function useCharacterSpeech(characterId?: CharacterId, speechLocale: SpeechLocale = "en-US") {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechTokenRef = useRef(0);
  const mouthGenerationRef = useRef(0);
  const mouthTimerRef = useRef<number | null>(null);
  const finalCloseTimerRef = useRef<number | null>(null);
  const cancelSpeechRef = useRef<(() => void) | null>(null);
  const mouthImageRef = useRef<HTMLImageElement | null>(null);
  const mouthBoundaryRef = useRef<((event: SpeechSynthesisEvent) => void) | null>(null);
  const mountedRef = useRef(false);

  const stopMouthTimeline = useCallback(() => {
    mouthBoundaryRef.current = null;
    mouthGenerationRef.current += 1;
    if (finalCloseTimerRef.current !== null) {
      window.clearTimeout(finalCloseTimerRef.current);
      finalCloseTimerRef.current = null;
    }
    if (mouthTimerRef.current !== null) {
      window.clearTimeout(mouthTimerRef.current);
      mouthTimerRef.current = null;
    }
    setNeutralMouth(mouthImageRef.current, false);
    setIsSpeaking(false);
  }, []);

  const startMouthTimeline = useCallback((text: string, locale: SpeechLocale) => {
    const generation = ++mouthGenerationRef.current;
    if (finalCloseTimerRef.current !== null) {
      window.clearTimeout(finalCloseTimerRef.current);
      finalCloseTimerRef.current = null;
    }
    if (mouthTimerRef.current !== null) {
      window.clearTimeout(mouthTimerRef.current);
      mouthTimerRef.current = null;
    }
    const timeline = buildMouthTimeline(text);
    const anchors = mouthWordAnchors(text, timeline);
    // Match actual word characters, excluding closing quotes/punctuation and
    // trailing whitespace. Indices use the same UTF-16 offsets as charIndex.
    const finalWordCandidate = Array.from(text.matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)).at(-1);
    // Japanese word boundaries are often reported as broad phrase ranges. If
    // that range begins at zero, treating it as the final word closes the mouth
    // a few hundred milliseconds into a still-playing Japanese utterance.
    // Keep the tuned final-word close behavior for English; Japanese closes on
    // utterance.onend and continues through the existing fallback timeline.
    const finalWord = finalWordCandidate && /[a-z]/i.test(finalWordCandidate[0])
      ? finalWordCandidate
      : undefined;
    let finalCloseScheduled = false;
    let position = 0;
    let stepStartedAt = performance.now();
    let stepDuration = 0;
    let scheduledDuration = 0;
    let correction = 0;
    let timelineRate = 1;
    const boundarySamples: { time: number; position: number }[] = [];
    let lastCharIndex = -1;
    let stepIndex = 0;
    let fallbackOpen = true;
    let japaneseMovementsUntilPause = randomBetween([3, 6]);
    mouthBoundaryRef.current = (event) => {
      if (!mountedRef.current || mouthGenerationRef.current !== generation) return;
      if (event.name !== "word" || !Number.isInteger(event.charIndex) || event.charIndex < 0) return;
      // Arm independently of timeline progress, including its fallback steps.
      // Duplicate or intra-word boundaries must never extend this deadline.
      if (!finalCloseScheduled && finalWord && event.charIndex >= finalWord.index &&
          event.charIndex < finalWord.index + finalWord[0].length) {
        finalCloseScheduled = true;
        finalCloseTimerRef.current = window.setTimeout(() => {
          if (!mountedRef.current || mouthGenerationRef.current !== generation) return;
          finalCloseTimerRef.current = null;
          mouthGenerationRef.current += 1;
          mouthBoundaryRef.current = null;
          if (mouthTimerRef.current !== null) {
            window.clearTimeout(mouthTimerRef.current);
            mouthTimerRef.current = null;
          }
          setNeutralMouth(mouthImageRef.current, false);
          // The utterance is still active; onend owns final speech cleanup.
        }, finalWordCloseDelay(finalWord[0]));
      }
      const lastBoundaryAt = performance.now();
      if (event.name !== "word" || !Number.isInteger(event.charIndex) ||
          event.charIndex <= lastCharIndex || stepIndex > timeline.length) return;
      const anchor = anchors.find((word) =>
        word.charIndex === event.charIndex
      );
      // Ignore sentence, duplicate, and intra-token boundaries (e.g. contractions).
      if (!anchor) return;
      lastCharIndex = event.charIndex;
      // A one-step phase correction cannot compensate for a consistently longer
      // generated timeline. Learn its playback rate across several spoken words,
      // including punctuation gaps, rather than reacting to one word's duration.
      boundarySamples.push({ time: lastBoundaryAt, position: anchor.position });
      if (boundarySamples.length > 6) boundarySamples.shift();
      const firstSample = boundarySamples[0];
      const sampleDuration = lastBoundaryAt - firstSample.time;
      if (boundarySamples.length >= 3 && sampleDuration >= 500) {
        const measuredRate = (anchor.position - firstSample.position) / sampleDuration;
        const targetRate = Math.max(0.5, Math.min(2.5, measuredRate));
        timelineRate += Math.max(-0.15, Math.min(0.15, (targetRate - timelineRate) * 0.3));
      }
      const fraction = scheduledDuration > 0
        ? Math.min(1, Math.max(0, (performance.now() - stepStartedAt) / scheduledDuration))
        : 0;
      // Convert timeline distance to real milliseconds at the learned rate.
      const drift = (position + fraction * stepDuration - anchor.position) / timelineRate;
      // Replace rather than accumulate: one bounded adjustment to the next step.
      correction = Math.abs(drift) < 25 ? 0 : Math.max(-40, Math.min(40, drift * 0.2));
    };
    setIsSpeaking(true);

    const runStep = () => {
      if (!mountedRef.current || mouthGenerationRef.current !== generation) return;
      mouthTimerRef.current = null;
      const timelineStep = locale === "ja-JP" ? undefined : timeline[stepIndex];
      const japanesePause = locale === "ja-JP" && !fallbackOpen && japaneseMovementsUntilPause === 0;
      const step = timelineStep ?? {
        open: fallbackOpen,
        duration: randomBetween(
          locale === "ja-JP"
            ? japanesePause ? JAPANESE_MOUTH_TIMING.phrasePause : fallbackOpen ? JAPANESE_MOUTH_TIMING.open : JAPANESE_MOUTH_TIMING.close
            : fallbackOpen ? [100, 150] : [70, 120]
        ),
      };
      setNeutralMouth(mouthImageRef.current, step.open);
      position += stepDuration;
      stepDuration = step.duration;
      stepStartedAt = performance.now();
      // Keep every randomized step and gap; only adjust the clock's speed.
      // The post-timeline fallback retains its original natural timing.
      scheduledDuration = Math.max(30,
        step.duration / (timelineStep ? timelineRate : 1) + correction
      );
      correction = 0;
      if (!timelineStep) {
        if (locale === "ja-JP" && !fallbackOpen) {
          if (japanesePause) japaneseMovementsUntilPause = randomBetween([3, 6]);
          else japaneseMovementsUntilPause -= 1;
        }
        fallbackOpen = !fallbackOpen;
      }
      stepIndex += 1;
      mouthTimerRef.current = window.setTimeout(runStep, scheduledDuration);
    };

    runStep();
  }, []);

  const speakAssistantMessage = useCallback((text: string, callbacks?: { onStart?: () => void; onFinish?: (reason: SpeechFinishReason) => void; rateMultiplier?: number }) => {
    if (!mountedRef.current) return;
    cancelSpeechRef.current?.();
    const speechToken = ++speechTokenRef.current;
    stopMouthTimeline();
    let started = false;
    cancelSpeechRef.current = speakEnSentences(text, {
      onFinish: (reason) => {
        if (mountedRef.current && speechTokenRef.current === speechToken) {
          stopMouthTimeline();
          callbacks?.onFinish?.(reason);
        }
      },
      onSentenceStart: (sentence) => {
        if (mountedRef.current && speechTokenRef.current === speechToken) {
          if (!started) {
            started = true;
            callbacks?.onStart?.();
          }
          startMouthTimeline(sentence, speechLocale);
        }
      },
      onSentenceEnd: () => {
        if (mountedRef.current && speechTokenRef.current === speechToken) {
          stopMouthTimeline();
        }
      },
      onBoundary: (event) => {
        if (mountedRef.current && speechTokenRef.current === speechToken) {
          mouthBoundaryRef.current?.(event);
        }
      },
    }, characterId, speechLocale, callbacks?.rateMultiplier);
  }, [characterId, speechLocale, startMouthTimeline, stopMouthTimeline]);

  const speakCharacterItems = useCallback((
    items: SpeechQueueItem[],
    callbacks?: {
      onItemStart?: (item: SpeechQueueItem, index: number) => void;
      onFinish?: (reason: SpeechFinishReason) => void;
    },
    speechCharacterId?: CharacterId
  ) => {
    if (!mountedRef.current) return;
    cancelSpeechRef.current?.();
    const speechToken = ++speechTokenRef.current;
    stopMouthTimeline();
    cancelSpeechRef.current = speakSpeechQueue(items, {
      onItemStart: (item, index) => {
        if (!mountedRef.current || speechTokenRef.current !== speechToken) return;
        callbacks?.onItemStart?.(item, index);
        startMouthTimeline(item.text, item.lang);
      },
      onItemEnd: () => {
        if (mountedRef.current && speechTokenRef.current === speechToken) stopMouthTimeline();
      },
      onBoundary: (event) => {
        if (mountedRef.current && speechTokenRef.current === speechToken) mouthBoundaryRef.current?.(event);
      },
      onFinish: (reason) => {
        if (!mountedRef.current || speechTokenRef.current !== speechToken) return;
        stopMouthTimeline();
        callbacks?.onFinish?.(reason);
      },
    }, speechCharacterId);
  }, [startMouthTimeline, stopMouthTimeline]);

  const stopAssistantSpeech = useCallback(() => {
    speechTokenRef.current += 1;
    cancelSpeechRef.current?.();
    cancelSpeechRef.current = null;
    stopMouthTimeline();
  }, [stopMouthTimeline]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      mouthGenerationRef.current += 1;
      mouthBoundaryRef.current = null;
      if (finalCloseTimerRef.current !== null) {
        window.clearTimeout(finalCloseTimerRef.current);
        finalCloseTimerRef.current = null;
      }
      if (mouthTimerRef.current !== null) {
        window.clearTimeout(mouthTimerRef.current);
        mouthTimerRef.current = null;
      }
      speechTokenRef.current += 1;
      cancelSpeechRef.current?.();
      cancelSpeechRef.current = null;
    };
  }, []);

  // Emma needs this when the intro is replaced by the speaking avatar. Keep the
  // callback character-specific as well: React reuses the same <img> when Emma
  // changes to a partner, so a stable callback would not be attached again and
  // the partner's newly assigned open frame would never be preloaded.
  const mouthOpenRef = useCallback((image: HTMLImageElement | null) => {
    if (image && characterId && !image.closest(`.avatar-${characterId}`)) return;
    mouthImageRef.current = image;
    const openSource = image?.dataset.openSrc;
    if (!openSource) return;
    const preload = new Image();
    preload.src = openSource;
    void preload.decode?.().catch(() => {});
  }, [characterId]);

  return { isSpeaking, mouthOpenRef, speakAssistantMessage, speakCharacterItems, stopAssistantSpeech };
}
