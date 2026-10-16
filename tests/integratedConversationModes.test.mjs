import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const ui = await readFile(new URL("../src/components/AiConversationUI.tsx", import.meta.url), "utf8");
const chat = await readFile(new URL("../src/ai/chatWithTutor.ts", import.meta.url), "utf8");
const freeTalkSelection = await readFile(new URL("../src/ai/freeTalkCharacterSelection.ts", import.meta.url), "utf8");

test("the entry UI exposes Topic, Scene, and direct random-character Free Talk", () => {
  assert.match(ui, /type ConversationMode = "TOPIC" \| "SCENE" \| "FREE_TALK"/);
  assert.match(ui, />\s*トピック会話\s*</);
  assert.match(ui, />\s*場面英会話\s*</);
  assert.match(ui, />\s*フリートーク\s*</);
  assert.match(freeTalkSelection, /FREE_TALK_CHARACTER_IDS:[\s\S]*"emma"[\s\S]*"miyabi"/);
  assert.match(ui, /chooseFreeTalkCharacter\(loadLastFreeTalkCharacter\(\)\)/);
  const freeTalkBlock = ui.slice(ui.indexOf("const beginFreeTalk"), ui.indexOf("const selectPartner"));
  assert.match(freeTalkBlock, /setLessonStage\("conversation"\)/);
  assert.doesNotMatch(freeTalkBlock, /setLessonStage\("partnerSelect"\)/);
});

test("Free Talk has dedicated English, Emma, and Miyabi rules and skips Review", () => {
  assert.match(chat, /There is no lesson topic to complete/);
  assert.match(chat, /relaxed conversation, not a lesson or review/);
  assert.match(chat, /central subject of this Free Talk must be English/);
  assert.match(chat, /Start a short, relaxed conversation in English about the user's English practice/);
  assert.match(chat, /Miyabi is having a normal casual conversation in Japanese/);
  assert.match(chat, /elapsedSeconds >= 240/);
  assert.match(ui, /conversationMode === "FREE_TALK"[\s\S]*returnToTopRef\.current\("user"\)/);
});

test("Free Talk selects at most one optional memory per conversation and prioritizes the current topic", () => {
  assert.match(ui, /selectConversationMemoryForUse\([\s\S]*loadConversationMemories\(\)[\s\S]*loadLastUsedFreeTalkMemoryId\(\)/);
  assert.match(ui, /memory: memorySelection\.selectedMemory/);
  assert.match(chat, /memoryGuidance\(setup\.memory \? \[setup\.memory\] : \[\]\)/);
  assert.match(chat, /Always prioritize the user's current message, active topic, character role, and current situation over memory/);
  assert.match(chat, /do not need to mention it/);
  assert.match(chat, /do not return to it repeatedly/);
});

test("Scene completion is goal-based and closes only after final TTS", () => {
  assert.match(chat, /Judge goal achievement from the Scene Goal, not turn count/);
  assert.match(chat, /sceneStatus":"IN_PROGRESS\|GOAL_REACHED/);
  assert.match(ui, /progression\.goalAccepted/);
  assert.match(ui, /finishSceneClosing/);
  assert.match(ui, /queueAssistantSpeech\(response\.reply, token, \(\) => \{[\s\S]*requestLessonReview\(completedMessages, token\)/);
  assert.match(ui, /"Scene completion decision"[\s\S]*sceneGoal: scene\.goal[\s\S]*completionReason: response\.completionReason[\s\S]*userTurn: snapshot\.text/);
  assert.match(chat, /completionReason[^\n]*diagnostic metadata/);
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
