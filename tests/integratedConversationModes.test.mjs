import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const ui = await readFile(new URL("../src/components/AiConversationUI.tsx", import.meta.url), "utf8");
const chat = await readFile(new URL("../src/ai/chatWithTutor.ts", import.meta.url), "utf8");

test("the entry UI exposes Topic, Scene, and direct random-character Free Talk", () => {
  assert.match(ui, /type ConversationMode = "TOPIC" \| "SCENE" \| "FREE_TALK"/);
  assert.match(ui, />\s*Talk Topic\s*</);
  assert.match(ui, />\s*Scene Role-play\s*</);
  assert.match(ui, />\s*Free Talk\s*</);
  assert.match(ui, /FREE_TALK_CHARACTER_IDS: readonly CharacterId\[\] = \["emma", \.\.\.CONVERSATION_PARTNER_IDS\]/);
  const freeTalkBlock = ui.slice(ui.indexOf("const beginFreeTalk"), ui.indexOf("const selectPartner"));
  assert.match(freeTalkBlock, /setLessonStage\("conversation"\)/);
  assert.doesNotMatch(freeTalkBlock, /setLessonStage\("partnerSelect"\)/);
});

test("Free Talk has dedicated English, Emma, and Miyabi rules and skips Review", () => {
  assert.match(chat, /There is no lesson topic to complete/);
  assert.match(chat, /casual free talk, not a lesson or review/);
  assert.match(chat, /Miyabi is having a normal casual conversation in Japanese/);
  assert.match(chat, /elapsedSeconds >= 240/);
  assert.match(ui, /conversationMode === "FREE_TALK"[\s\S]*returnToTopRef\.current\("user"\)/);
});

test("Scene completion is goal-based and closes only after final TTS", () => {
  assert.match(chat, /Judge completion from the Scene Goal, not turn count/);
  assert.match(chat, /goalStatus":"IN_PROGRESS\|COMPLETED/);
  assert.match(ui, /response\.goalStatus === "COMPLETED" \|\| response\.action === "CLOSE"/);
  assert.match(ui, /queueAssistantSpeech\(response\.reply, token, \(\) => \{[\s\S]*requestLessonReview\(completedMessages, token\)/);
});

test("End generates a farewell and branches to Review or Free Talk exit after TTS", () => {
  const endStart = ui.indexOf("const endLesson");
  const endBlock = ui.slice(endStart, ui.indexOf("handleSilenceStageRef.current", endStart));
  assert.match(endBlock, /generateConversationFarewell/);
  assert.match(endBlock, /queueAssistantSpeech\(farewell, token, \(\) =>/);
  assert.match(endBlock, /conversationMode === "FREE_TALK"/);
  assert.match(endBlock, /requestLessonReview\(completedMessages, token\)/);
});

test("silence uses three delayed prompts and never transitions before farewell TTS", () => {
  assert.match(ui, /SILENCE_CHECK_TIMEOUT_MS = 45 \* 1000/);
  assert.match(ui, /SILENCE_CONFIRM_TIMEOUT_MS = 35 \* 1000/);
  assert.match(ui, /SILENCE_AUTO_CLOSE_TIMEOUT_MS = 35 \* 1000/);
  assert.match(ui, /"NORMAL" \| "CHECK" \| "CONFIRM_END" \| "AUTO_CLOSE"/);
  assert.match(ui, /Still thinking\? Take your time\./);
  assert.match(ui, /Want to keep going, or stop here for today\?/);
  assert.match(ui, /Okay, let's stop here for today\. See you next time\./);
  assert.match(ui, /queueAssistantSpeech\(text, token, \(\) =>/);
});
