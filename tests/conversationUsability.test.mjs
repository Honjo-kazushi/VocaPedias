import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const uiSource = await readFile(new URL("../src/components/AiConversationUI.tsx", import.meta.url), "utf8");
const chatSource = await readFile(new URL("../src/ai/chatWithTutor.ts", import.meta.url), "utf8");
const speechSource = await readFile(new URL("../src/sound/speakEn.ts", import.meta.url), "utf8");
const styleSource = await readFile(new URL("../src/styles/style.css", import.meta.url), "utf8");
const promptSource = await readFile(new URL("../src/ai/buildConversationPrompt.ts", import.meta.url), "utf8");

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
  assert.match(uiSource, /mouthOpenRef: miyabiMouthOpenRef/);
  assert.match(uiSource, /rescueBusy \? miyabiMouthOpenRef : partnerMouthOpenRef/);
  assert.match(uiSource, /stopMiyabiSpeech\(\)/);
  assert.match(rescueBlock, /speakMiyabiItems/);
  assert.match(rescueBlock, /characterId: "miyabi"/);
  assert.match(rescueBlock, /\}, "miyabi"\)/);
  assert.doesNotMatch(rescueBlock, /setPartnerId\("miyabi"\)/);
  assert.match(uiSource, /rescueBusy \? "help-rescue" : ""/);
  assert.match(styleSource, /\.character-stage\.help-rescue \.character-avatar-stack\.avatar-miyabi[\s\S]*width: 150px;[\s\S]*height: 150px;/);
  assert.match(styleSource, /\.character-stage\.help-rescue \.character-avatar-stack\.avatar-miyabi \{[\s\S]*margin: 0 auto;/);
});

test("session speech rate applies only to partner English TTS and resets for new sessions", () => {
  assert.match(uiSource, /detectSpeechRateIntent\(snapshot\.text\)/);
  assert.match(uiSource, /rateMultiplier: speechRateMultiplierRef\.current/);
  assert.match(uiSource, /speechRateMultiplierRef\.current = 1/);
  assert.match(speechSource, /if \(!isJapanese\) utter\.rate \*=/);
});

