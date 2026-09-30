import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const promptSource = await readFile(new URL("../src/ai/buildConversationPrompt.ts", import.meta.url), "utf8");
const chatSource = await readFile(new URL("../src/ai/chatWithTutor.ts", import.meta.url), "utf8");
const uiSource = await readFile(new URL("../src/components/AiConversationUI.tsx", import.meta.url), "utf8");
const scenePrompt = promptSource.slice(promptSource.indexOf("export function buildSceneRoleplayPrompt"));

test("topic continuation allows natural non-question turns and explicit closing", () => {
  assert.match(promptSource, /A question is one option, not a requirement/);
  assert.match(promptSource, /QUESTION, REACTION, SELF_DISCLOSURE, WAIT, or CLOSE/);
  assert.match(promptSource, /do not invent a question merely to continue/);
  assert.match(chatSource, /Return valid JSON only in this exact shape/);
  assert.match(chatSource, /The action must describe the response you actually wrote/);
});

test("a topic close waits for partner TTS before requesting the existing review", () => {
  assert.match(uiSource, /response\.action === "CLOSE"/);
  assert.match(uiSource, /queueAssistantSpeech\(reply, token, \(\) => \{/);
  assert.match(uiSource, /requestLessonReview\(completedMessages, token\)/);
});

test("scene role-play prompt keeps its existing practical question flow", () => {
  assert.match(scenePrompt, /one brief reaction and one short practical question/);
  assert.doesNotMatch(scenePrompt, /QUESTION, REACTION, SELF_DISCLOSURE, WAIT, or CLOSE/);
});
