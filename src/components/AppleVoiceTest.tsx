import { useEffect, useMemo, useState } from "react";
import { CHARACTER_PROFILES, type CharacterId, type VoicePreference } from "../characters/characterProfiles";
import { normalizeLang } from "../sound/selectCharacterVoice";
import { cancelSpeechSynthesis } from "../sound/cancelSpeechSynthesis";

type TrialDefinition = {
  label: "A Calm" | "B Current" | "C Bright";
  rate: number;
  pitch: number;
};

const CHARACTER_IDS: readonly CharacterId[] = [
  "emma", "mike", "sophie", "jamie", "lily", "grandma_rose", "dr_dan", "leo", "miyabi",
];

const ENGLISH_SAMPLE = "Hey! It's nice to talk with you today. What have you been up to?";
const JAPANESE_SAMPLE = "そうなんですね。私もそれ、ちょっと気になってました。ところで、今日はこのあと何をする予定ですか？";

function isAppleTouchDevice(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)) * 100) / 100;
}

function buildTrials(characterId: CharacterId, preference: VoicePreference): readonly TrialDefinition[] {
  if (characterId === "miyabi") {
    return [
      { label: "A Calm", rate: 0.85, pitch: 0.9 },
      { label: "B Current", rate: preference.rate, pitch: preference.pitch },
      { label: "C Bright", rate: 1.3, pitch: 1.18 },
    ];
  }
  return [
    { label: "A Calm", rate: clamp(preference.rate - 0.05, 0.7, 1.2), pitch: clamp(preference.pitch - 0.04, 0.7, 1.3) },
    { label: "B Current", rate: preference.rate, pitch: preference.pitch },
    { label: "C Bright", rate: clamp(preference.rate + 0.05, 0.7, 1.2), pitch: clamp(preference.pitch + 0.04, 0.7, 1.3) },
  ];
}

function findConfiguredVoice(voices: readonly SpeechSynthesisVoice[], preference: VoicePreference): SpeechSynthesisVoice | undefined {
  const configured = preference.preferredVoices?.[0];
  if (!configured) return undefined;
  const configuredName = configured.name.toLowerCase();
  return voices.find((voice) =>
    (voice.name.toLowerCase() === configuredName || voice.name.toLowerCase().includes(configuredName)) &&
    normalizeLang(voice.lang) === normalizeLang(configured.lang)
  );
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

  const profile = CHARACTER_PROFILES[characterId];
  const preference = profile.voicePreferences.ios!;
  const configuredVoice = preference.preferredVoices![0];
  const voice = useMemo(() => findConfiguredVoice(voices, preference), [voices, preference]);
  const trials = useMemo(() => buildTrials(characterId, preference), [characterId, preference]);
  const sample = profile.conversationLanguage === "ja" ? JAPANESE_SAMPLE : ENGLISH_SAMPLE;

  const play = (selectedVoice: SpeechSynthesisVoice, rate: number, pitch: number) => {
    const utterance = new SpeechSynthesisUtterance(sample);
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang;
    utterance.rate = rate;
    utterance.pitch = pitch;
    cancelSpeechSynthesis(window.speechSynthesis, {
      reason: "apple-voice-test:replace-preview",
      source: "AppleVoiceTest.play",
      characterId,
      conversationState: "perfDebug voice test",
    });
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
      <p className="apple-voice-current">
        Voice: <strong>{configuredVoice.name}</strong><br />
        Lang: <strong>{configuredVoice.lang}</strong>
      </p>
      <p className="apple-voice-sample">{sample}</p>
      <div className="apple-voice-candidates">
        {trials.map((trial) => (
          <article key={trial.label}>
            <strong>{trial.label}</strong>
            <span>{configuredVoice.name} / {configuredVoice.lang} / rate {trial.rate.toFixed(2)} / pitch {trial.pitch.toFixed(2)}</span>
            <button type="button" disabled={!voice} onClick={() => voice && play(voice, trial.rate, trial.pitch)}>
              {voice ? "Test" : "Unavailable"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
