import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

let source = await readFile(new URL("../src/ai/sceneProgression.ts", import.meta.url), "utf8");
source = source.replace(/^import type .*$/gm, "");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { createSceneProgressState, applySceneProgression, beginSceneClosing, finishSceneClosing } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const turn = (overrides = {}) => ({
  reply: "A round trip. The fare is ten dollars.", action: "WAIT", goalStatus: "COMPLETED", sceneStatus: "COMPLETED", goalReached: true, shouldCloseInteraction: true, responseType: "closed", completionReason: "Done.",
  progress: { currentPhase: "ticket type", newlyConfirmedInformation: ["ticketType=roundTrip"], uncertainInformation: [], requiredInformationRemaining: ["destination", "payment"], completionReady: false },
  ...overrides,
});

test("one understood scene fact cannot jump through remaining phases", () => {
  const result = applySceneProgression(createSceneProgressState(), turn(), "medium");
  assert.equal(result.state.confirmedInformation.length, 0);
  assert.equal(result.state.sceneStatus, "IN_PROGRESS");
  assert.equal(result.state.uncertainInformation.includes("ticketType=roundTrip"), true);
  assert.ok(result.reasons.includes("semantic-confidence-below-goal-threshold"));
  assert.ok(result.reasons.includes("required-information-remains"));
});

test("goal achievement enters GOAL_REACHED instead of completing immediately", () => {
  const result = applySceneProgression(createSceneProgressState(), turn({
    progress: { currentPhase: "handoff", newlyConfirmedInformation: ["ticketDelivered=true"], uncertainInformation: [], requiredInformationRemaining: [], completionReady: true },
  }), "high");
  assert.equal(result.goalAccepted, true);
  assert.equal(result.state.sceneStatus, "GOAL_REACHED");
  assert.equal(result.state.shouldCloseInteraction, false);
  const closing = beginSceneClosing(result.state);
  assert.equal(closing.sceneStatus, "CLOSING");
  assert.equal(closing.shouldCloseInteraction, false);
  const completed = finishSceneClosing(closing);
  assert.equal(completed.sceneStatus, "COMPLETED");
  assert.equal(completed.closingTtsFinished, true);
  assert.equal(completed.shouldCloseInteraction, true);
});

test("a goal-reaching question is replaced by a non-question closing line", () => {
  const result = applySceneProgression(createSceneProgressState(), turn({
    reply: "Anything else?", action: "QUESTION",
    progress: { currentPhase: "goal reached", newlyConfirmedInformation: ["directionsUnderstood=true"], uncertainInformation: [], requiredInformationRemaining: [], completionReady: true },
  }), "high");
  assert.equal(result.state.sceneStatus, "GOAL_REACHED");
  assert.equal(result.turn.action, "WAIT");
  assert.doesNotMatch(result.turn.reply, /[?？]\s*$/);
});
