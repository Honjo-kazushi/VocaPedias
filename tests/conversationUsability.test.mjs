import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const uiSource = await readFile(new URL("../src/components/AiConversationUI.tsx", import.meta.url), "utf8");
const chatSource = await readFile(new URL("../src/ai/chatWithTutor.ts", import.meta.url), "utf8");
const speechSource = await readFile(new URL("../src/sound/speakEn.ts", import.meta.url), "utf8");
const styleSource = await readFile(new URL("../src/styles/style.css", import.meta.url), "utf8");

test("Help is an English-listening-only rescue event outside UserTurnSnapshot history", () => {
  assert.match(uiSource, /conversationLanguage === "en"[\s\S]*phase === "recognizing"[\s\S]*recognitionActive[\s\S]*!rescueBusy/);
  assert.match(uiSource, /uiLanguage === "en" \? "\? Help" : "？ わからない"/);
  const rescueBlock = uiSource.slice(uiSource.indexOf("const requestRescue"), uiSource.indexOf("const endLesson"));
  assert.match(rescueBlock, /stopInteraction\(\)/);
  assert.doesNotMatch(rescueBlock, /createUserTurnSnapshot|setMessages/);
  assert.match(rescueBlock, /explainEnglishMessageInJapanese/);
  assert.match(rescueBlock, /lang: "ja-JP"/);
  assert.match(rescueBlock, /scheduleMicrophoneStart\(token, 250, true\)/);
  assert.match(chatSource, /直前の英語発話を、日本語で短く分かりやすく説明してください/);
});

test("session speech rate applies only to partner English TTS and resets for new sessions", () => {
  assert.match(uiSource, /detectSpeechRateIntent\(snapshot\.text\)/);
  assert.match(uiSource, /rateMultiplier: speechRateMultiplierRef\.current/);
  assert.match(uiSource, /speechRateMultiplierRef\.current = 1/);
  assert.match(speechSource, /if \(!isJapanese\) utter\.rate \*=/);
});

test("voice ending uses a fixed closing and the existing Review flow", () => {
  assert.match(uiSource, /isConversationEndIntent\(snapshot\.text, conversationLanguage\)/);
  assert.match(uiSource, /conversationClosing\(conversationLanguage\)/);
  assert.match(uiSource, /reason === "complete"\) void requestLessonReview\(nextMessages, token\)/);
});

test("partner selection scrolls by DOM position only when Cancel is outside the viewport", () => {
  assert.match(uiSource, /getBoundingClientRect\(\)/);
  assert.match(uiSource, /bounds\.bottom > window\.innerHeight - 12/);
  assert.match(uiSource, /scrollIntoView\(\{ behavior: "smooth", block: "end" \}\)/);
  assert.doesNotMatch(uiSource, /window\.scrollTo/);
});

test("mobile scene spacing and character baseline are adjusted without resizing characters", () => {
  assert.match(styleSource, /\.scene-roleplay-select \{[\s\S]*max-height: calc\(100dvh - 225px\)[\s\S]*padding: 10px 12px 12px/);
  assert.match(styleSource, /\.character-avatar-stack \{[\s\S]*transform: translateY\(6px\)/);
});

test("AI conversation does not add a repeated application listening sound", () => {
  assert.doesNotMatch(uiSource, /playSe|new Audio|start\.mp3/);
});
