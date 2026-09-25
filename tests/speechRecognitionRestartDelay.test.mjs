import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const uiSource = await readFile(new URL("../src/components/AiConversationUI.tsx", import.meta.url), "utf8");
const timingSource = await readFile(new URL("../src/ai/speechRecognitionTiming.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(timingSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { ttsRecognitionRestartDelayMs } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("post-TTS recognition restart delay is Apple-specific", () => {
  assert.equal(ttsRecognitionRestartDelayMs("ios"), 750);
  assert.equal(ttsRecognitionRestartDelayMs("android"), 250);
  assert.equal(ttsRecognitionRestartDelayMs("desktop"), 250);
  assert.match(uiSource, /delay = ttsRecognitionRestartDelayMs\(detectDeviceGroup\(\)\)/);
  assert.match(uiSource, /recognition restart requested", \{ generation: token, userTurnId: userTurnIdRef\.current, delayMs: delay/);
});
