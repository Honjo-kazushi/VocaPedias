import { useCallback, useEffect, useRef, useState } from "react";

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

// Each start owns its callbacks and transcript. Late events cannot touch a later session.
export function useUserSpeechRecognition() {
  const [active, setActive] = useState(false);
  const sessionRef = useRef(0);
  const recognitionRef = useRef<AppSpeechRecognition | null>(null);
  const finalTranscriptRef = useRef("");
  const interimTranscriptRef = useRef("");
  const silenceTimerRef = useRef<number | null>(null);
  const cancelCallbackRef = useRef<(() => void) | null>(null);
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
      try { recognition.abort(); } catch { /* Already stopped. */ }
    }
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
    try { recognitionRef.current?.stop(); } catch { /* Already stopped. */ }
  }, []);
  const start = useCallback((callbacks: Callbacks, lang: "en-US" | "ja-JP" = "en-US") => {
    if (recognitionRef.current) return;
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
        debug("onstart");
        callbacks.onStart();
        // Also prevents an entirely silent session from recording forever.
        armSilenceTimer();
      };
      recognition.onaudiostart = () => {
        if (!current()) return;
        debug("onaudiostart");
        armSilenceTimer();
        callbacks.onActivity?.("audio");
      };
      recognition.onsoundstart = () => {
        if (!current()) return;
        debug("onsoundstart");
        armSilenceTimer();
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
        // Rebuild from the cumulative result list so a final result is never appended twice.
        const results = Array.from(event.results);
        const finalText = results
          .filter((result) => result.isFinal)
          .map((result) => result[0]?.transcript ?? "").join(" ").trim();
        interimTranscriptRef.current = results
          .filter((result) => !result.isFinal)
          .map((result) => result[0]?.transcript ?? "").join(" ").trim();
        if (finalText) {
          finalTranscriptRef.current = finalText;
          callbacks.onFinalTranscript?.(finalText);
        }
        debug("onresult", { final: finalText, interim: interimTranscriptRef.current, resultIndex: event.resultIndex });
        callbacks.onActivity?.("result");
        callbacks.onTranscript([finalTranscriptRef.current, interimTranscriptRef.current]
          .filter(Boolean).join(" "));
        armSilenceTimer();
      };
      recognition.onend = () => {
        if (!current()) return;
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
        debug("onerror", { error: event.error });
        dispose();
        setActive(false);
        callbacks.onError(event.error);
      };
      setActive(true); // Includes permission/startup pending; does not start Listening.
      debug("start called", { lang });
      recognition.start();
    } catch {
      if (!current()) return;
      dispose();
      setActive(false);
      callbacks.onError("start-failed");
    }
  }, [dispose]);
  useEffect(() => dispose, [dispose]);
  return { active, start, finish, cancel };
}
