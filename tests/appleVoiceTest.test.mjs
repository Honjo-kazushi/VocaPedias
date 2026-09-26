import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/components/AppleVoiceTest.tsx", import.meta.url), "utf8");
test("Apple Voice Test exposes three fixed trials for each character under review", () => {
  for (const id of ["sophie", "jamie", "grandma_rose", "leo"]) {
    assert.match(source, new RegExp(`"${id}"`));
  }
  assert.match(source, /speechSynthesis\.getVoices\(\)/);
  assert.match(source, /voiceschanged/);
  assert.equal((source.match(/\{ label: "[ABC]"/g) ?? []).length, 12);
  assert.match(source, /voiceName: "Samantha", lang: "en-US", rate: 0\.93, pitch: 1\.06/);
  assert.match(source, /voiceName: "Reed", lang: "en-US", rate: 0\.96, pitch: 0\.98/);
  assert.match(source, /voiceName: "Moira", lang: "en-IE", rate: 0\.9, pitch: 0\.96/);
  assert.match(source, /voiceName: "Junior", lang: "en-US", rate: 1, pitch: 1\.1/);
  assert.match(source, /voiceName: "Junior", lang: "en-US", rate: 1, pitch: 1\.14/);
  assert.match(source, /voiceName: "Junior", lang: "en-US", rate: 1, pitch: 1\.16/);
});

test("voice trials are isolated and use fixed comparison text and candidate tuning", () => {
  assert.match(source, /new SpeechSynthesisUtterance/);
  assert.match(source, /utterance\.voice = voice/);
  assert.match(source, /utterance\.rate = candidate\.rate/);
  assert.match(source, /utterance\.pitch = candidate\.pitch/);
  assert.match(source, /cancelSpeechSynthesis\(window\.speechSynthesis/);
  assert.match(source, /speechSynthesis\.speak\(utterance\)/);
  assert.doesNotMatch(source, /speakEn|speakSpeechQueue|speakEnSentences|startRecognition/);
});
