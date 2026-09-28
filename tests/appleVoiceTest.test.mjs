import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/components/AppleVoiceTest.tsx", import.meta.url), "utf8");

test("iPad voice comparison is limited to explicit PERF debug sessions", () => {
  assert.match(source, /iPhone\|iPad\|iPod/);
  assert.match(source, /navigator\.maxTouchPoints > 1/);
  assert.match(source, /get\("perfDebug"\) === "1"/);
  assert.match(source, /if \(!isAppleTouchPerfDebug\(\)\) return null/);
});

test("only available requested English voices appear in the comparison", () => {
  for (const [name, lang] of [["Samantha", "en-US"], ["Daniel", "en-GB"], ["Karen", "en-AU"], ["Moira", "en-IE"], ["Rishi", "en-IN"]]) {
    assert.match(source, new RegExp(`name: "${name}", lang: "${lang}"`));
  }
  assert.match(source, /speechSynthesis\.getVoices\(\)/);
  assert.match(source, /voiceschanged/);
  assert.match(source, /return voice \? \[voice\] : \[\]/);
});

test("preview speech stays isolated from production character settings", () => {
  assert.match(source, /This is a voice test\. Can you hear me clearly\?/);
  assert.match(source, /new SpeechSynthesisUtterance\(SAMPLE\)/);
  assert.match(source, /utterance\.voice = selectedVoice/);
  assert.match(source, /cancelSpeechSynthesis\(window\.speechSynthesis/);
  assert.match(source, /speechSynthesis\.speak\(utterance\)/);
  assert.doesNotMatch(source, /CHARACTER_PROFILES|localStorage|sessionStorage|speakEnSentences/);
});
