import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const uiSource = await readFile(new URL("../src/components/AiConversationUI.tsx", import.meta.url), "utf8");
const chatSource = await readFile(new URL("../src/ai/chatWithTutor.ts", import.meta.url), "utf8");
const speechSource = await readFile(new URL("../src/sound/speakEn.ts", import.meta.url), "utf8");
const styleSource = await readFile(new URL("../src/styles/style.css", import.meta.url), "utf8");

test("Help is an English-listening-only rescue event outside UserTurnSnapshot history", () => {
  assert.match(uiSource, /conversationLanguage === "en"[\s\S]*awaitingUserInput[\s\S]*!rescueBusy/);
  assert.match(uiSource, /uiLanguage === "en" \? "\? Help" : "？ わからない"/);
  const rescueBlock = uiSource.slice(uiSource.indexOf("const requestRescue"), uiSource.indexOf("const endLesson"));
  assert.match(rescueBlock, /stopInteraction\(\)/);
  assert.doesNotMatch(rescueBlock, /createUserTurnSnapshot|setMessages/);
  assert.match(rescueBlock, /explainEnglishMessageInJapanese/);
  assert.match(rescueBlock, /lang: "ja-JP"/);
  assert.match(rescueBlock, /scheduleMicrophoneStart\(token, 250, true\)/);
  assert.match(chatSource, /直前の英語発話を、日本語で短く分かりやすく説明してください/);
  assert.match(uiSource, /const visibleCharacter = rescueBusy \? getCharacter\("miyabi"\) : character/);
  assert.match(rescueBlock, /characterId: "miyabi"/);
  assert.match(rescueBlock, /\}, "miyabi"\)/);
  assert.doesNotMatch(rescueBlock, /setPartnerId\("miyabi"\)/);
});

test("session speech rate applies only to partner English TTS and resets for new sessions", () => {
  assert.match(uiSource, /detectSpeechRateIntent\(snapshot\.text\)/);
  assert.match(uiSource, /rateMultiplier: speechRateMultiplierRef\.current/);
  assert.match(uiSource, /speechRateMultiplierRef\.current = 1/);
  assert.match(speechSource, /if \(!isJapanese\) utter\.rate \*=/);
});

test("voice ending skips a partner closing and uses the existing Review flow", () => {
  assert.match(uiSource, /isConversationEndIntent\(snapshot\.text, conversationLanguage\)/);
  assert.match(uiSource, /void requestLessonReview\(nextMessages, token\)/);
});

test("partner selection scrolls by DOM position only when Cancel is outside the viewport", () => {
  assert.match(uiSource, /getBoundingClientRect\(\)/);
  assert.match(uiSource, /bounds\.bottom > window\.innerHeight - 12/);
  assert.match(uiSource, /scrollIntoView\(\{ behavior: "smooth", block: "end" \}\)/);
  assert.match(uiSource, /requestAnimationFrame\(\(\) => \{[\s\S]*requestAnimationFrame/);
  assert.match(uiSource, /partnerListEndRef/);
  assert.doesNotMatch(uiSource, /window\.scrollTo/);
});

test("mobile scene spacing and character baseline are adjusted without resizing characters", () => {
  assert.match(styleSource, /\.scene-roleplay-select \{[\s\S]*max-height: calc\(100dvh - 225px\)[\s\S]*padding: 10px 12px 12px/);
  assert.match(styleSource, /\.character-avatar-stack \{[\s\S]*transform: translateY\(12px\)/);
});

test("Listening and Help stay rendered across recognition restarts until the turn is finalized", () => {
  assert.match(uiSource, /const \[awaitingUserInput, setAwaitingUserInput\] = useState\(false\)/);
  assert.match(uiSource, /onStart: \(\) => \{[\s\S]*setAwaitingUserInput\(true\)/);
  assert.match(uiSource, /finalizeUserTurn[\s\S]*setAwaitingUserInput\(false\)/);
  assert.match(uiSource, /\{awaitingUserInput[\s\S]*Listening/);
});

test("a finalized end phrase is handled immediately and skips the normal Gemini continuation", () => {
  assert.match(uiSource, /onFinalTranscript:[\s\S]*isConversationEndIntent\(utteranceBufferRef\.current, conversationLanguage\)[\s\S]*finalizeUserTurn\("soft"\)/);
  const endBranch = uiSource.slice(uiSource.indexOf('if (isConversationEndIntent(snapshot.text'), uiSource.indexOf('try {', uiSource.indexOf('if (isConversationEndIntent(snapshot.text')));
  assert.doesNotMatch(endBranch, /continueTutorConversation|continueSceneRoleplay/);
  assert.doesNotMatch(endBranch, /speakAssistantMessage|queueAssistantSpeech|conversationClosing/);
});

test("End Lesson interrupts busy partner or rescue speech and invalidates stale callbacks", () => {
  const endLessonBlock = uiSource.slice(uiSource.indexOf("const endLesson"), uiSource.indexOf("const minutes"));
  assert.match(endLessonBlock, /lessonEndingRef\.current/);
  assert.doesNotMatch(endLessonBlock.split("return;")[0], /requestBusyRef\.current/);
  assert.match(endLessonBlock, /\+\+startTokenRef\.current/);
  assert.match(endLessonBlock, /stopInteraction\(\)/);
  assert.match(endLessonBlock, /setRescueBusy\(false\)/);
  assert.match(endLessonBlock, /requestLessonReview\(messages, token\)/);
  assert.doesNotMatch(uiSource, /onClick=\{\(\) => void endLesson\(\)\}[\s\S]{0,100}disabled=\{busy\}/);
});

test("only Opening Emma moves up while Review and partner baselines stay unchanged", () => {
  assert.match(styleSource, /\.ai-intro-portrait \.character-avatar\.intro \{[\s\S]*translateY\(-10px\)/);
  assert.match(styleSource, /\.character-avatar-stack \{[\s\S]*translateY\(12px\)/);
  assert.doesNotMatch(styleSource, /\.ai-review[^{]*\{[^}]*transform:/);
});

test("AI conversation does not add a repeated application listening sound", () => {
  assert.doesNotMatch(uiSource, /playSe|new Audio|start\.mp3/);
});
