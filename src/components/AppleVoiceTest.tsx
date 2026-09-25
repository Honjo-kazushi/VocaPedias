import { useEffect, useMemo, useState } from "react";
import { CHARACTER_PROFILES, type CharacterId } from "../characters/characterProfiles";
import { getCharacterVoiceCandidates } from "../sound/selectCharacterVoice";

type CandidateTuning = { rate: number; pitch: number };
type VoiceCandidate = CandidateTuning & { voice: SpeechSynthesisVoice };

const CHARACTER_IDS: readonly CharacterId[] = [
  "emma", "mike", "sophie", "jamie", "lily", "grandma_rose", "dr_dan", "leo", "miyabi",
];

const ENGLISH_SAMPLE = "Hi! It's nice to see you. How are you doing today?";
const JAPANESE_SAMPLE = "こんにちは。今日はどんな一日でしたか？";

function isAppleTouchDevice(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

function selectAppleVoiceCandidates(
  characterId: CharacterId,
  voices: readonly SpeechSynthesisVoice[],
): VoiceCandidate[] {
  const preference = CHARACTER_PROFILES[characterId].voicePreferences.ios!;
  return getCharacterVoiceCandidates(characterId, voices, {
    deviceGroup: "ios",
    locale: characterId === "miyabi" ? "ja-JP" : "en-US",
    limit: 3,
  }).map((voice) => ({ voice, rate: preference.rate, pitch: preference.pitch }));
}

export default function AppleVoiceTest() {
  const [characterId, setCharacterId] = useState<CharacterId>("emma");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const candidates = useMemo(() => selectAppleVoiceCandidates(characterId, voices), [characterId, voices]);
  const play = (candidate: VoiceCandidate) => {
    const utterance = new SpeechSynthesisUtterance(characterId === "miyabi" ? JAPANESE_SAMPLE : ENGLISH_SAMPLE);
    utterance.voice = candidate.voice;
    utterance.lang = candidate.voice.lang;
    utterance.rate = candidate.rate;
    utterance.pitch = candidate.pitch;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  return (
    <section className="apple-voice-test" aria-labelledby="apple-voice-test-heading">
      <h2 id="apple-voice-test-heading">APPLE VOICE TEST</h2>
      {!isAppleTouchDevice() && <p className="apple-voice-test-note">Apple Voice Test is intended for iPhone/iPad.</p>}
      <label>
        Character:{" "}
        <select value={characterId} onChange={(event) => setCharacterId(event.target.value as CharacterId)}>
          {CHARACTER_IDS.map((id) => <option key={id} value={id}>{CHARACTER_PROFILES[id].displayName}</option>)}
        </select>
      </label>
      {!candidates.length && <p>No matching voices are available yet. Waiting for voiceschanged…</p>}
      <div className="apple-voice-candidates">
        {candidates.map((candidate, index) => (
          <article key={`${candidate.voice.voiceURI}-${candidate.voice.lang}`}>
            <strong>Candidate {index + 1}: {candidate.voice.name}</strong>
            <span>{candidate.voice.lang} / rate {candidate.rate.toFixed(2)} / pitch {candidate.pitch.toFixed(2)}</span>
            <button type="button" onClick={() => play(candidate)}>Test</button>
          </article>
        ))}
      </div>
    </section>
  );
}
