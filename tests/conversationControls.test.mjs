import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/ai/conversationControls.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
const { applySpeechRateIntent, detectSpeechRateIntent, isConversationEndIntent } = await import(moduleUrl);

test("detects slow, normal, and faster requests without matching ordinary conversation", () => {
  assert.equal(detectSpeechRateIntent("Could you speak more slowly?"), "slow");
  assert.equal(detectSpeechRateIntent("A little slower, please."), "slow");
  assert.equal(detectSpeechRateIntent("You're speaking too fast."), "slow");
  assert.equal(detectSpeechRateIntent("Speak normally."), "normal");
  assert.equal(detectSpeechRateIntent("A little faster, please."), "faster");
  assert.equal(detectSpeechRateIntent("I went to the store yesterday."), null);
});

test("rate multiplier stays within the session range", () => {
  assert.equal(applySpeechRateIntent(1, "slow"), 0.9);
  assert.equal(applySpeechRateIntent(0.9, "slow"), 0.8);
  assert.equal(applySpeechRateIntent(0.8, "slow"), 0.8);
  assert.equal(applySpeechRateIntent(0.8, "faster"), 0.9);
  assert.equal(applySpeechRateIntent(0.9, "faster"), 1);
  assert.equal(applySpeechRateIntent(0.8, "normal"), 1);
});

test("detects explicit English and Japanese conversation endings only", () => {
  for (const phrase of ["Let's stop here.", "Let's finish here.", "Let's end here.", "Let's end the conversation.", "Let's end our conversation.", "Let us end our conversation.", "Let's end conversation.", "I want to end this conversation.", "I would like to finish our conversation.", "I'd like to end the conversation.", "Can we stop the conversation?", "Let's stop our conversation.", "That's enough for today.", "I'm done for today.", "See you.", "Bye."]) {
    assert.equal(isConversationEndIntent(phrase, "en"), true, phrase);
  }
  assert.equal(isConversationEndIntent("I finished my work.", "en"), false);
  assert.equal(isConversationEndIntent("The movie ended early.", "en"), false);
  for (const phrase of ["今日はここまで", "この会話終わろう", "もう終わりにしよう", "またね", "じゃあね"]) {
    assert.equal(isConversationEndIntent(phrase, "ja"), true, phrase);
  }
  assert.equal(isConversationEndIntent("I saw him yesterday.", "en"), false);
  assert.equal(isConversationEndIntent("The movie ended.", "en"), false);
  assert.equal(isConversationEndIntent('He said, "Let\'s end our conversation."', "en"), false);
  assert.equal(isConversationEndIntent("I said goodbye to my friend.", "en"), false);
  assert.equal(isConversationEndIntent("We talked about ending the meeting.", "en"), false);
  assert.equal(isConversationEndIntent("What do you say when you finish a conversation?", "en"), false);
});
