import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/components/AppleVoiceTest.tsx", import.meta.url), "utf8");

test("Apple Voice Test selects all nine production characters", () => {
  for (const id of ["emma", "mike", "sophie", "jamie", "lily", "grandma_rose", "dr_dan", "leo", "miyabi"]) {
    assert.match(source, new RegExp(`"${id}"`));
  }
  assert.match(source, /CHARACTER_PROFILES\[characterId\]/);
  assert.match(source, /profile\.voicePreferences\.ios/);
  assert.match(source, /preference\.preferredVoices\?\.\[0\]/);
  assert.match(source, /speechSynthesis\.getVoices\(\)/);
  assert.match(source, /voiceschanged/);
});

test("eight non-Miyabi characters keep the production voice while varying only rate and pitch", () => {
  assert.match(source, /label: "A Calm"/);
  assert.match(source, /label: "B Current", rate: preference\.rate, pitch: preference\.pitch/);
  assert.match(source, /label: "C Bright"/);
  assert.match(source, /preference\.rate - 0\.05/);
  assert.match(source, /preference\.pitch - 0\.04/);
  assert.match(source, /preference\.rate \+ 0\.05/);
  assert.match(source, /preference\.pitch \+ 0\.04/);
  assert.match(source, /clamp\(preference\.rate/);
  assert.doesNotMatch(source, /setCharacterProfile|localStorage|sessionStorage/);
});

test("voice trials are isolated and Miyabi uses Japanese comparison text", () => {
  assert.match(source, /profile\.conversationLanguage === "ja" \? JAPANESE_SAMPLE : ENGLISH_SAMPLE/);
  assert.match(source, /new SpeechSynthesisUtterance\(sample\)/);
  assert.match(source, /utterance\.voice = selectedVoice/);
  assert.match(source, /utterance\.rate = rate/);
  assert.match(source, /utterance\.pitch = pitch/);
  assert.match(source, /cancelSpeechSynthesis\(window\.speechSynthesis/);
  assert.match(source, /speechSynthesis\.speak\(utterance\)/);
  assert.doesNotMatch(source, /speakEn|speakSpeechQueue|speakEnSentences|startRecognition/);
});

test("Miyabi uses three intentionally wide Kyoko rate and pitch trials", () => {
  assert.match(source, /characterId === "miyabi"/);
  assert.match(source, /label: "A Calm", rate: 0\.85, pitch: 0\.9/);
  assert.match(source, /label: "B Current", rate: preference\.rate, pitch: preference\.pitch/);
  assert.match(source, /label: "C Bright", rate: 1\.3, pitch: 1\.18/);
  assert.doesNotMatch(source, /japaneseVoiceCandidates|MIYABI_CANDIDATE_LABELS/);
  assert.match(source, /そうなんですね。私もそれ、ちょっと気になってました。/);
  assert.doesNotMatch(source, /setCharacterProfile|localStorage|sessionStorage/);
});
