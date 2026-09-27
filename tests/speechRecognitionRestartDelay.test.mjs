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

test("user turn soft timeout is longer only on Android and Apple touch devices", () => {
  assert.equal(userTurnSoftTimeoutMs("desktop"), 1500);
  assert.equal(userTurnSoftTimeoutMs("android"), 2200);
  assert.equal(userTurnSoftTimeoutMs("ios"), 2200);
  assert.equal(userTurnSoftTimeoutMs("fallback"), 1500);
  assert.match(uiSource, /const deviceGroup = detectDeviceGroup\(\);\s*const softTimeoutMs = userTurnSoftTimeoutMs\(deviceGroup\)/);
  assert.match(uiSource, /soft timer fire", \{ generation: token, userTurnId, timeoutMs: softTimeoutMs, deviceGroup \}/);
  assert.match(uiSource, /\}, softTimeoutMs\)/);
});

test("post-TTS recognition restart delay is Apple-specific", () => {
  assert.equal(ttsRecognitionRestartDelayMs("ios"), 750);
  assert.equal(ttsRecognitionRestartDelayMs("android"), 250);
  assert.equal(ttsRecognitionRestartDelayMs("desktop"), 250);
  assert.match(uiSource, /delay = ttsRecognitionRestartDelayMs\(detectDeviceGroup\(\)\)/);
  assert.match(uiSource, /recognition restart requested", \{ generation: token, userTurnId: userTurnIdRef\.current, delayMs: delay/);
});
