import { useEffect, useMemo, useState } from "react";
import { cancelSpeechSynthesis } from "../sound/cancelSpeechSynthesis";

const SAMPLES = {
  Conversation: "Hi. How are you today? Tell me something about your day. What did you enjoy most?",
  Waiting: "Take your time. There's no hurry. I'm listening.",
} as const;

type CharacterPresetId = "emma" | "mike" | "sophie" | "jamie" | "lily" | "grandma_rose" | "dr_dan" | "leo";
type CharacterSetting = { displayName: string; voiceName: string; rate: number; pitch: number };

const INITIAL_CHARACTER_SETTINGS: Record<CharacterPresetId, CharacterSetting> = {
  emma: { displayName: "Emma", voiceName: "Google US English", rate: 0.95, pitch: 1 },
  mike: { displayName: "Mike", voiceName: "Google UK English Male", rate: 1.08, pitch: 1.08 },
  sophie: { displayName: "Sophie", voiceName: "Google US English", rate: 1.05, pitch: 1.1 },
  jamie: { displayName: "Jamie", voiceName: "Google UK English Male", rate: 0.92, pitch: 0.95 },
  lily: { displayName: "Lily", voiceName: "Google UK English Female", rate: 0.95, pitch: 1.08 },
  grandma_rose: { displayName: "Grandma Rose", voiceName: "Google UK English Female", rate: 0.82, pitch: 0.9 },
  dr_dan: { displayName: "Dr. Dan", voiceName: "Google UK English Male", rate: 0.85, pitch: 0.85 },
  leo: { displayName: "Leo", voiceName: "Google US English", rate: 1.1, pitch: 0.92 },
};

const CHARACTER_IDS = Object.keys(INITIAL_CHARACTER_SETTINGS) as CharacterPresetId[];

type VoiceSummary = {
  name: string;
  lang: string;
  default: boolean;
  localService: boolean;
  voiceURI: string;
};

function voiceOrder(voice: SpeechSynthesisVoice): number {
  const lang = voice.lang.toLowerCase();
  if (lang === "en-us") return 0;
  if (lang === "en-gb") return 1;
  return 2;
}

function englishVoices(): SpeechSynthesisVoice[] {
  return window.speechSynthesis.getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith("en"))
    .sort((left, right) =>
      voiceOrder(left) - voiceOrder(right) ||
      left.lang.localeCompare(right.lang) ||
      left.name.localeCompare(right.name)
    );
}

function summarize(voices: SpeechSynthesisVoice[]): VoiceSummary[] {
  return voices.map(({ name, lang, default: isDefault, localService, voiceURI }) => ({
    name,
    lang,
    default: isDefault,
    localService,
    voiceURI,
  }));
}

