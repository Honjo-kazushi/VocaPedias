import { useCallback, useEffect, useRef, useState } from "react";
import { mergeRecognitionResults } from "../ai/conversationTypes";
import { tossaPerf } from "../debug/tossaPerf";
import { APPLE_ERROR7_MAX_RETRIES, APPLE_ERROR7_RETRY_DELAY_MS, isAppleAssistantError7 } from "../ai/speechRecognitionRetry";

type Callbacks = {
  onStart: () => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onActivity?: (kind: "audio" | "sound" | "speech" | "result") => void;
  onFinalTranscript?: (text: string) => void;
  onDebug?: (sessionId: number, event: string, details: Record<string, unknown>) => void;
  onTranscript: (text: string, details: { hasFinal: boolean; hasInterim: boolean }) => void;
  onEnd: (text: string, details: { final: string; interim: string }) => void;
  onCancel: () => void;
  onError: (error: string) => void;
};

export const SPEECH_SILENCE_TIMEOUT_MS = 3000;
export const IOS_DEAD_START_TIMEOUT_MS = 11_000;
export const IOS_DEAD_START_RETRY_TIMEOUT_MS = 16_000;
export const IOS_DEAD_START_RESTART_DELAY_MS = 200;
export const IOS_DEAD_START_MAX_RETRIES = 2;

function deviceGroup(): "ios/fallback" | "android" | "desktop" {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios/fallback";
  return /Android/i.test(ua) ? "android" : "desktop";
}

