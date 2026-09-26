import { useEffect, useMemo, useState } from "react";
import type { CharacterId } from "../characters/characterProfiles";
import { cancelSpeechSynthesis } from "../sound/cancelSpeechSynthesis";

type TrialDefinition = {
  label: "A" | "B" | "C";
  voiceName: string;
  lang: string;
  rate: number;
  pitch: number;
};

type CharacterTrial = {
  characterId: CharacterId;
  displayName: string;
  sample: string;
  candidates: readonly TrialDefinition[];
};

const COMMON_SAMPLE = "Hey! It's nice to talk with you today. What have you been up to?";
const GRANDMA_ROSE_SAMPLE = "It's lovely to talk with you today. Tell me, what have you been up to?";

const CHARACTER_TRIALS: readonly CharacterTrial[] = [
  {
    characterId: "sophie",
    displayName: "Sophie",
    sample: COMMON_SAMPLE,
    candidates: [
      { label: "A", voiceName: "Samantha", lang: "en-US", rate: 0.93, pitch: 1.06 },
      { label: "B", voiceName: "Karen", lang: "en-AU", rate: 0.93, pitch: 1.06 },
      { label: "C", voiceName: "Tessa", lang: "en-ZA", rate: 0.93, pitch: 1.06 },
    ],
  },
  {
    characterId: "jamie",
    displayName: "Jamie",
    sample: COMMON_SAMPLE,
    candidates: [
      { label: "A", voiceName: "Reed", lang: "en-US", rate: 0.96, pitch: 0.98 },
      { label: "B", voiceName: "Rishi", lang: "en-IN", rate: 0.96, pitch: 0.98 },
      { label: "C", voiceName: "Rocko", lang: "en-GB", rate: 0.96, pitch: 0.98 },
    ],
  },
  {
    characterId: "grandma_rose",
    displayName: "Grandma Rose",
    sample: GRANDMA_ROSE_SAMPLE,
    candidates: [
      { label: "A", voiceName: "Moira", lang: "en-IE", rate: 0.9, pitch: 0.96 },
      { label: "B", voiceName: "Karen", lang: "en-AU", rate: 0.9, pitch: 0.96 },
      { label: "C", voiceName: "Samantha", lang: "en-US", rate: 0.9, pitch: 0.96 },
    ],
  },
  {
    characterId: "leo",
    displayName: "Leo",
    sample: COMMON_SAMPLE,
    candidates: [
      { label: "A", voiceName: "Junior", lang: "en-US", rate: 1, pitch: 1.1 },
      { label: "B", voiceName: "Junior", lang: "en-US", rate: 1, pitch: 1.14 },
      { label: "C", voiceName: "Junior", lang: "en-US", rate: 1, pitch: 1.16 },
    ],
  },
];

function isAppleTouchDevice(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

function findVoice(voices: readonly SpeechSynthesisVoice[], candidate: TrialDefinition): SpeechSynthesisVoice | undefined {
  return voices.find((voice) =>
    voice.name === candidate.voiceName && voice.lang.toLowerCase() === candidate.lang.toLowerCase()
  );
}

export default function AppleVoiceTest() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const availableVoiceKeys = useMemo(
    () => new Set(voices.map((voice) => `${voice.name}\n${voice.lang.toLowerCase()}`)),
    [voices],
  );

  const play = (trial: CharacterTrial, candidate: TrialDefinition) => {
    const voice = findVoice(voices, candidate);
    if (!voice) return;
    const utterance = new SpeechSynthesisUtterance(trial.sample);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = candidate.rate;
    utterance.pitch = candidate.pitch;
    cancelSpeechSynthesis(window.speechSynthesis, {
      reason: "apple-voice-test:replace-preview",
      source: "AppleVoiceTest.play",
      characterId: trial.characterId,
      conversationState: "perfDebug voice test",
    });
    window.speechSynthesis.speak(utterance);
  };

  return (
    <section className="apple-voice-test" aria-labelledby="apple-voice-test-heading">
      <h2 id="apple-voice-test-heading">APPLE VOICE TEST</h2>
      {!isAppleTouchDevice() && <p className="apple-voice-test-note">Apple Voice Test is intended for iPhone/iPad.</p>}
      <p className="apple-voice-test-note">Compare A / B / C, then report the preferred candidate for each character.</p>
      <div className="apple-voice-characters">
        {CHARACTER_TRIALS.map((trial) => (
          <section className="apple-voice-character" key={trial.characterId}>
            <h3>{trial.displayName}</h3>
            <p className="apple-voice-sample">{trial.sample}</p>
            <div className="apple-voice-candidates">
              {trial.candidates.map((candidate) => {
                const available = availableVoiceKeys.has(`${candidate.voiceName}\n${candidate.lang.toLowerCase()}`);
                return (
                  <article key={candidate.label}>
                    <strong>{candidate.label}: {candidate.voiceName}</strong>
                    <span>{candidate.lang} / rate {candidate.rate.toFixed(2)} / pitch {candidate.pitch.toFixed(2)}</span>
                    <button type="button" disabled={!available} onClick={() => play(trial, candidate)}>
                      {available ? "Test" : "Unavailable"}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
