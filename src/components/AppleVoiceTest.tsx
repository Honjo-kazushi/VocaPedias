import { useEffect, useMemo, useState } from "react";
import { CHARACTER_PROFILES, type CharacterId } from "../characters/characterProfiles";
import { normalizeLang } from "../sound/selectCharacterVoice";

type CandidateTuning = { rate: number; pitch: number };
type VoiceCandidate = CandidateTuning & { voice: SpeechSynthesisVoice };

const CHARACTER_IDS: readonly CharacterId[] = [
  "emma", "mike", "sophie", "jamie", "lily", "grandma_rose", "dr_dan", "leo", "miyabi",
];

const PREFERRED_NAMES: Record<CharacterId, readonly string[]> = {
  emma: ["Samantha", "Ava", "Serena", "Karen", "Tessa", "Moira", "Flo"],
  mike: ["Daniel", "Aaron", "Evan", "Nathan", "Tom", "Rocko"],
  sophie: ["Ava", "Zoe", "Samantha", "Karen", "Tessa", "Flo"],
  jamie: ["Jamie", "Oliver", "Daniel", "Aaron", "Evan", "Rocko"],
  lily: ["Tessa", "Karen", "Moira", "Ava", "Zoe", "Flo"],
  grandma_rose: ["Moira", "Serena", "Samantha", "Karen", "Tessa", "Flo"],
  dr_dan: ["Daniel", "Tom", "Aaron", "Nathan", "Evan", "Rocko"],
  leo: ["Eddy", "Reed", "Evan", "Nathan", "Aaron", "Rocko"],
  miyabi: ["O-Ren", "Hattori", "Kyoko", "Otoya"],
};

const TUNINGS: Record<CharacterId, readonly [CandidateTuning, CandidateTuning, CandidateTuning]> = {
  emma: [{ rate: 0.96, pitch: 1 }, { rate: 0.98, pitch: 1.02 }, { rate: 0.94, pitch: 0.98 }],
  mike: [{ rate: 1.03, pitch: 0.98 }, { rate: 1.05, pitch: 1 }, { rate: 1, pitch: 0.96 }],
  sophie: [{ rate: 1.04, pitch: 1.04 }, { rate: 1.02, pitch: 1.06 }, { rate: 1.06, pitch: 1.02 }],
  jamie: [{ rate: 0.96, pitch: 0.98 }, { rate: 0.98, pitch: 0.96 }, { rate: 0.94, pitch: 1 }],
  lily: [{ rate: 1, pitch: 1.04 }, { rate: 0.98, pitch: 1.02 }, { rate: 1.02, pitch: 1.06 }],
  grandma_rose: [{ rate: 0.88, pitch: 0.98 }, { rate: 0.9, pitch: 1 }, { rate: 0.86, pitch: 0.96 }],
  dr_dan: [{ rate: 0.92, pitch: 0.96 }, { rate: 0.94, pitch: 0.98 }, { rate: 0.9, pitch: 1 }],
  leo: [{ rate: 1.08, pitch: 1.06 }, { rate: 1.1, pitch: 1.04 }, { rate: 1.06, pitch: 1.08 }],
  miyabi: [{ rate: 1.06, pitch: 1.02 }, { rate: 1.08, pitch: 1.04 }, { rate: 1.04, pitch: 1 }],
};

const ENGLISH_SAMPLE = "Hi! It's nice to see you. How are you doing today?";
const JAPANESE_SAMPLE = "こんにちは。今日はどんな一日でしたか？";

function isAppleTouchDevice(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

function nameRank(characterId: CharacterId, name: string): number {
  const normalized = name.toLowerCase();
  const index = PREFERRED_NAMES[characterId].findIndex((preferred) =>
    normalized === preferred.toLowerCase() || normalized.includes(preferred.toLowerCase())
  );
  return index < 0 ? 100 : index;
}

function regionRank(characterId: CharacterId, lang: string): number {
  const normalized = normalizeLang(lang);
  if (characterId === "miyabi") return normalized === "ja-jp" ? 0 : 10;
  if (normalized === "en-us") return 0;
  if (normalized === "en-gb") return 1;
  if (normalized === "en-au") return 2;
  return 3;
}

function selectAppleVoiceCandidates(
  characterId: CharacterId,
  voices: readonly SpeechSynthesisVoice[],
): VoiceCandidate[] {
  const prefix = characterId === "miyabi" ? "ja-" : "en-";
  const eligible = voices.filter((voice) => normalizeLang(voice.lang).startsWith(prefix));
  const ordered = [...eligible].sort((left, right) =>
    nameRank(characterId, left.name) - nameRank(characterId, right.name) ||
    regionRank(characterId, left.lang) - regionRank(characterId, right.lang) ||
    Number(right.localService) - Number(left.localService) ||
    left.name.localeCompare(right.name)
  );
  const selected: SpeechSynthesisVoice[] = [];
  for (const voice of ordered) {
    if (selected.some((item) => item.name === voice.name && normalizeLang(item.lang) === normalizeLang(voice.lang))) continue;
    selected.push(voice);
    if (selected.length === 3) break;
  }
  return selected.map((voice, index) => ({ voice, ...TUNINGS[characterId][index] }));
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
