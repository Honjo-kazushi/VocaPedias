import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const timingSource = await readFile(new URL("../src/ai/speechRecognitionTiming.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(timingSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { classifyUserTurnSoftTimeout } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const decide = (transcript, overrides = {}) => classifyUserTurnSoftTimeout({
  transcript,
  language: "en",
  lastResultIntervalMs: null,
  recentGrowthCount: 0,
  ...overrides,
});

test("complete short expressions use 1400ms", () => {
  assert.equal(decide("Yes.").timeoutMs, 1400);
  assert.equal(decide("I don't know.").timeoutMs, 1400);
});

test("continuation words and incomplete patterns take priority and use 2400ms", () => {
  assert.equal(decide("Yes, but").timeoutMs, 2400);
  assert.equal(decide("I want to").timeoutMs, 2400);
});

test("ordinary and merely short phrases use 1800ms", () => {
  assert.equal(decide("I went to Kyoto.").timeoutMs, 1800);
  assert.equal(decide("I think").timeoutMs, 1800);
  assert.equal(decide("Maybe I").timeoutMs, 1800);
});

test("two growth updates among the latest three within 900ms use 2400ms", () => {
  const decision = decide("I went to Kyoto", { lastResultIntervalMs: 350, recentGrowthCount: 2 });
  assert.equal(decision.kind, "likelyContinuing");
  assert.equal(decision.timeoutMs, 2400);
  assert.ok(decision.reasons.includes("recent-growth"));
});

test("repeated transcript without a growth trend uses 1800ms", () => {
  assert.equal(decide("I went to Kyoto", { lastResultIntervalMs: 350, recentGrowthCount: 0 }).timeoutMs, 1800);
});

test("Japanese transcript uses the normal 1800ms decision", () => {
  assert.equal(decide("はい", { language: "ja", lastResultIntervalMs: 200, recentGrowthCount: 3 }).timeoutMs, 1800);
});

test("UI preserves progress on continuation restart and resets it for a new turn and finalization", async () => {
  const ui = await readFile(new URL("../src/components/AiConversationUI.tsx", import.meta.url), "utf8");
  assert.match(ui, /if \(continuing\)[\s\S]*?\} else \{[\s\S]*?recognitionProgressRef\.current = \{ previousTranscript: "", lastResultAt: null, recentGrowth: \[\] \}/);
  assert.match(ui, /utteranceBufferRef\.current = "";\s*recognitionProgressRef\.current = \{ previousTranscript: "", lastResultAt: null, recentGrowth: \[\] \}/);
  assert.match(ui, /scheduleMicrophoneStart\(token, 100, true\)/);
  assert.doesNotMatch(ui, /if \(continuing\)[^{]*\{[^}]*recognitionProgressRef\.current =/);
});
