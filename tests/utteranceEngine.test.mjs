import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/ai/utteranceEngine.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { createUtteranceEngineState, observeUtteranceRecognition, decideUtteranceTurn } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const observe = (values) => values.reduce((state, transcript, index) => observeUtteranceRecognition(state, { transcript, isFinal: index === values.length - 1, sessionId: 1, timestamp: index * 500 }), createUtteranceEngineState());
const decide = (values, candidate, overrides = {}) => decideUtteranceTurn(observe(values), { candidate, language: "en", now: 3000, ...overrides });

test("an incomplete sentence keeps listening", () => {
  assert.equal(decide(["I love you too", "I love you too but you are speaking about letting"], "I love you too but you are speaking about letting").action, "continueListening");
  assert.equal(decide(["I think"], "I think").action, "continueListening");
  assert.equal(decide(["because"], "because").action, "continueListening");
});

test("adequate short contextual answers commit without a blanket delay", () => {
  for (const answer of ["At home.", "By myself."]) {
    assert.equal(decide([answer], answer, { previousAssistantText: "Where do you usually listen?" }).action, "commitUtterance", answer);
  }
});

test("unstable and implausible recognition asks for clarification", () => {
  const values = ["I like led", "I like the temp", "I like the temple", "I like read the temple"];
  const held = decide(values, values.at(-1), { previousAssistantText: "What music do you like?" });
  assert.equal(held.action, "continueListening");
  const result = decide(values, values.at(-1), { hardDeadline: true, hasHeld: true, previousAssistantText: "What music do you like?" });
  assert.equal(result.action, "requestClarification");
  assert.equal(result.recognitionConfidence, "low");
  assert.equal(result.semanticConfidence, "low");
  assert.equal(result.clarificationLevel, 2);
});

test("an unexpected but coherent topic change is committed", () => {
  assert.equal(decide(["Actually I want to talk about gardening"], "Actually I want to talk about gardening", { previousAssistantText: "What music do you like?" }).action, "commitUtterance");
});

test("final is evidence, not automatic commitment", () => {
  const state = observe(["I want to"]);
  assert.equal(state.observations.at(-1).isFinal, true);
  assert.equal(decideUtteranceTurn(state, { candidate: "I want to", language: "en", now: 3000 }).action, "continueListening");
});

test("stable final with meaning-reversal risk holds and never reaches Gemini directly", () => {
  const text = "I have a anytime I should what right now";
  const state = observe([text]);
  const first = decideUtteranceTurn(state, { candidate: text, language: "en", now: 3000 });
  assert.equal(first.action, "continueListening");
  assert.equal(first.recognitionConfidence, "high");
  assert.equal(first.semanticConfidence, "low");
  const second = decideUtteranceTurn(state, { candidate: text, language: "en", now: 4000, hasHeld: true, hardDeadline: true });
  assert.equal(second.action, "requestClarification");
});

test("garbled option answer is medium confidence and commits cautiously after hold", () => {
  const text = "to around the trip to skate please";
  const state = observe([text]);
  const context = { candidate: text, language: "en", now: 3000, previousAssistantText: "One-way or round trip?" };
  const first = decideUtteranceTurn(state, context);
  assert.equal(first.semanticConfidence, "medium");
  assert.equal(first.action, "commitUtterance");
  assert.equal(first.likelyIntent, "round trip");
});

test("recognition instability alone does not force clarification when meaning is clear", () => {
  const result = decide(["I go shop", "I go shopping", "I go shopping nearby"], "I go shopping nearby", { hardDeadline: true, hasHeld: true });
  assert.equal(result.recognitionConfidence, "high");
  assert.equal(result.semanticConfidence, "high");
  assert.equal(result.action, "commitUtterance");
});

test("semantic landing outranks a syntactically optional continuation", () => {
  const result = decide(["I can remember that"], "I can remember that.");
  assert.equal(result.syntacticCompletion, "incomplete");
  assert.equal(result.semanticLanding, true);
  assert.equal(result.couldContinue, true);
  assert.equal(result.needsContinuation, false);
  assert.equal(result.completion, "complete");
  assert.equal(result.semanticConfidence, "high");
  assert.equal(result.action, "commitUtterance");
});

test("conversation-function replies land without hold", () => {
  for (const answer of ["Me too.", "At home.", "Cash, please."]) {
    const result = decide([answer], answer, { previousAssistantText: "How about you?" });
    assert.equal(result.semanticLanding, true, answer);
    assert.equal(result.action, "commitUtterance", answer);
  }
});

test("semantic landing outranks trailing continuation words", () => {
  for (const answer of ["Yes, I think so.", "I guess so.", "That's right."]) {
    const result = decide([answer], answer, { previousAssistantText: "Do you agree?" });
    assert.equal(result.semanticLanding, true, answer);
    assert.equal(result.needsContinuation, false, answer);
    assert.equal(result.semanticConfidence, "high", answer);
    assert.equal(result.action, "commitUtterance", answer);
  }
});