test("spoken farewells remain normal conversation turns and do not auto-end the lesson", () => {
  assert.doesNotMatch(uiSource, /isConversationEndIntent/);
  assert.match(uiSource, /continueSceneRoleplay\(scene, nextMessages/);
  assert.match(uiSource, /continueTutorConversation\(topic!, nextMessages/);
});

test("partner selection scrolls by DOM position only when the list end is outside the viewport", () => {
  assert.match(uiSource, /getBoundingClientRect\(\)/);
  assert.match(uiSource, /getBoundingClientRect\(\)\.bottom > window\.innerHeight - 12/);
  assert.match(uiSource, /scrollIntoView\(\{ behavior: "smooth", block: "end" \}\)/);
  assert.match(uiSource, /needsScroll \? 700 : 0/);
  assert.match(uiSource, /partnerListEndRef/);
  assert.doesNotMatch(uiSource, /window\.scrollTo/);
});

test("mobile scene spacing and character baseline are adjusted without resizing characters", () => {
  assert.match(styleSource, /\.scene-roleplay-select \{[\s\S]*max-height: calc\(100dvh - 225px\)[\s\S]*padding: 10px 12px 12px/);
  assert.match(styleSource, /\.character-avatar-stack \{[\s\S]*transform: translateY\(12px\)/);
});

test("Help follows the user-visible answer wait without flickering across recognition restarts", () => {
  assert.match(uiSource, /const \[awaitingUserInput, setAwaitingUserInput\] = useState\(false\)/);
  assert.match(uiSource, /const \[hasRecognizedSpeech, setHasRecognizedSpeech\] = useState\(false\)/);
  assert.match(uiSource, /onStart: \(\) => \{[\s\S]*setAwaitingUserInput\(true\)/);
  const speechStartBlock = uiSource.slice(uiSource.indexOf("onSpeechStart: () =>"), uiSource.indexOf("onSpeechEnd: () =>"));
  assert.doesNotMatch(speechStartBlock, /setHasRecognizedSpeech\(true\)/);
  const transcriptBlock = uiSource.slice(uiSource.indexOf("onTranscript: (text) =>"), uiSource.indexOf("onDebug:"));
  assert.match(transcriptBlock, /text\.trim\(\)[\s\S]*setHasRecognizedSpeech\(true\)/);
  assert.match(uiSource, /finalizeUserTurn[\s\S]*setAwaitingUserInput\(false\)/);
  assert.match(uiSource, /\{awaitingUserInput[\s\S]*Listening/);
  assert.match(uiSource, /awaitingUserInput && !hasRecognizedSpeech && !busy && !rescueBusy/);
  const recognitionEndBlock = uiSource.slice(uiSource.indexOf("onEnd: () =>"), uiSource.indexOf("onCancel: () =>"));
  assert.doesNotMatch(recognitionEndBlock, /setAwaitingUserInput|setHasRecognizedSpeech/);
});

test("empty Review sections disappear instead of rendering placeholder text", () => {
  assert.match(uiSource, /REVIEW_SECTION_DEFINITIONS\.filter/);
  assert.match(uiSource, /sections\[definition\.key\]\.length > 0/);
  assert.doesNotMatch(uiSource, /該当なし|今回はありません|Nothing this time/);
});

test("Review inactivity returns to top after five minutes and resets on explicit interaction", () => {
  assert.match(uiSource, /reviewInactivityTimerRef/);
  assert.match(uiSource, /armReviewInactivityTimer[\s\S]*CONVERSATION_INACTIVITY_TIMEOUT_MS/);
  assert.match(uiSource, /className="ai-review" onPointerDown=\{armReviewInactivityTimer\}/);
});

test("partner list scroll inspection finishes before Emma starts the selection guide", () => {
  const block = uiSource.slice(uiSource.indexOf("const announcement = pendingPartnerAnnouncementRef.current"), uiSource.indexOf("useEffect(() => {", uiSource.indexOf("const announcement = pendingPartnerAnnouncementRef.current") + 20));
  assert.match(block, /400/);
  assert.match(block, /getBoundingClientRect\(\)\.bottom > window\.innerHeight - 12/);
  assert.match(block, /scrollIntoView\(\{ behavior: "smooth", block: "end" \}\)/);
  assert.match(block, /needsScroll \? 700 : 0/);
  assert.match(block, /announcePartnerSelection\(announcement, token\)/);
});

test("conversation and selection inactivity return directly to top with bounded timers", () => {
  assert.match(uiSource, /CONVERSATION_INACTIVITY_TIMEOUT_MS = 5 \* 60 \* 1000/);
  assert.match(uiSource, /SELECTION_INACTIVITY_TIMEOUT_MS = 3 \* 60 \* 1000/);
  assert.match(uiSource, /conversationInactivityTimerRef[\s\S]*returnToTopRef\.current\(\)/);
  assert.match(uiSource, /lessonStage !== "sceneSelect"[\s\S]*SELECTION_INACTIVITY_TIMEOUT_MS/);
  assert.match(uiSource, /lessonStage !== "partnerSelect" \|\| !partnerSelectionReady[\s\S]*SELECTION_INACTIVITY_TIMEOUT_MS/);
  assert.match(uiSource, /returnToTopRef\.current = cancelPartnerSelection/);
});

test("partner picker animates exactly one real character and excludes Anyone", () => {
  assert.match(uiSource, /const candidates = \[\.\.\.ENGLISH_PARTNERS, MIYABI\]/);
  assert.match(uiSource, /let characterBag = shuffled\(candidates\)/);
  assert.match(uiSource, /let expressionBag = shuffled\(expressionKeys\)/);
  assert.match(uiSource, /const selected = characterBag\.shift\(\)!/);
  assert.match(uiSource, /const expression = expressionBag\.shift\(\)!/);
  assert.match(uiSource, /characterBag\[0\]\.id === previousCharacterId/);
  assert.match(uiSource, /expressionBag\[0\] === previousExpression/);
  assert.match(uiSource, /setSelectionPreview\(\{[\s\S]*characterId: selected\.id/);
  assert.match(uiSource, /1000 \+ Math\.random\(\) \* 1000/);
  assert.match(uiSource, /selectionPreview\?\.characterId === partner\.id/);
  assert.doesNotMatch(uiSource, /selectionPreview\?\.characterId === ["']anyone["']/);
});

test("topic prompts require one immediately answerable concrete question", () => {
  assert.match(chatSource, /one small, concrete question that is easy to answer immediately/);
  assert.match(uiSource, /showRescueButton/);
  assert.match(promptSource, /Prefer yes\/no, a simple choice, a favorite thing, a recent simple experience/);
  assert.match(promptSource, /prefer "Is your town quiet or busy\?" over "What is your town like\?"/);
  assert.match(promptSource, /Ask only one small chunk at a time/);
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

test("Review actions keep next-topic behavior and Cancel returns to the AI conversation top", () => {
  const reviewBlock = uiSource.slice(uiSource.indexOf("{review ? ("), uiSource.indexOf(') : lessonStage === "sceneSelect"'));
  assert.match(reviewBlock, /scene \? beginSceneSelection\(\) : void beginLesson\(chooseTopic\(freshTopics\)\)/);
  assert.match(reviewBlock, /onClick=\{cancelPartnerSelection\}>Cancel/);
  assert.match(uiSource, /cancelPartnerSelection[\s\S]*\+\+startTokenRef\.current|cancelPartnerSelection[\s\S]*startTokenRef\.current \+= 1/);
  assert.match(uiSource, /cancelPartnerSelection[\s\S]*stopInteraction\(\)/);
  assert.match(uiSource, /cancelPartnerSelection[\s\S]*setShowIntro\(true\)/);
  assert.match(uiSource, /cancelPartnerSelection[\s\S]*setReview\(null\)/);
  assert.doesNotMatch(reviewBlock, /chooseTopic\(freshTopics\)[\s\S]*onClick=\{cancelPartnerSelection\}[\s\S]*chooseTopic/);
  assert.match(styleSource, /\.ai-review-actions \{[\s\S]*display: flex/);
});

test("Help button is yellow and bold without changing its rescue handler", () => {
  assert.match(styleSource, /\.ai-help-button \{[\s\S]*background: #ffd84d;[\s\S]*font-weight: 700/);
  assert.match(uiSource, /className="ai-help-button"[\s\S]*onClick=\{\(\) => void requestRescue\(\)\}/);
});

test("conversation ending state blocks every path back to Listening", () => {
  assert.match(uiSource, /const scheduleMicrophoneStart[\s\S]*if \(lessonEndingRef\.current\) return/);
  assert.match(uiSource, /requestBusyRef\.current \|\| lessonEndingRef\.current\) return/);
  assert.match(uiSource, /reason === "complete" && !lessonEndingRef\.current/);
  assert.match(uiSource, /review \|\| lessonEndingRef\.current \|\| requestBusyRef\.current/);
  assert.match(uiSource, /onStart: \(\) => \{[\s\S]*startTokenRef\.current !== token \|\| lessonEndingRef\.current/);
});

test("only Opening Emma moves up while Review and partner baselines stay unchanged", () => {
  assert.match(styleSource, /\.ai-intro-portrait \.character-avatar\.intro \{[\s\S]*translateY\(-10px\)/);
  assert.match(styleSource, /\.character-avatar-stack \{[\s\S]*translateY\(12px\)/);
  assert.doesNotMatch(styleSource, /\.ai-review[^{]*\{[^}]*transform:/);
});

test("AI conversation intro keeps its Japanese guidance on two intentional lines", () => {
  assert.match(uiSource, /自由なトピック会話か、場面英会話を<br \/>選んで始めましょう。/);
});

test("AI conversation does not add a repeated application listening sound", () => {
  assert.doesNotMatch(uiSource, /playSe|new Audio|start\.mp3/);
});
