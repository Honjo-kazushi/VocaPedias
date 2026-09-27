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
  onTranscript: (text: string) => void;
  onEnd: (text: string) => void;
  onCancel: () => void;
  onError: (error: string) => void;
};

type StartOptions = {
  iosRescueWatchdog?: boolean;
};

export const SPEECH_SILENCE_TIMEOUT_MS = 3000;
// iOS normally establishes audio capture immediately after onstart. Five seconds
// avoids racing a slow audio-session handoff after Miyabi TTS; a one-second
// backoff gives WebKit time to release the stuck native recognition session.
export const IOS_RESCUE_CAPTURE_WATCHDOG_MS = 5000;
export const IOS_RESCUE_STUCK_RETRY_BACKOFF_MS = 1000;
export const IOS_RESCUE_STUCK_MAX_RETRIES = 1;
export const IOS_RESCUE_ABORT_TIMEOUT_MS = 1800;
export const IOS_RESCUE_ABORT_ONEND_DELAY_MS = 100;
export const IOS_RESCUE_ABORT_TIMEOUT_SAFE_DELAY_MS = 350;

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
  const captureWatchdogTimerRef = useRef<number | null>(null);
  const stuckRetryTimerRef = useRef<number | null>(null);
  const rescueAbortFinalizeRef = useRef<(() => void) | null>(null);
  const cancelCallbackRef = useRef<(() => void) | null>(null);
  const lifecycleRef = useRef<"idle" | "starting" | "running" | "stopping" | "aborting">("idle");
  const dispose = useCallback(() => {
    rescueAbortFinalizeRef.current?.();
    sessionRef.current += 1;
    if (silenceTimerRef.current !== null) window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
    if (error7RetryTimerRef.current !== null) window.clearTimeout(error7RetryTimerRef.current);
    error7RetryTimerRef.current = null;
    if (captureWatchdogTimerRef.current !== null) window.clearTimeout(captureWatchdogTimerRef.current);
    captureWatchdogTimerRef.current = null;
    if (stuckRetryTimerRef.current !== null) window.clearTimeout(stuckRetryTimerRef.current);
    stuckRetryTimerRef.current = null;
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
  const cancelAndWaitForRescueEnd = useCallback((): Promise<void> => {
    if (deviceGroup() !== "ios/fallback") {
      cancel();
      return Promise.resolve();
    }
    const recognition = recognitionRef.current;
    if (!recognition) {
      setActive(false);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const startedAt = performance.now();
      let finished = false;
      let timeoutId: number | null = null;
      let safeDelayId: number | null = null;
      const elapsedMs = () => Math.round(performance.now() - startedAt);
      const finish = (delayMs: number) => {
        if (finished) return;
        finished = true;
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        recognition.onend = null;
        recognition.onerror = null;
        if (recognitionRef.current === recognition) recognitionRef.current = null;
        cancelCallbackRef.current = null;
        finalTranscriptRef.current = "";
        interimTranscriptRef.current = "";
        lifecycleRef.current = "idle";
        setActive(false);
        rescueAbortFinalizeRef.current = null;
        if (delayMs > 0) safeDelayId = window.setTimeout(resolve, delayMs);
        else resolve();
      };
      rescueAbortFinalizeRef.current = () => {
        if (safeDelayId !== null) window.clearTimeout(safeDelayId);
        finish(0);
      };
      if (silenceTimerRef.current !== null) window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
      if (captureWatchdogTimerRef.current !== null) window.clearTimeout(captureWatchdogTimerRef.current);
      captureWatchdogTimerRef.current = null;
      recognition.onstart = recognition.onaudiostart = recognition.onaudioend = recognition.onspeechstart = recognition.onspeechend = recognition.onsoundstart = recognition.onsoundend = recognition.onresult = null;
      recognition.onend = () => {
        tossaPerf("SPEECH", "rescue recognition abort onend", {
          deviceGroup: "ios/fallback",
          abortElapsedMs: elapsedMs(),
        });
        finish(IOS_RESCUE_ABORT_ONEND_DELAY_MS);
      };
      recognition.onerror = (event) => {
        const nativeError = event as Event & { error?: string; message?: string };
        tossaPerf("SPEECH", "rescue recognition abort onerror", {
          deviceGroup: "ios/fallback",
          abortElapsedMs: elapsedMs(),
          error: nativeError.error ?? "unknown",
          message: nativeError.message ?? "",
        });
        // Web Speech defines onend as the disconnect completion signal, so keep
        // waiting for it until the bounded timeout even when abort emits onerror.
      };
      lifecycleRef.current = "aborting";
      tossaPerf("SPEECH", "rescue recognition abort requested", {
        deviceGroup: "ios/fallback",
        abortElapsedMs: 0,
        timeoutMs: IOS_RESCUE_ABORT_TIMEOUT_MS,
      });
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        tossaPerf("SPEECH", "rescue recognition abort timeout", {
          deviceGroup: "ios/fallback",
          abortElapsedMs: elapsedMs(),
          safeDelayMs: IOS_RESCUE_ABORT_TIMEOUT_SAFE_DELAY_MS,
        });
        finish(IOS_RESCUE_ABORT_TIMEOUT_SAFE_DELAY_MS);
      }, IOS_RESCUE_ABORT_TIMEOUT_MS);
      try {
        recognition.abort();
      } catch (error) {
        tossaPerf("SPEECH", "rescue recognition abort onerror", {
          deviceGroup: "ios/fallback",
          abortElapsedMs: elapsedMs(),
          error: error instanceof Error ? error.name : "AbortError",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }, [cancel]);
  const finish = useCallback(() => {
    if (silenceTimerRef.current !== null) window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
    if (recognitionRef.current) {
      lifecycleRef.current = "stopping";
      tossaPerf("SPEECH", "recognition stop", { deviceGroup: deviceGroup() });
      try { recognitionRef.current.stop(); } catch { /* Already stopped. */ }
    }
  }, []);
  const start = useCallback((callbacks: Callbacks, lang: "en-US" | "ja-JP" = "en-US", options: StartOptions = {}) => {
    const group = deviceGroup();
    const rescueWatchdogEnabled = group === "ios/fallback" && options.iosRescueWatchdog === true;
    tossaPerf("SPEECH", "recognition start requested", { deviceGroup: group, lifecycle: lifecycleRef.current, lang });
    if (recognitionRef.current) {
      tossaPerf("SPEECH", "recognition start blocked", { deviceGroup: group, lifecycle: lifecycleRef.current, reason: "existing-instance" });
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      callbacks.onError("unsupported");
      return;
    }
    const startAttempt = (error7RetryCount: number, stuckRetryCount: number) => {
    const session = ++sessionRef.current;
    const current = () => sessionRef.current === session;
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
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
      const clearCaptureWatchdog = () => {
        if (captureWatchdogTimerRef.current !== null) window.clearTimeout(captureWatchdogTimerRef.current);
        captureWatchdogTimerRef.current = null;
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
        callbacks.onStart();
        if (rescueWatchdogEnabled) {
          clearCaptureWatchdog();
          captureWatchdogTimerRef.current = window.setTimeout(() => {
            captureWatchdogTimerRef.current = null;
            if (!current()) return;
            tossaPerf("SPEECH", "recognition watchdog timeout", {
              deviceGroup: group,
              session,
              retryCount: stuckRetryCount,
              timeoutMs: IOS_RESCUE_CAPTURE_WATCHDOG_MS,
            });
            dispose();
            setActive(false);
            if (stuckRetryCount < IOS_RESCUE_STUCK_MAX_RETRIES) {
              const nextStuckRetryCount = stuckRetryCount + 1;
              tossaPerf("SPEECH", "recognition stuck retry", {
                deviceGroup: group,
                session,
                retryCount: nextStuckRetryCount,
                backoffMs: IOS_RESCUE_STUCK_RETRY_BACKOFF_MS,
              });
              stuckRetryTimerRef.current = window.setTimeout(() => {
                stuckRetryTimerRef.current = null;
                startAttempt(error7RetryCount, nextStuckRetryCount);
              }, IOS_RESCUE_STUCK_RETRY_BACKOFF_MS);
              return;
            }
            callbacks.onError("audio-capture");
          }, IOS_RESCUE_CAPTURE_WATCHDOG_MS);
        }
      };
      recognition.onaudiostart = () => {
        if (!current()) return;
        clearCaptureWatchdog();
        if (rescueWatchdogEnabled) {
          tossaPerf("SPEECH", "recognition audio start", {
            deviceGroup: group,
            session,
            retryCount: stuckRetryCount,
          });
        }
        debug("onaudiostart");
        callbacks.onActivity?.("audio");
      };
      recognition.onsoundstart = () => {
        if (!current()) return;
        clearCaptureWatchdog();
        debug("onsoundstart");
        callbacks.onActivity?.("sound");
        callbacks.onSpeechStart?.();
      };
      recognition.onspeechstart = () => {
        if (!current()) return;
        clearCaptureWatchdog();
        debug("onspeechstart");
        armSilenceTimer();
        callbacks.onActivity?.("speech");
        callbacks.onSpeechStart?.();
      };
      recognition.onspeechend = () => {
        if (!current()) return;
        debug("onspeechend");
        callbacks.onSpeechEnd?.();
      };
      recognition.onsoundend = () => {
        if (!current()) return;
        debug("onsoundend");
        callbacks.onSpeechEnd?.();
      };
      recognition.onaudioend = () => {
        if (current()) debug("onaudioend");
      };
      recognition.onresult = (event) => {
        if (!current()) return;
        clearCaptureWatchdog();
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
          callbacks.onFinalTranscript?.(finalText);
        }
        debug("onresult", { final: finalText, interim: interimTranscriptRef.current, resultIndex: event.resultIndex });
        callbacks.onActivity?.("result");
        callbacks.onTranscript(mergeRecognitionResults(
          [finalTranscriptRef.current, interimTranscriptRef.current],
          language,
        ));
        armSilenceTimer();
      };
      recognition.onend = () => {
        if (!current()) return;
        clearCaptureWatchdog();
        lifecycleRef.current = "idle";
        tossaPerf("SPEECH", "recognition onend", { deviceGroup: group, session, lifecycle: lifecycleRef.current, final: finalTranscriptRef.current });
        debug("onend", { final: finalTranscriptRef.current });
        if (silenceTimerRef.current !== null) window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
        const text = finalTranscriptRef.current;
        sessionRef.current += 1;
        recognition.onstart = recognition.onaudiostart = recognition.onaudioend = recognition.onspeechstart = recognition.onspeechend = recognition.onsoundstart = recognition.onsoundend = recognition.onresult = recognition.onend = recognition.onerror = null;
        recognitionRef.current = null;
        cancelCallbackRef.current = null;
        finalTranscriptRef.current = "";
        interimTranscriptRef.current = "";
        setActive(false);
        callbacks.onEnd(text);
      };
      recognition.onerror = (event) => {
        if (!current()) return;
        clearCaptureWatchdog();
        const nativeError = event as Event & { error?: string; message?: string };
        const error = nativeError.error ?? "unknown";
        const message = nativeError.message ?? "";
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
            startAttempt(nextRetryCount, stuckRetryCount);
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
    startAttempt(0, 0);
  }, [dispose]);
  useEffect(() => dispose, [dispose]);
  return { active, start, finish, cancel, cancelAndWaitForRescueEnd };
}
