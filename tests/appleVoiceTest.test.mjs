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

test("A, B, and C keep the production voice while varying only rate and pitch", () => {
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
  assert.match(source, /utterance\.voice = voice/);
  assert.match(source, /utterance\.rate = trial\.rate/);
  assert.match(source, /utterance\.pitch = trial\.pitch/);
  assert.match(source, /cancelSpeechSynthesis\(window\.speechSynthesis/);
  assert.match(source, /speechSynthesis\.speak\(utterance\)/);
  assert.doesNotMatch(source, /speakEn|speakSpeechQueue|speakEnSentences|startRecognition/);
});
