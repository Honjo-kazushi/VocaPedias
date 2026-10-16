import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AiConversationUI.tsx", import.meta.url), "utf8");

test("iOS Miyabi Help stops recognition and competing timers before TTS", () => {
  const rescueStart = source.indexOf("const requestRescue = async");
  const ttsRequest = source.indexOf('tossaPerf("SPEECH", "Miyabi TTS request"', rescueStart);
  const beforeTts = source.slice(rescueStart, ttsRequest);

  assert.match(beforeTts, /clearTimeout\(recognitionRestartTimerRef\.current\)/);
  assert.match(beforeTts, /clearTimeout\(softFinalizeTimerRef\.current\)/);
  assert.match(beforeTts, /clearTimeout\(hardFinalizeTimerRef\.current\)/);
  assert.match(beforeTts, /clearTimeout\(silenceTimerRef\.current\)/);
  assert.match(beforeTts, /cancelRecognition\(\)/);
  assert.match(beforeTts, /setIgnoreRecognitionDuringMiyabi\(true\)/);
});

test("completed iOS Miyabi TTS resumes a fresh recognition session after 750ms", () => {
  const rescueStart = source.indexOf("const requestRescue = async");
  const rescueEnd = source.indexOf("const endLesson = async", rescueStart);
  const rescueBody = source.slice(rescueStart, rescueEnd);

  assert.match(rescueBody, /if \(reason === "complete"\)[\s\S]*scheduleMicrophoneStart\(token, 750, true\)/);
  assert.match(rescueBody, /oldSessionId: recognitionSessionBefore/);
  assert.match(source, /"Miyabi help recognition resumed"[\s\S]*oldSessionId: miyabiResumeFromSessionRef\.current[\s\S]*newSessionId: getRecognitionSessionId\(\)/);
});

test("conversation resets always clear both Miyabi ignore flags", () => {
  const stopStart = source.indexOf("const stopInteraction = useCallback");
  const stopEnd = source.indexOf("const scheduleMicrophoneStart", stopStart);
  const stopBody = source.slice(stopStart, stopEnd);

  assert.match(stopBody, /setIgnoreRecognitionDuringMiyabi\(false\)/);
  assert.match(stopBody, /miyabiTtsInputIgnoredRef\.current = false/);
  assert.match(stopBody, /clearTimeout\(miyabiIgnoreReleaseTimerRef\.current\)/);
});

test("blocked user-turn finalization records every guard without transcript content", () => {
  const finalizeStart = source.indexOf("const finalizeUserTurn");
  const finalizeEnd = source.indexOf("const resetUserTurnTimers", finalizeStart);
  const finalizeBody = source.slice(finalizeStart, finalizeEnd);

  for (const field of ["mounted", "tokenMatched", "requestBusy", "review", "utteranceSent", "miyabiInputIgnored", "bufferLength"]) {
    assert.match(finalizeBody, new RegExp(`\\b${field}\\b`));
  }
  assert.match(finalizeBody, /"finalizeUserTurn blocked"/);
  assert.doesNotMatch(finalizeBody, /"finalizeUserTurn blocked"[^\n]*text:/);
});
