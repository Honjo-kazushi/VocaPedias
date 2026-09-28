import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/sound/speakEn.ts", import.meta.url), "utf8");

test("TTS diagnostics separate native queue wait from the inter-utterance gap", () => {
  assert.match(source, /queueWaitMs = speakCalledAt === 0 \? null : Math\.round\(startedAt - speakCalledAt\)/);
  assert.match(source, /interUtteranceGapMs = previousOnEndAt === null \? null : Math\.round\(startedAt - previousOnEndAt\)/);
  assert.doesNotMatch(source, /previousOnEndToSpeakMs/);
});
