import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ui = await readFile(new URL("../src/components/AiConversationUI.tsx", import.meta.url), "utf8");
const prompt = await readFile(new URL("../src/ai/buildConversationPrompt.ts", import.meta.url), "utf8");
const chat = await readFile(new URL("../src/ai/chatWithTutor.ts", import.meta.url), "utf8");

test("Topic Conversation exposes CHANGE_TOPIC with explicit CLOSE separation", () => {
  assert.match(prompt, /QUESTION, REACTION, SELF_DISCLOSURE, WAIT, CHANGE_TOPIC, or CLOSE/);
  assert.match(prompt, /Wanting to end the current topic is not wanting to end today's conversation/);
  assert.match(chat, /"action":"QUESTION\|REACTION\|SELF_DISCLOSURE\|WAIT\|CHANGE_TOPIC\|CLOSE"/);
});

test("CHANGE_TOPIC waits for user choice while keeping the partner and skipping Review", () => {
  const branch = ui.slice(ui.indexOf('if (action === "CHANGE_TOPIC")'), ui.indexOf('} else if (action === "CLOSE")'));
  assert.match(branch, /waitingForUserChoice/);
  assert.match(branch, /What would you like to talk about/);
  assert.match(branch, /delegatesTopicChoice\(snapshot\.text\)/);
  assert.match(ui, /conversationLanguage === "ja"[\s\S]*Sure, let's talk about something else/);
  assert.doesNotMatch(branch, /setPartnerId|requestLessonReview/);
  assert.match(ui, /pendingTopicChange\?\.state === "waitingForUserChoice"/);
  assert.match(ui, /resolveRequestedTopic\(snapshot\.text/);
  assert.match(ui, /selectionMode: requestedTopic \? "user-choice" : "random"/);
  assert.match(ui, /topicChangeStateRef\.current = null;[\s\S]*setTopic\(nextTopic\)/);
});

test("topic selection explicitly falls back across Fixed and Fresh without reusing the current topic", () => {
  assert.match(ui, /choices\.every\(\(candidate\) => candidate\.id === excludedTopicId\)/);
  assert.match(ui, /\.\.\.TALK_TOPICS, \.\.\.freshTopics[\s\S]*candidate\.id !== excludedTopicId/);
});
