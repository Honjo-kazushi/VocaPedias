import { useEffect, useMemo, useState } from "react";
import { cancelSpeechSynthesis } from "../sound/cancelSpeechSynthesis";
import { normalizeLang } from "../sound/selectCharacterVoice";

const SAMPLE = "This is a voice test. Can you hear me clearly?";
const CANDIDATES = [
  { name: "Samantha", lang: "en-US" },
  { name: "Daniel", lang: "en-GB" },
  { name: "Karen", lang: "en-AU" },
  { name: "Moira", lang: "en-IE" },
  { name: "Rishi", lang: "en-IN" },
] as const;

function isAppleTouchPerfDebug(): boolean {
  const appleTouch = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  return appleTouch && new URLSearchParams(window.location.search).get("perfDebug") === "1";
}

export default function AppleVoiceTest() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState("");

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const availableVoices = useMemo(() => CANDIDATES.flatMap((candidate) => {
    const name = candidate.name.toLowerCase();
    const voice = voices.find((item) =>
      (item.name.toLowerCase() === name || item.name.toLowerCase().includes(name)) &&
      normalizeLang(item.lang) === normalizeLang(candidate.lang)
    );
    return voice ? [voice] : [];
  }), [voices]);
  const selectedVoice = availableVoices.find((voice) => voice.voiceURI === selectedVoiceUri) ?? availableVoices[0];

  if (!isAppleTouchPerfDebug()) return null;

  const play = () => {
    if (!selectedVoice) return;
    const utterance = new SpeechSynthesisUtterance(SAMPLE);
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang;
    cancelSpeechSynthesis(window.speechSynthesis, {
      reason: "apple-voice-test:replace-preview",
      source: "AppleVoiceTest.play",
      conversationState: "perfDebug voice test",
    });
    window.speechSynthesis.speak(utterance);
  };

  return (
    <section className="apple-voice-test" aria-labelledby="apple-voice-test-heading">
      <h2 id="apple-voice-test-heading">iPad English Voice Test</h2>
      <label>
        Voice:{" "}
        <select
          value={selectedVoice?.voiceURI ?? ""}
          disabled={!availableVoices.length}
          onChange={(event) => setSelectedVoiceUri(event.target.value)}
        >
          {!availableVoices.length && <option value="">No candidate voices available</option>}
          {availableVoices.map((voice) => (
            <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>
          ))}
        </select>
      </label>
      <p className="apple-voice-sample">{SAMPLE}</p>
      <button type="button" disabled={!selectedVoice} onClick={play}>試聴</button>
    </section>
  );
}