// Each start owns its callbacks and transcript. Late events cannot touch a later session.
export function useUserSpeechRecognition() {
  const [active, setActive] = useState(false);
  const sessionRef = useRef(0);
  const recognitionRef = useRef<AppSpeechRecognition | null>(null);
  const finalTranscriptRef = useRef("");
  const interimTranscriptRef = useRef("");
  const silenceTimerRef = useRef<number | null>(null);
  const error7RetryTimerRef = useRef<number | null>(null);
  const deadStartWatchdogTimerRef = useRef<number | null>(null);
  const deadStartRestartTimerRef = useRef<number | null>(null);
  const cancelCallbackRef = useRef<(() => void) | null>(null);
  const ignoreRecognitionDuringMiyabiRef = useRef(false);
  const lifecycleRef = useRef<"idle" | "starting" | "running" | "stopping" | "aborting">("idle");
  const dispose = useCallback(() => {
    ignoreRecognitionDuringMiyabiRef.current = false;
    sessionRef.current += 1;
    if (silenceTimerRef.current !== null) window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
    if (error7RetryTimerRef.current !== null) window.clearTimeout(error7RetryTimerRef.current);
    error7RetryTimerRef.current = null;
    if (deadStartWatchdogTimerRef.current !== null) window.clearTimeout(deadStartWatchdogTimerRef.current);
    deadStartWatchdogTimerRef.current = null;
    if (deadStartRestartTimerRef.current !== null) window.clearTimeout(deadStartRestartTimerRef.current);
    deadStartRestartTimerRef.current = null;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    cancelCallbackRef.current = null;
    if (recognition) {
      recognition.onstart = recognition.onaudiostart = recognition.onaudioend = recognition.onspeechstart = recognition.onspeechend = recognition.onsoundstart = recognition.onsoundend = recognition.onresult = recognition.onend = recognition.onerror = null;
      lifecycleRef.current = "aborting";
      tossaPerf("SPEECH", "recognition abort", { deviceGroup: deviceGroup() });
      try { recognition.abort(); } catch { /* Already stopped. */ }
    }
    lifecycleRef.current = "idle";
  }, []);
  const cancel = useCallback(() => {
    const notify = cancelCallbackRef.current;
    dispose();
    setActive(false);
    notify?.();
  }, [dispose]);
  const getSessionId = useCallback(() => sessionRef.current, []);
  const setIgnoreRecognitionDuringMiyabi = useCallback((ignored: boolean) => {
    ignoreRecognitionDuringMiyabiRef.current = ignored;
    if (ignored) {
      if (silenceTimerRef.current !== null) window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
      if (deadStartWatchdogTimerRef.current !== null) window.clearTimeout(deadStartWatchdogTimerRef.current);
      deadStartWatchdogTimerRef.current = null;
      if (deadStartRestartTimerRef.current !== null) window.clearTimeout(deadStartRestartTimerRef.current);
      deadStartRestartTimerRef.current = null;
    }
  }, []);
  const finish = useCallback(() => {
    if (silenceTimerRef.current !== null) window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
    if (recognitionRef.current) {
      lifecycleRef.current = "stopping";
      tossaPerf("SPEECH", "recognition stop", { deviceGroup: deviceGroup() });
      try { recognitionRef.current.stop(); } catch { /* Already stopped. */ }
    }
  }, []);
  const start = useCallback((callbacks: Callbacks, lang: "en-US" | "ja-JP" = "en-US") => {
    const group = deviceGroup();
    tossaPerf("SPEECH", "recognition start requested", { deviceGroup: group, lifecycle: lifecycleRef.current, lang });
    if (ignoreRecognitionDuringMiyabiRef.current) {
      tossaPerf("SPEECH", "recognition start blocked", { deviceGroup: group, lifecycle: lifecycleRef.current, reason: "miyabi-tts" });
      return;
    }
    if (recognitionRef.current) {
      tossaPerf("SPEECH", "recognition start blocked", { deviceGroup: group, lifecycle: lifecycleRef.current, reason: "existing-instance" });
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      callbacks.onError("unsupported");
      return;
    }
    const startAttempt = (error7RetryCount: number, deadStartRetryCount = 0) => {
    const session = ++sessionRef.current;
    const current = () => sessionRef.current === session;
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    let speechEndedAt: number | null = null;
    let recognitionStartedAt: number | null = null;
    let lastSpeechEvent = "none";
    try {
      const recognition = new SR();
      recognitionRef.current = recognition;
      cancelCallbackRef.current = callbacks.onCancel;
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;
      const debug = (event: string, details: Record<string, unknown> = {}) => {
        if (import.meta.env.DEV) console.debug("[TossaSpeak recognition]", { timestamp: performance.now(), session, event, ...details });
        callbacks.onDebug?.(session, event, details);
      };
      const clearDeadStartWatchdog = (event: string) => {
        lastSpeechEvent = event;
        if (deadStartWatchdogTimerRef.current !== null) window.clearTimeout(deadStartWatchdogTimerRef.current);
        deadStartWatchdogTimerRef.current = null;
      };
      const armDeadStartWatchdog = (trigger: "onstart" | "audio-start") => {
        if (ignoreRecognitionDuringMiyabiRef.current || group !== "ios/fallback" || deadStartRetryCount >= IOS_DEAD_START_MAX_RETRIES || lastSpeechEvent !== "none") return;
        if (deadStartWatchdogTimerRef.current !== null) window.clearTimeout(deadStartWatchdogTimerRef.current);
        const timeoutMs = deadStartRetryCount === 0 ? IOS_DEAD_START_TIMEOUT_MS : IOS_DEAD_START_RETRY_TIMEOUT_MS;
        tossaPerf("SPEECH", "recognition watchdog armed", { deviceGroup: group, session, trigger, timeoutMs, retryCount: deadStartRetryCount, lastSpeechEvent });
        debug("recognition watchdog armed", { deviceGroup: group, trigger, timeoutMs, retryCount: deadStartRetryCount, lastSpeechEvent });
        deadStartWatchdogTimerRef.current = window.setTimeout(() => {
          if (!current() || lastSpeechEvent !== "none") return;
          deadStartWatchdogTimerRef.current = null;
          const elapsedSinceOnstartMs = recognitionStartedAt === null ? null : Math.max(0, performance.now() - recognitionStartedAt);
          tossaPerf("SPEECH", "watchdog timeout", { deviceGroup: group, session, retryCount: deadStartRetryCount, lastSpeechEvent, elapsedSinceOnstartMs });
          debug("watchdog timeout", { deviceGroup: group, retryCount: deadStartRetryCount, lastSpeechEvent, elapsedSinceOnstartMs });
          sessionRef.current += 1;
          recognition.onstart = recognition.onaudiostart = recognition.onaudioend = recognition.onspeechstart = recognition.onspeechend = recognition.onsoundstart = recognition.onsoundend = recognition.onresult = recognition.onend = recognition.onerror = null;
          if (recognitionRef.current === recognition) recognitionRef.current = null;
          lifecycleRef.current = "aborting";
          try { recognition.abort(); } catch { /* Already stopped. */ }
          lifecycleRef.current = "idle";
          const nextRetryCount = deadStartRetryCount + 1;
          tossaPerf("SPEECH", "watchdog restart", { deviceGroup: group, session, retryCount: nextRetryCount, lastSpeechEvent, delayMs: IOS_DEAD_START_RESTART_DELAY_MS });
          debug("watchdog restart", { deviceGroup: group, retryCount: nextRetryCount, lastSpeechEvent, delayMs: IOS_DEAD_START_RESTART_DELAY_MS });
          deadStartRestartTimerRef.current = window.setTimeout(() => {
            deadStartRestartTimerRef.current = null;
            if (ignoreRecognitionDuringMiyabiRef.current) return;
            startAttempt(error7RetryCount, nextRetryCount);
          }, IOS_DEAD_START_RESTART_DELAY_MS);
        }, timeoutMs);
      };
      const armSilenceTimer = () => {
        if (silenceTimerRef.current !== null) window.clearTimeout(silenceTimerRef.current);
        debug("silence timer start/reset", { durationMs: SPEECH_SILENCE_TIMEOUT_MS });
        silenceTimerRef.current = window.setTimeout(() => {
          if (!current()) return;
          silenceTimerRef.current = null;
          debug("silence timer fired");
          try { recognition.stop(); } catch { /* Already stopped. */ }
        }, SPEECH_SILENCE_TIMEOUT_MS);
      };
      recognition.onstart = () => {
        if (!current()) return;
        lifecycleRef.current = "running";
        tossaPerf("SPEECH", "recognition onstart", { deviceGroup: group, session, lifecycle: lifecycleRef.current });
        debug("onstart");
        recognitionStartedAt = performance.now();
        armDeadStartWatchdog("onstart");
        callbacks.onStart();
      };
      recognition.onaudiostart = () => {
        if (!current()) return;
        if (ignoreRecognitionDuringMiyabiRef.current) return;
        tossaPerf("SPEECH", "recognition audio start", { deviceGroup: group, session });
        debug("onaudiostart");
        armDeadStartWatchdog("audio-start");
        callbacks.onActivity?.("audio");
      };
      recognition.onsoundstart = () => {
        if (!current()) return;
        if (ignoreRecognitionDuringMiyabiRef.current) {
          tossaPerf("SPEECH", "ignored onsoundstart during Miyabi", { deviceGroup: group, session });
          return;
        }
        clearDeadStartWatchdog("onsoundstart");
        tossaPerf("SPEECH", "onsoundstart", { deviceGroup: group, session });
        debug("onsoundstart");
        callbacks.onActivity?.("sound");
        callbacks.onSpeechStart?.();
      };
      recognition.onspeechstart = () => {
        if (!current()) return;
        if (ignoreRecognitionDuringMiyabiRef.current) {
          tossaPerf("SPEECH", "ignored onspeechstart during Miyabi", { deviceGroup: group, session });
          return;
        }
        clearDeadStartWatchdog("onspeechstart");
        tossaPerf("SPEECH", "onspeechstart", { deviceGroup: group, session });
        debug("onspeechstart");
        armSilenceTimer();
        callbacks.onActivity?.("speech");
        callbacks.onSpeechStart?.();
      };
      recognition.onspeechend = () => {
        if (!current()) return;
        if (ignoreRecognitionDuringMiyabiRef.current) return;
        speechEndedAt ??= performance.now();
        debug("onspeechend", {
          currentTranscript: mergeRecognitionResults(
            [finalTranscriptRef.current, interimTranscriptRef.current],
            lang === "ja-JP" ? "ja" : "en",
          ),
        });
        callbacks.onSpeechEnd?.();
      };
      recognition.onsoundend = () => {
        if (!current()) return;
        if (ignoreRecognitionDuringMiyabiRef.current) return;
        speechEndedAt ??= performance.now();
        debug("onsoundend", {
          currentTranscript: mergeRecognitionResults(
            [finalTranscriptRef.current, interimTranscriptRef.current],
            lang === "ja-JP" ? "ja" : "en",
          ),
        });
        callbacks.onSpeechEnd?.();
      };
      recognition.onaudioend = () => {
        if (current()) debug("onaudioend");
      };
      recognition.onresult = (event) => {
        if (!current()) return;
        if (ignoreRecognitionDuringMiyabiRef.current) {
          tossaPerf("SPEECH", "ignored onresult during Miyabi", {
            deviceGroup: group,
            session,
            resultIndex: event.resultIndex,
            resultCount: event.results.length,
          });
          return;
        }
        clearDeadStartWatchdog("onresult");
        tossaPerf("SPEECH", "onresult", { deviceGroup: group, session, resultIndex: event.resultIndex, resultCount: event.results.length });
        // Android Chrome can expose cumulative hypotheses as separate result
        // slots ("I", "I have", ...). Collapse those replacements instead of
        // joining every slot and multiplying the same words.
        const results = Array.from(event.results);
        const language = lang === "ja-JP" ? "ja" : "en";
        const finalChunks = results
          .filter((result) => result.isFinal)
          .map((result) => result[0]?.transcript ?? "");
        const interimChunks = results
          .filter((result) => !result.isFinal)
          .map((result) => result[0]?.transcript ?? "");
        const finalText = mergeRecognitionResults(finalChunks, language);
        interimTranscriptRef.current = mergeRecognitionResults(interimChunks, language);
        if (finalText) {
          finalTranscriptRef.current = finalText;
          const finalWaitMs = speechEndedAt === null ? null : Math.max(0, performance.now() - speechEndedAt);
          tossaPerf("SPEECH", "final result received", { deviceGroup: group, session, finalWaitMs, text: finalText });
          debug("final result received", { finalWaitMs, text: finalText });
          callbacks.onFinalTranscript?.(finalText);
        }
        debug("onresult", { final: finalText, interim: interimTranscriptRef.current, resultIndex: event.resultIndex });
        callbacks.onActivity?.("result");
        callbacks.onTranscript(mergeRecognitionResults(
          [finalTranscriptRef.current, interimTranscriptRef.current],
          language,
        ), { hasFinal: Boolean(finalTranscriptRef.current), hasInterim: Boolean(interimTranscriptRef.current) });
        armSilenceTimer();
      };
      recognition.onend = () => {
        if (!current()) return;
        clearDeadStartWatchdog("onend");
        const endedDuringMiyabi = ignoreRecognitionDuringMiyabiRef.current;
        lifecycleRef.current = "idle";
        tossaPerf("SPEECH", endedDuringMiyabi ? "recognition onend during Miyabi" : "recognition onend", {
          deviceGroup: group,
          session,
          lifecycle: lifecycleRef.current,
          ...(endedDuringMiyabi ? {} : { final: finalTranscriptRef.current }),
        });
        const final = finalTranscriptRef.current;
        const interim = interimTranscriptRef.current;
        const text = mergeRecognitionResults([final, interim], lang === "ja-JP" ? "ja" : "en");
        debug("onend", {
          final,
          interim,
          currentTranscript: text,
          finalWaitMs: speechEndedAt === null ? null : Math.max(0, performance.now() - speechEndedAt),
        });
        if (silenceTimerRef.current !== null) window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
        sessionRef.current += 1;
        recognition.onstart = recognition.onaudiostart = recognition.onaudioend = recognition.onspeechstart = recognition.onspeechend = recognition.onsoundstart = recognition.onsoundend = recognition.onresult = recognition.onend = recognition.onerror = null;
        recognitionRef.current = null;
        cancelCallbackRef.current = null;
        finalTranscriptRef.current = "";
        interimTranscriptRef.current = "";
        setActive(false);
        if (!endedDuringMiyabi) callbacks.onEnd(text, { final, interim });
      };
      recognition.onerror = (event) => {
        if (!current()) return;
        const nativeError = event as Event & { error?: string; message?: string };
        const error = nativeError.error ?? "unknown";
        const message = nativeError.message ?? "";
        if (ignoreRecognitionDuringMiyabiRef.current) {
          tossaPerf("SPEECH", "recognition onerror during Miyabi", { deviceGroup: group, session, error, message });
          lifecycleRef.current = "idle";
          sessionRef.current += 1;
          recognition.onstart = recognition.onaudiostart = recognition.onaudioend = recognition.onspeechstart = recognition.onspeechend = recognition.onsoundstart = recognition.onsoundend = recognition.onresult = recognition.onend = recognition.onerror = null;
          if (recognitionRef.current === recognition) recognitionRef.current = null;
          cancelCallbackRef.current = null;
          finalTranscriptRef.current = "";
          interimTranscriptRef.current = "";
          setActive(false);
          return;
        }
        const error7 = isAppleAssistantError7(group, error, message);
        tossaPerf("SPEECH", "recognition onerror", {
          deviceGroup: group,
          session,
          retryCount: error7RetryCount,
          lifecycle: lifecycleRef.current,
          error,
          message,
          name: nativeError.constructor?.name ?? "Event",
        });
        debug("onerror", { error: event.error });
        dispose();
        setActive(false);
        if (error7 && error7RetryCount < APPLE_ERROR7_MAX_RETRIES) {
          const nextRetryCount = error7RetryCount + 1;
          tossaPerf("SPEECH", "recognition error7 retry scheduled", {
            deviceGroup: group,
            session,
            retryCount: nextRetryCount,
            delayMs: APPLE_ERROR7_RETRY_DELAY_MS,
          });
          error7RetryTimerRef.current = window.setTimeout(() => {
            error7RetryTimerRef.current = null;
            const retrySession = sessionRef.current + 1;
            tossaPerf("SPEECH", "recognition error7 retry start", {
              deviceGroup: group,
              session: retrySession,
              retryCount: nextRetryCount,
            });
            startAttempt(nextRetryCount);
          }, APPLE_ERROR7_RETRY_DELAY_MS);
          return;
        }
        if (error7) {
          tossaPerf("SPEECH", "recognition error7 retry exhausted", {
            deviceGroup: group,
            session,
            retryCount: error7RetryCount,
          });
        }
        callbacks.onError(event.error);
      };
      setActive(true); // Includes permission/startup pending; does not start Listening.
      lifecycleRef.current = "starting";
      tossaPerf("SPEECH", "recognition start() about to call", { deviceGroup: group, session, lifecycle: lifecycleRef.current, lang });
      debug("start called", { lang });
      recognition.start();
      tossaPerf("SPEECH", "recognition start() returned", { deviceGroup: group, session, lifecycle: lifecycleRef.current, lang });
    } catch (error) {
      if (!current()) return;
      tossaPerf("SPEECH", "recognition start() threw", {
        deviceGroup: group,
        session,
        lifecycle: lifecycleRef.current,
        error: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : "unknown",
      });
      dispose();
      setActive(false);
      callbacks.onError("start-failed");
    }
    };
    startAttempt(0);
  }, [dispose]);
  useEffect(() => dispose, [dispose]);
  return { active, start, finish, cancel, getSessionId, setIgnoreRecognitionDuringMiyabi };
}
