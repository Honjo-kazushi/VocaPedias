import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const toModule = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText).toString("base64")}`;

const expressionSource = await read("../src/characters/selectConversationExpression.ts");
const uiSource = await read("../src/components/AiConversationUI.tsx");
const avatarSource = await read("../src/components/CharacterAvatar.tsx");
const promptSource = await read("../src/ai/buildConversationPrompt.ts");
const idleSource = await read("../src/hooks/useIdleExpression.ts");
const characterSource = await read("../src/data/characters.ts");
const speechHookSource = await read("../src/hooks/useCharacterSpeech.ts");
const recognitionHookSource = await read("../src/hooks/useUserSpeechRecognition.ts");
const reviewPromptSource = await read("../src/ai/buildReviewPrompt.ts");
const styleSource = await read("../src/styles/style.css");
const expressionModule = await import(toModule(expressionSource));

const profile = (expressionBias) => ({ expressionBias });

test("conversation expression follows meaning and character bias rather than randomness", () => {
  const expressive = profile({ smile: 0.9, nod: 0.5, listening: 0.5, thinking: 0.2, surprised: 0.9 });
  const restrained = profile({ smile: 0.2, nod: 0.5, listening: 0.9, thinking: 0.9, surprised: 0.15 });
  assert.equal(expressionModule.selectConversationExpression({ assistantText: "Welcome!", isOpening: true, profile: expressive }), "smile");
  assert.equal(expressionModule.selectConversationExpression({ assistantText: "No way! What happened?", profile: expressive }), "surprised");
  assert.equal(expressionModule.selectConversationExpression({ assistantText: "Welcome.", isOpening: true, profile: restrained }), "neutral");
  assert.equal(expressionModule.selectConversationExpression({ assistantText: "Hmm, let me think.", profile: restrained }), "thinking");
  assert.doesNotMatch(expressionSource, /Math\.random/);
});

test("speech uses one avatar image and only the neutral mouth pair", () => {
  assert.match(uiSource, /queueAssistantSpeech = useCallback\(\(text: string, token: number\)/);
  assert.doesNotMatch(uiSource, /setPartnerExpression\(expression\)/);
  assert.doesNotMatch(uiSource, /selectConversationExpression/);
  assert.match(uiSource, /phase === "recognizing"/);
  assert.match(avatarSource, /const images = character\.expressions\[expression\]/);
  assert.match(avatarSource, /data-closed-src=\{neutral\.closed\}/);
  assert.match(avatarSource, /data-open-src=\{neutral\.open\}/);
  assert.match(avatarSource, /className="character-avatar character-mouth"/);
  assert.doesNotMatch(avatarSource, /character-mouth-open|character-mouth-closed/);
});

test("Emma opening changes calmly and ordinary prompts request short non-generic turns", () => {
  assert.match(uiSource, /expression="neutral"/);
  assert.match(uiSource, /onIntroImageLoad=\{finishIntroOpening\}/);
  assert.doesNotMatch(uiSource, /setIntroExpression/);
  assert.doesNotMatch(uiSource, /introExpressionStageRef/);
  assert.match(styleSource, /\.character-avatar\.intro\s*\{[\s\S]*height: min\(201px, 69vw\);[\s\S]*object-fit: cover/);
  assert.match(avatarSource, /intro-\$\{character\.id\}-\$\{expression\}/);
  assert.match(styleSource, /\.character-avatar\.intro-emma-smile\s*\{[\s\S]*translateY\(-10px\) scale\(0\.95\)/);
  assert.doesNotMatch(uiSource, /index === 0 \? "neutral" : "smile"/);
  assert.match(promptSource, /one brief, natural reaction followed by one short question/);
  assert.match(promptSource, /Do not routinely begin with/);
  assert.match(promptSource, /latest message is more important than covering the prepared angle/);
});

test("every conversation partner maps its real listening blink asset", () => {
  for (const id of ["mike", "sophie", "jamie", "lily", "grandma_rose", "dr_dan", "leo", "miyabi"]) {
    assert.match(characterSource, new RegExp(`${id}: \\{[^\\n]+listening: \\{ blink:`));
    assert.match(characterSource, new RegExp(`characters/${id}/${id}_listening_blink\\.png`));
  }
});

test("idle expressions are low-frequency, brief, and protected from stale timers", () => {
  assert.match(idleSource, /randomMs\(4000, 8000\)/);
  assert.match(idleSource, /randomMs\(150, 300\)/);
  assert.match(idleSource, /pose: "blink"/);
  assert.match(idleSource, /preload\.decode\(\)/);
  assert.match(idleSource, /generationRef\.current === generation/);
  assert.doesNotMatch(idleSource, /"thinking"/);
  assert.doesNotMatch(idleSource, /pose: "nod"/);
  assert.match(idleSource, /generationRef\.current !== generation/);
  assert.match(idleSource, /window\.clearTimeout\(timer\)/);
  assert.doesNotMatch(idleSource, /"surprised"/);
  assert.doesNotMatch(idleSource, /"smile"/);
  assert.match(uiSource, /openingIdleActive = showIntro && introOpeningComplete/);
  assert.match(uiSource, /idleActive = !review && !busy && phase === "idle" && !partnerIsSpeaking/);
  assert.match(uiSource, /phase === "recognizing" \|\| \(idleActive && idleVisual\.listening\)/);
});

test("Emma blinks after the opening and guides Scene selection with cancellable TTS", () => {
  assert.match(characterSource, /emma:[^\n]+listening: \{ blink: emmaListeningBlink/);
  assert.match(uiSource, /setIntroOpeningComplete\(true\)/);
  assert.match(uiSource, /isListening=\{openingIdleActive && idleVisual\.listening\}/);
  assert.match(uiSource, /SCENE_SELECTION_PROMPT = "Choose a scene you would like to practice\."/);
  assert.match(uiSource, /speakCharacterItems\(\[\{ lang: "en-US", text: SCENE_SELECTION_PROMPT \}\]/);
  assert.match(uiSource, /const cancelSceneSelection = useCallback/);
  assert.match(uiSource, /onClick=\{\(\) => runButtonAction\(cancelSceneSelection\)\}>Cancel/);
  assert.doesNotMatch(uiSource, />戻る</);
});

test("Emma Review has a dedicated Emma speech path", () => {
  assert.match(uiSource, /useCharacterSpeech\(REVIEW_CHARACTER\.id, "ja-JP"\)/);
  assert.match(uiSource, /speakReviewItems\(items/);
  assert.match(uiSource, /stopAssistantSpeech\(`\$\{reason\}:partner-speech`\);\s*stopReviewSpeech\(`\$\{reason\}:review-speech`\)/);
  assert.match(uiSource, /mouthOpenRef: reviewMouthOpenRef/);
  assert.match(uiSource, /characterId: REVIEW_CHARACTER\.id/);
  assert.match(uiSource, /avoidVoiceCharacterId: conversationLanguage === "ja"/);
  assert.match(speechHookSource, /const JAPANESE_MOUTH_TIMING = \{[\s\S]*open: \[180, 260\][\s\S]*close: \[120, 220\][\s\S]*phrasePause: \[280, 420\]/);
  assert.match(speechHookSource, /startMouthTimeline\(item\.text, item\.lang\)/);
});

test("conversation automatically alternates completed TTS and one final recognition result", () => {
  assert.match(uiSource, /reason === "complete" && !lessonEndingRef\.current\) scheduleMicrophoneStart\(token\)/);
  assert.match(uiSource, /scheduleMicrophoneStart\(token, 100, true\)/);
  assert.match(uiSource, /onFinalTranscript:/);
  assert.match(uiSource, /microphoneFallback &&/);
  assert.match(uiSource, />\s*音声入力を再開\s*</);
  assert.doesNotMatch(uiSource, /🎤 音声入力/);
  assert.match(recognitionHookSource, /result\.isFinal/);
  assert.match(recognitionHookSource, /mergeRecognitionResults\(finalChunks, language\)/);
  assert.match(recognitionHookSource, /mergeRecognitionResults\(interimChunks, language\)/);
  assert.doesNotMatch(recognitionHookSource, /finalAcceptedRef/);
  assert.doesNotMatch(recognitionHookSource, /if \(finalText\)[\s\S]{0,300}recognition\.stop\(\)/);
  const recognitionStartBlock = recognitionHookSource.slice(recognitionHookSource.indexOf("recognition.onstart"), recognitionHookSource.indexOf("recognition.onaudiostart"));
  const audioStartBlock = recognitionHookSource.slice(recognitionHookSource.indexOf("recognition.onaudiostart"), recognitionHookSource.indexOf("recognition.onsoundstart"));
  const soundStartBlock = recognitionHookSource.slice(recognitionHookSource.indexOf("recognition.onsoundstart"), recognitionHookSource.indexOf("recognition.onspeechstart"));
  assert.doesNotMatch(recognitionStartBlock, /armSilenceTimer\(\)/);
  assert.doesNotMatch(audioStartBlock, /armSilenceTimer\(\)/);
  assert.doesNotMatch(soundStartBlock, /armSilenceTimer\(\)/);
  assert.match(recognitionHookSource, /recognition\.onspeechstart = \(\) => \{[\s\S]*armSilenceTimer\(\)/);
  assert.match(recognitionHookSource, /recognition\.onresult = \(event\) => \{[\s\S]*armSilenceTimer\(\)/);
  assert.match(recognitionHookSource, /\[TossaSpeak recognition\][\s\S]*timestamp: performance\.now\(\), session/);
});

test("recognition sessions feed one guarded utterance buffer with soft and hard finalization", () => {
  assert.match(uiSource, /SOFT_UTTERANCE_TIMEOUT_MS = 1500/);
  assert.match(uiSource, /HARD_UTTERANCE_TIMEOUT_MS = 7000/);
  assert.match(uiSource, /utteranceBufferRef\.current = mergeSpeechTranscript\(before, text, conversationLanguage\)/);
  assert.match(uiSource, /userTurnIdRef\.current \+= 1/);
  assert.match(uiSource, /onEnd:[\s\S]*scheduleMicrophoneStart\(token, 100, true\)/);
  assert.match(uiSource, /utteranceSentRef\.current = true;[\s\S]*processUserTurn\(snapshot\)/);
  assert.match(uiSource, /startTokenRef\.current !== token \|\| requestBusyRef\.current \|\| review \|\| utteranceSentRef\.current/);
  assert.match(uiSource, /onActivity: \(activity\)[\s\S]*resetUserTurnTimers\(activity\)/);
  assert.match(uiSource, /recognitionSessionId[\s\S]*userTurnId/);
});

test("listening interjection TTS is disabled while silent listening visuals remain", () => {
  assert.doesNotMatch(uiSource, /LISTENING_PROMPT_DELAY_MS|waitingPromptUsedRef|\.waitingPhrases/);
  assert.match(uiSource, /startListening\(\)/);
  assert.match(uiSource, /listeningPose/);
});

test("mouth animation preloads its open frame and remains time-based without boundary events", () => {
  assert.match(speechHookSource, /const mouthOpenRef = useCallback\(\(image:[\s\S]*const preload = new Image\(\);\s*preload\.src = openSource/);
  assert.match(speechHookSource, /mouthImageRef\.current = image/);
  assert.match(speechHookSource, /const mouthOpenRef = useCallback\([\s\S]*\}, \[characterId\]\)/);
  assert.match(speechHookSource, /const runStep = \(\) => \{/);
  assert.match(speechHookSource, /mouthTimerRef\.current = window\.setTimeout\(runStep, scheduledDuration\)/);
  assert.match(speechHookSource, /onSentenceStart:[\s\S]*startMouthTimeline\(sentence, speechLocale\)/);
});

test("review prompts require no more than three concise one-sentence points", () => {
  assert.match(reviewPromptSource, /no more than 3 points/);
  assert.match(reviewPromptSource, /Each point must be one short sentence/);
  assert.match(reviewPromptSource, /Choose at most 1 high-value correction/);
  assert.match(reviewPromptSource, /20 to 30 seconds of speech/);
  assert.match(reviewPromptSource, /todayPoints配列に最大3項目、各項目1文/);
  assert.match(reviewPromptSource, /spoken English transcribed by SpeechRecognition, not as typed composition/);
  assert.match(reviewPromptSource, /Never treat capitalization[\s\S]*punctuation[\s\S]*as learner errors/);
  assert.match(reviewPromptSource, /only differences would be capitalization or punctuation/);
  assert.match(reviewPromptSource, /return corrections: \[\]/);
  assert.match(reviewPromptSource, /return goodPoints: \[\]/);
  assert.doesNotMatch(reviewPromptSource, /write exactly 「該当なし」/);
  assert.match(reviewPromptSource, /single contextually implausible word[\s\S]*not sufficient evidence/);
  assert.match(reviewPromptSource, /When unsure, return corrections: \[\]/);
});

test("partner selection can be cancelled without entering Review", () => {
  assert.match(uiSource, /const cancelPartnerSelection = (?:useCallback\()?\(\) =>/);
  assert.match(uiSource, /cancelPartnerSelection[\s\S]*setShowIntro\(true\)/);
  assert.match(uiSource, /onClick=\{\(\) => runButtonAction\(cancelPartnerSelection\)\}>Cancel/);
  assert.match(uiSource, />\s*End Lesson\s*</);
  assert.doesNotMatch(uiSource, /やーめた|やめーた/);
  assert.match(uiSource, /if \(!hasUserResponse\(messages\)\)/);
});
