import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const timingSource = await readFile(new URL("../src/ai/speechRecognitionTiming.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(timingSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { classifyUserTurnSoftTimeout, decideSoftTimerFire } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

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
  for (const transcript of ["I have to", "I stayed because", "Yes and", "Maybe or", "I waited while"]) {
    assert.equal(decide(transcript).timeoutMs, 2400, transcript);
  }
});

test("a recent long-turn continuation decision holds 2400ms when growth briefly disappears", () => {
  const decision = decide("I love to do but I have no time", { continuationHold: true });
  assert.equal(decision.wordCount, 9);
  assert.equal(decision.kind, "likelyContinuing");
  assert.equal(decision.timeoutMs, 2400);
  assert.equal(decision.continuationHold, true);
  assert.deepEqual(decision.reasons, ["continuation-hold"]);
});

test("the reproduced long phrase ending in to remains likelyContinuing", () => {
  const decision = decide("I love to do but I have no time to", { continuationHold: true });
  assert.equal(decision.wordCount, 10);
  assert.equal(decision.lastWord, "to");
  assert.equal(decision.kind, "likelyContinuing");
  assert.equal(decision.timeoutMs, 2400);
});

test("ordinary and merely short phrases use 1800ms", () => {
  assert.equal(decide("I went to Kyoto.").timeoutMs, 1800);
  assert.equal(decide("I think").timeoutMs, 1800);
  assert.equal(decide("Maybe I").timeoutMs, 1800);
  assert.equal(decide("I like coffee.", { continuationHold: true }).timeoutMs, 1800);
});

test("continuation hold never slows short completed replies", () => {
  assert.equal(decide("Yes", { continuationHold: true }).timeoutMs, 1400);
  assert.equal(decide("No", { continuationHold: true }).timeoutMs, 1400);
  assert.equal(decide("I don't know", { continuationHold: true }).timeoutMs, 1400);
  assert.equal(decide("Thank you", { continuationHold: true }).timeoutMs, 1800);
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

test("soft timer fire extends an active interim growth trend once", () => {
  assert.deepEqual(decideSoftTimerFire({
    recentGrowthCount: 2,
    lastGrowthAgeMs: 1900,
    lastResultAgeMs: 1900,
    continuationHold: true,
    latestIsFinal: false,
    alreadyExtended: false,
  }), { extend: true, extensionMs: 800, reason: "recent-growth-hold" });
  assert.equal(decideSoftTimerFire({
    recentGrowthCount: 2,
    lastGrowthAgeMs: 2700,
    lastResultAgeMs: 2700,
    continuationHold: true,
    latestIsFinal: false,
    alreadyExtended: true,
  }).extend, false);
});

test("soft timer fire does not delay final, stable, or silent input", () => {
  for (const context of [
    { recentGrowthCount: 0, lastGrowthAgeMs: 1800, lastResultAgeMs: 1800, continuationHold: false, latestIsFinal: true, alreadyExtended: false },
    { recentGrowthCount: 0, lastGrowthAgeMs: null, lastResultAgeMs: 1800, continuationHold: false, latestIsFinal: false, alreadyExtended: false },
    { recentGrowthCount: 2, lastGrowthAgeMs: 4000, lastResultAgeMs: 4000, continuationHold: false, latestIsFinal: false, alreadyExtended: false },
  ]) assert.equal(decideSoftTimerFire(context).extend, false);
});

test("UI preserves progress on continuation restart and resets it for a new turn and finalization", async () => {
  const ui = await readFile(new URL("../src/components/AiConversationUI.tsx", import.meta.url), "utf8");
  assert.match(ui, /if \(continuing\)[\s\S]*?\} else \{[\s\S]*?recognitionProgressRef\.current = \{ previousTranscript: "", lastResultAt: null, lastGrowthAt: null, recentGrowth: \[\], latestIsFinal: false \}/);
  assert.match(ui, /utteranceBufferRef\.current = "";\s*recognitionProgressRef\.current = \{ previousTranscript: "", lastResultAt: null, lastGrowthAt: null, recentGrowth: \[\], latestIsFinal: false \}/);
  assert.match(ui, /scheduleMicrophoneStart\(token, 100, true\)/);
  assert.doesNotMatch(ui, /if \(continuing\)[^{]*\{[^}]*recognitionProgressRef\.current =/);
  assert.match(ui, /continuationHoldRef\.current = \{ userTurnId, startedAt: now \}/);
  assert.match(ui, /continuationHoldRef\.current = null/);
  assert.match(ui, /holdState\?\.userTurnId === userTurnId/);
  assert.match(ui, /holdAgeMs <= CONTINUATION_HOLD_MS/);
  assert.match(ui, /decideSoftTimerFire/);
  assert.match(ui, /softTimerExtendedRef\.current = true/);
});
