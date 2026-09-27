import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AiConversationUI.tsx", import.meta.url), "utf8");

test("Miyabi input ignore is released before stale token callbacks return", () => {
  const timerStart = source.indexOf("miyabiIgnoreReleaseTimerRef.current = window.setTimeout");
  const timerEnd = source.indexOf("}, 250);", timerStart);
  const timerBody = source.slice(timerStart, timerEnd);

  assert.ok(timerStart >= 0 && timerEnd > timerStart);
  assert.ok(timerBody.indexOf("setIgnoreRecognitionDuringMiyabi(false)") < timerBody.indexOf("startTokenRef.current !== token"));
  assert.ok(timerBody.indexOf("miyabiTtsInputIgnoredRef.current = false") < timerBody.indexOf("startTokenRef.current !== token"));
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
