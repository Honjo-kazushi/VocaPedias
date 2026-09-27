import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const uiSource = await readFile(new URL("../src/components/AiConversationUI.tsx", import.meta.url), "utf8");
const timingSource = await readFile(new URL("../src/ai/speechRecognitionTiming.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(timingSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { ttsRecognitionRestartDelayMs, userTurnSoftTimeoutMs } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("the baseline user turn soft timeout is common to every device", () => {
  assert.equal(userTurnSoftTimeoutMs("desktop"), 1800);
  assert.equal(userTurnSoftTimeoutMs("android"), 1800);
  assert.equal(userTurnSoftTimeoutMs("ios"), 1800);
  assert.equal(userTurnSoftTimeoutMs("fallback"), 1800);
  assert.match(uiSource, /const softTimeoutMs = decision\.timeoutMs/);
  assert.match(uiSource, /soft timer fire", \{ generation: token, userTurnId, timeoutMs: softTimeoutMs, softTimerKind: decision\.kind, deviceGroup \}/);
  assert.match(uiSource, /\}, softTimeoutMs\)/);
});

test("post-TTS recognition restart delay is Apple-specific", () => {
  assert.equal(ttsRecognitionRestartDelayMs("ios"), 750);
  assert.equal(ttsRecognitionRestartDelayMs("android"), 250);
  assert.equal(ttsRecognitionRestartDelayMs("desktop"), 250);
  assert.match(uiSource, /delay = ttsRecognitionRestartDelayMs\(detectDeviceGroup\(\)\)/);
  assert.match(uiSource, /recognition restart requested", \{ generation: token, userTurnId: userTurnIdRef\.current, delayMs: delay/);
});
