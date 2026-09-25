import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/ai/conversationCancelPolicy.ts", import.meta.url), "utf8");
const hookSource = await readFile(new URL("../src/hooks/useCharacterSpeech.ts", import.meta.url), "utf8");
const uiSource = await readFile(new URL("../src/components/AiConversationUI.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const { shouldCancelConversation } = await import(moduleUrl);

const state = (overrides = {}) => ({
  lessonStage: "partnerSelect",
  phase: "idle",
  partnerSelectionReady: true,
  reviewActive: false,
  ...overrides,
});

test("partner selection state updates cannot cancel an active Emma guide", () => {
  assert.equal(shouldCancelConversation("selection-inactivity", state({ phase: "ttsPending", partnerSelectionReady: false })), false);
  assert.equal(shouldCancelConversation("selection-inactivity", state({ phase: "speaking", partnerSelectionReady: false })), false);
  assert.equal(shouldCancelConversation("conversation-inactivity", state({ phase: "speaking" })), false);
});

test("an explicit user cancel remains effective during speech", () => {
  assert.equal(shouldCancelConversation("user", state({ phase: "speaking", partnerSelectionReady: false })), true);
});

test("valid inactivity cancellation remains available outside active TTS", () => {
  assert.equal(shouldCancelConversation("selection-inactivity", state()), true);
  assert.equal(shouldCancelConversation("conversation-inactivity", state({ lessonStage: "conversation", phase: "recognizing" })), true);
  assert.equal(shouldCancelConversation("review-inactivity", state({ reviewActive: true })), true);
});

test("new speech replacement and lesson end still cancel active TTS", () => {
  assert.match(hookSource, /cancelSpeechRef\.current\?\.\("useCharacterSpeech:speak-assistant-replaces-current"\)/);
  assert.match(hookSource, /cancelSpeechRef\.current\?\.\("useCharacterSpeech:speak-items-replaces-current"\)/);
  assert.match(uiSource, /stopInteraction\("conversation:lesson-ended"\)/);
});
