import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const wrapper = await read("../src/sound/cancelSpeechSynthesis.ts");
const speech = await read("../src/sound/speakEn.ts");
const home = await read("../src/ui/pages/HomePage.tsx");
const appleVoiceTest = await read("../src/components/AppleVoiceTest.tsx");
const voiceTester = await read("../src/components/TtsVoiceTester.tsx");

test("the common cancel wrapper records the required diagnostic fields before cancel", () => {
  const logAt = wrapper.indexOf('tossaPerf("TTS", "TTS CANCEL REQUEST"');
  const cancelAt = wrapper.indexOf("synth.cancel()");
  assert.ok(logAt >= 0 && cancelAt > logAt);
  for (const field of [
    "timestamp", "reason", "caller", "source", "characterId", "utteranceId", "generation",
    "currentTtsState", "currentScreen", "conversationState",
  ]) assert.match(wrapper, new RegExp(`${field}:`));
});

test("runtime TypeScript cancel paths use the diagnostic wrapper", () => {
  for (const source of [speech, home, appleVoiceTest, voiceTester]) {
    assert.doesNotMatch(source, /(?:speechSynthesis|synth|window\.speechSynthesis)\.cancel\(\)/);
  }
  assert.match(speech, /setActiveTtsState\(\{[\s\S]*?utteranceId,[\s\S]*?generation,[\s\S]*?phase: "speak-called"/);
  assert.match(speech, /speakEnSentences:utterance-onerror/);
  assert.match(speech, /speakSpeechQueue:utterance-onerror/);
});