export default function TtsVoiceTester() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [sample, setSample] = useState<keyof typeof SAMPLES>("Conversation");
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterPresetId>("emma");
  const [characterSettings, setCharacterSettings] = useState<Record<CharacterPresetId, CharacterSetting>>(
    () => structuredClone(INITIAL_CHARACTER_SETTINGS)
  );
  const [copied, setCopied] = useState<"voices" | "characters" | null>(null);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const loadVoices = () => {
      const next = englishVoices();
      setVoices(next);
      console.table(summarize(next));
    };
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      cancelSpeechSynthesis(window.speechSynthesis, {
        reason: "tts-voice-tester:component-unmount",
        source: "TtsVoiceTester.cleanup",
        conversationState: "voice tester",
      });
    };
  }, []);

  const voiceListText = useMemo(
    () => JSON.stringify(summarize(voices), null, 2),
    [voices]
  );
  const selectedSetting = characterSettings[selectedCharacter];
  const selectedVoice = voices.find((voice) => voice.name === selectedSetting.voiceName);
  const characterSettingsText = useMemo(
    () => CHARACTER_IDS.map((id) => {
      const setting = characterSettings[id];
      return `${setting.displayName}\nvoice: ${setting.voiceName}\nrate: ${setting.rate.toFixed(2)}\npitch: ${setting.pitch.toFixed(2)}`;
    }).join("\n\n"),
    [characterSettings]
  );

  const play = (voice: SpeechSynthesisVoice, rate: number, pitch: number) => {
    const utterance = new SpeechSynthesisUtterance(SAMPLES[sample]);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = rate;
    utterance.pitch = pitch;
    cancelSpeechSynthesis(window.speechSynthesis, {
      reason: "tts-voice-tester:replace-preview",
      source: "TtsVoiceTester.play",
      conversationState: "voice tester",
    });
    window.speechSynthesis.speak(utterance);
  };

  const copyVoiceList = async () => {
    await navigator.clipboard.writeText(voiceListText);
    setCopied("voices");
    window.setTimeout(() => setCopied(null), 1500);
  };

  const chooseCharacter = (id: CharacterPresetId) => {
    setSelectedCharacter(id);
    const setting = characterSettings[id];
    const voice = voices.find((candidate) => candidate.name === setting.voiceName);
    if (voice) play(voice, setting.rate, setting.pitch);
  };

  const updateSelectedSetting = (update: Partial<Pick<CharacterSetting, "voiceName" | "rate" | "pitch">>) => {
    setCharacterSettings((current) => ({
      ...current,
      [selectedCharacter]: { ...current[selectedCharacter], ...update },
    }));
  };

  const copyCharacterSettings = async () => {
    await navigator.clipboard.writeText(characterSettingsText);
    setCopied("characters");
    window.setTimeout(() => setCopied(null), 1500);
  };

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>TTS Voice Tester</h1>
      <label>
        Sample:{" "}
        <select value={sample} onChange={(event) => setSample(event.target.value as keyof typeof SAMPLES)}>
          {Object.keys(SAMPLES).map((name) => <option key={name}>{name}</option>)}
        </select>
      </label>
      <p><strong>Text:</strong> {SAMPLES[sample]}</p>

      <section style={{ border: "2px solid #777", borderRadius: 10, padding: 16, margin: "24px 0" }}>
        <h2 style={{ marginTop: 0 }}>Character Presets</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {CHARACTER_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={selectedCharacter === id}
              onClick={() => chooseCharacter(id)}
              style={{ fontWeight: selectedCharacter === id ? 700 : 400 }}
            >
              {characterSettings[id].displayName}
            </button>
          ))}
        </div>

        <h3>Selected Character: {selectedSetting.displayName}</h3>
        <label>
          Voice:{" "}
          <select
            value={selectedVoice ? selectedSetting.voiceName : ""}
            onChange={(event) => updateSelectedSetting({ voiceName: event.target.value })}
            disabled={!voices.length}
          >
            {!selectedVoice && <option value="">{selectedSetting.voiceName} (Unavailable)</option>}
            {voices.map((voice) => <option key={`${voice.voiceURI}-${voice.lang}`} value={voice.name}>{voice.name} ({voice.lang})</option>)}
          </select>
        </label>

        <div style={{ display: "grid", gap: 12, maxWidth: 420, margin: "16px 0" }}>
        <label>
            Rate: <output>{selectedSetting.rate.toFixed(2)}</output>
          <input
            type="range"
            min="0.7"
            max="1.2"
              step="0.01"
              value={selectedSetting.rate}
              onChange={(event) => updateSelectedSetting({ rate: Number(event.target.value) })}
            style={{ width: "100%" }}
          />
        </label>
        <label>
            Pitch: <output>{selectedSetting.pitch.toFixed(2)}</output>
          <input
            type="range"
            min="0.7"
            max="1.3"
              step="0.01"
              value={selectedSetting.pitch}
              onChange={(event) => updateSelectedSetting({ pitch: Number(event.target.value) })}
            style={{ width: "100%" }}
          />
        </label>
        </div>

        <p>Voice: {selectedSetting.voiceName}<br />Rate: {selectedSetting.rate.toFixed(2)}<br />Pitch: {selectedSetting.pitch.toFixed(2)}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" disabled={!selectedVoice} onClick={() => selectedVoice && play(selectedVoice, selectedSetting.rate, selectedSetting.pitch)}>
            Play selected character
          </button>
          <button type="button" onClick={() => void copyCharacterSettings()}>
            {copied === "characters" ? "Copied" : "Copy character settings"}
          </button>
        </div>
      </section>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ marginRight: "auto" }}>English voices ({voices.length})</h2>
        <button type="button" onClick={() => void copyVoiceList()} disabled={!voices.length}>
          {copied === "voices" ? "Copied" : "Copy list"}
        </button>
      </div>

      {!voices.length && <p>No English voices are currently available. Waiting for voiceschanged…</p>}
      <div style={{ display: "grid", gap: 12 }}>
        {voices.map((voice) => (
          <article key={`${voice.voiceURI}-${voice.lang}`} style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>{voice.name}</h3>
            <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 12px" }}>
              <dt>lang</dt><dd>{voice.lang}</dd>
              <dt>default</dt><dd>{String(voice.default)}</dd>
              <dt>localService</dt><dd>{String(voice.localService)}</dd>
              <dt>voiceURI</dt><dd style={{ overflowWrap: "anywhere" }}>{voice.voiceURI}</dd>
            </dl>
            <button type="button" onClick={() => play(voice, 1, 1)}>Play at 1.00 / 1.00</button>
          </article>
        ))}
      </div>

      <details style={{ marginTop: 24 }}>
        <summary>Copyable JSON</summary>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{voiceListText}</pre>
      </details>
    </main>
  );
}
