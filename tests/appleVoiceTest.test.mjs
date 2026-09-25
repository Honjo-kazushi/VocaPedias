import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/components/AppleVoiceTest.tsx", import.meta.url), "utf8");
const profiles = await readFile(new URL("../src/characters/characterProfiles.ts", import.meta.url), "utf8");

test("Apple Voice Test covers all characters with at most three actual device voices", () => {
  for (const id of ["emma", "mike", "sophie", "jamie", "lily", "grandma_rose", "dr_dan", "leo", "miyabi"]) {
    assert.match(source, new RegExp(`"${id}"`));
    assert.match(profiles, new RegExp(`^  ${id}: \\{`, "m"));
  }
  assert.match(source, /speechSynthesis\.getVoices\(\)/);
  assert.match(source, /getCharacterVoiceCandidates/);
  assert.match(source, /deviceGroup: "ios"/);
  assert.match(source, /limit: 3/);
  assert.match(source, /voicePreferences\.ios/);
  assert.match(source, /voiceschanged/);
});

test("voice trials are isolated and use fixed comparison text and candidate tuning", () => {
  assert.match(source, /new SpeechSynthesisUtterance/);
  assert.match(source, /utterance\.voice = candidate\.voice/);
  assert.match(source, /utterance\.rate = candidate\.rate/);
  assert.match(source, /utterance\.pitch = candidate\.pitch/);
  assert.match(source, /speechSynthesis\.cancel\(\)/);
  assert.match(source, /speechSynthesis\.speak\(utterance\)/);
  assert.doesNotMatch(source, /speakEn|speakSpeechQueue|speakEnSentences|startRecognition/);
});
