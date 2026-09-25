import { useCallback, useEffect, useRef, useState } from "react";
import { mergeRecognitionResults } from "../ai/conversationTypes";
import { tossaPerf } from "../debug/tossaPerf";

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

export const SPEECH_SILENCE_TIMEOUT_MS = 3000;

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
  const cancelCallbackRef = useRef<(() => void) | null>(null);
  const lifecycleRef = useRef<"idle" | "starting" | "running" | "stopping" | "aborting">("idle");
  const dispose = useCallback(() => {
    sessionRef.current += 1;
    if (silenceTimerRef.current !== null) window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
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
    if (recognitionRef.current) {
      tossaPerf("SPEECH", "recognition start blocked", { deviceGroup: group, lifecycle: lifecycleRef.current, reason: "existing-instance" });
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      callbacks.onError("unsupported");
      return;
    }
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
      };
      recognition.onaudiostart = () => {
        if (!current()) return;
        debug("onaudiostart");
        callbacks.onActivity?.("audio");
      };
      recognition.onsoundstart = () => {
        if (!current()) return;
        debug("onsoundstart");
        callbacks.onActivity?.("sound");
        callbacks.onSpeechStart?.();
      };
      recognition.onspeechstart = () => {
        if (!current()) return;
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
        const nativeError = event as Event & { error?: string; message?: string };
        tossaPerf("SPEECH", "recognition onerror", {
          deviceGroup: group,
          session,
          lifecycle: lifecycleRef.current,
          error: nativeError.error ?? "unknown",
          message: nativeError.message ?? "",
          name: nativeError.constructor?.name ?? "Event",
        });
        debug("onerror", { error: event.error });
        dispose();
        setActive(false);
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
  }, [dispose]);
  useEffect(() => dispose, [dispose]);
  return { active, start, finish, cancel };
}