test("an unlanded clause with a continuation ending keeps listening", () => {
  for (const answer of ["I think...", "Because..."]) {
    const result = decide([answer], answer, { previousAssistantText: "What do you think?" });
    assert.equal(result.semanticLanding, false, answer);
    assert.equal(result.needsContinuation, true, answer);
    assert.equal(result.action, "continueListening", answer);
  }
});

test("a turn converges after at most two holds", () => {
  const state = observe(["I want to"]);
  const result = decideUtteranceTurn(state, { candidate: "I want to", language: "en", now: 3000, holdCount: 2 });
  assert.equal(result.needsContinuation, true);
  assert.equal(result.action, "requestClarification");
});

test("open yes-no answers get one context-aware grace window", () => {
  const first = decide(["Yes"], "Yes", { previousAssistantText: "Do you play soccer?", deviceTimingProfile: "ios" });
  assert.equal(first.previousTurnExpectation, "YES_NO_OPEN");
  assert.equal(first.turnCompletionType, "TURN_COMPLETE_CONTINUABLE");
  assert.equal(first.shortAnswerContinuationLikelihood, "HIGH");
  assert.equal(first.shortAnswerGraceStarted, true);
  assert.equal(first.shortAnswerGraceMs, 900);
  assert.equal(first.action, "continueListening");

  const afterGrace = decide(["Yes"], "Yes", { previousAssistantText: "Do you play soccer?", hasHeld: true, holdCount: 1, hardDeadline: true, deviceTimingProfile: "ios" });
  assert.equal(afterGrace.action, "commitUtterance");
});

test("a short answer extension is evaluated and committed as one turn", () => {
  const result = decide(["Yes", "Yes I do every weekend"], "Yes I do every weekend.", { previousAssistantText: "Do you play soccer?", hasHeld: true, holdCount: 1 });
  assert.equal(result.turnCompletionType, "TURN_COMPLETE_FINAL");
  assert.equal(result.action, "commitUtterance");
  assert.equal(result.committedUtterance, "Yes I do every weekend.");
});

test("confirmation and choice answers remain fast final turns", () => {
  const confirmation = decide(["Yes"], "Yes.", { previousAssistantText: "Is that right?" });
  assert.equal(confirmation.previousTurnExpectation, "YES_NO_CONFIRMATION");
  assert.equal(confirmation.shortAnswerContinuationLikelihood, "LOW");
  assert.equal(confirmation.turnCompletionType, "TURN_COMPLETE_FINAL");
  assert.equal(confirmation.action, "commitUtterance");

  const choice = decide(["Cash"], "Cash.", { previousAssistantText: "Cash or card?" });
  assert.equal(choice.previousTurnExpectation, "CHOICE");
  assert.equal(choice.turnCompletionType, "TURN_COMPLETE_FINAL");
  assert.equal(choice.action, "commitUtterance");
});

test("a polar answer is inadequate for a WH question", () => {
  const first = decide(["Yes"], "Yes.", { previousAssistantText: "Why do you like soccer?" });
  assert.equal(first.previousTurnExpectation, "WH_OPEN");
  assert.equal(first.answerAdequacy, "insufficient");
  assert.equal(first.turnCompletionType, "TURN_INCOMPLETE");
  assert.equal(first.action, "continueListening");
});

test("other short continuable replies use question context", () => {
  const result = decide(["Maybe"], "Maybe.", { previousAssistantText: "Would you try it?", deviceTimingProfile: "desktop" });
  assert.equal(result.shortAnswerDetected, true);
  assert.equal(result.shortAnswerContinuationLikelihood, "HIGH");
  assert.equal(result.shortAnswerGraceMs, 550);
});

test("instruction acknowledgements are pragmatically complete", () => {
  for (const answer of ["Okay.", "Sure.", "Here you are."]) {
    const result = decide([answer], answer, { previousAssistantText: "Please roll up your sleeve." });
    assert.equal(result.previousTurnExpectation, "INSTRUCTION_ACK", answer);
    assert.equal(result.semanticLanding, true, answer);
    assert.equal(result.turnCompletionType, "TURN_COMPLETE_FINAL", answer);
    assert.equal(result.action, "commitUtterance", answer);
  }
});

test("open negative answers can merge a following contrast", () => {
  const result = decide(["No", "No but I'd like to go someday"], "No but I'd like to go someday.", { previousAssistantText: "Have you been there?", hasHeld: true, holdCount: 1 });
  assert.equal(result.previousTurnExpectation, "YES_NO_OPEN");
  assert.equal(result.action, "commitUtterance");
  assert.equal(result.turnCompletionType, "TURN_COMPLETE_FINAL");
});
