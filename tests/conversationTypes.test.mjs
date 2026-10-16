import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/ai/conversationTypes.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
const { detectsTopicChangeIntent, hasUserResponse, mergeRecognitionResults, mergeSpeechTranscript, parseConversationTurn, parseSceneConversationTurn } = await import(moduleUrl);

test("structured topic turns accept every supported action and reject invalid output", () => {
  assert.deepEqual(parseConversationTurn('{"reply":"That sounds relaxing.","action":"WAIT"}'), {
    reply: "That sounds relaxing.",
    action: "WAIT",
  });
  assert.deepEqual(parseConversationTurn('```json\n{"reply":"See you next time!","action":"CLOSE"}\n```'), {
    reply: "See you next time!",
    action: "CLOSE",
  });
  assert.throws(() => parseConversationTurn('{"reply":"Hello","action":"UNKNOWN"}'));
  assert.throws(() => parseConversationTurn('{"reply":"","action":"REACTION"}'));
  assert.deepEqual(parseConversationTurn('{"reply":"Sure, let’s switch.","action":"CHANGE_TOPIC"}'), {
    reply: "Sure, let’s switch.", action: "CHANGE_TOPIC",
  });
});

test("topic-change intent is distinct from conversation-ending intent", () => {
  for (const transcript of [
    "Let's change the topic.",
    "Can we talk about something else?",
    "Next topic.",
    "change the topics next",
  ]) assert.equal(detectsTopicChangeIntent(transcript), true, transcript);
  for (const transcript of ["I have to go.", "That's enough for today."]) {
    assert.equal(detectsTopicChangeIntent(transcript), false, transcript);
  }
  assert.throws(() => parseSceneConversationTurn('{"reply":"Let’s switch.","action":"CHANGE_TOPIC","goalStatus":"IN_PROGRESS","completionReason":"The task remains open."}'));
});

test("legacy completed goal is normalized to GOAL_REACHED without requiring CLOSE", () => {
  assert.deepEqual(parseSceneConversationTurn('{"reply":"Your room is ready.","action":"CLOSE","goalStatus":"COMPLETED","completionReason":"Check-in is complete and the guest has the room information."}'), {
    reply: "Your room is ready.", action: "CLOSE", goalStatus: "COMPLETED", completionReason: "Check-in is complete and the guest has the room information.", sceneStatus: "GOAL_REACHED", goalReached: true, shouldCloseInteraction: false, responseType: "closing",
  });
  assert.throws(() => parseSceneConversationTurn('{"reply":"May I see your passport?","action":"QUESTION"}'));
  assert.equal(parseSceneConversationTurn('{"reply":"Anything else?","action":"QUESTION","goalStatus":"COMPLETED","completionReason":"The order is complete."}').sceneStatus, "GOAL_REACHED");
  assert.throws(() => parseSceneConversationTurn('{"reply":"Please continue.","action":"QUESTION","goalStatus":"IN_PROGRESS"}'));
});

test("only a non-empty user message counts as a response", () => {
  assert.equal(hasUserResponse([]), false);
  assert.equal(hasUserResponse([{ role: "assistant", content: "How are you?" }]), false);
  assert.equal(hasUserResponse([{ role: "user", content: "   " }]), false);
  assert.equal(hasUserResponse([
    { role: "assistant", content: "How are you?" },
    { role: "user", content: "I'm fine." },
  ]), true);
});

test("speech transcript fragments merge without duplicated overlap", () => {
  assert.equal(mergeSpeechTranscript("", "I", "en"), "I");
  assert.equal(mergeSpeechTranscript("I", "went to Kyoto", "en"), "I went to Kyoto");
  assert.equal(mergeSpeechTranscript("I went to Kyoto", "Kyoto last year", "en"), "I went to Kyoto last year");
  assert.equal(mergeSpeechTranscript("Yes", "Yes", "en"), "Yes");
  assert.equal(mergeSpeechTranscript("京都に", "に行きました", "ja"), "京都に行きました");
});

test("English continuation joins preserve exactly one word boundary", () => {
  assert.equal(mergeSpeechTranscript("yes", "sorry", "en"), "yes sorry");
  assert.equal(mergeSpeechTranscript("hello ", "there", "en"), "hello there");
  assert.equal(mergeSpeechTranscript("hello", " there", "en"), "hello there");
  assert.equal(mergeSpeechTranscript("", "there", "en"), "there");
  assert.equal(mergeSpeechTranscript("hello", "", "en"), "hello");
  const afterFirstRestart = mergeSpeechTranscript("yes", "sorry I have to go now", "en");
  const afterSecondRestart = mergeSpeechTranscript(afterFirstRestart, "hey could you stop this conversation", "en");
  assert.equal(afterSecondRestart, "yes sorry I have to go now hey could you stop this conversation");
});

test("Android cumulative recognition slots replace interim hypotheses instead of multiplying words", () => {
  assert.equal(mergeRecognitionResults(["I", "I have", "I have a reservation"], "en"), "I have a reservation");
  assert.equal(mergeRecognitionResults(["but", "but I have", "but I have a plan"], "en"), "but I have a plan");
  assert.equal(mergeRecognitionResults(["I have a reservation", "for one night, please."], "en"), "I have a reservation for one night, please.");
  assert.equal(mergeRecognitionResults(["京都に", "京都に行きました"], "ja"), "京都に行きました");
  assert.equal(
    mergeRecognitionResults([
      "うん、そうだね。やっぱり",
      "うん そうだね やっぱり 日本",
      "うん そうだね やっぱり 日本昔ばなしかな",
    ], "ja"),
    "うん そうだね やっぱり 日本昔ばなしかな",
  );
  assert.equal(
    mergeSpeechTranscript("うん、そうだね。やっぱり", "うん そうだね やっぱり 日本昔ばなしかな", "ja"),
    "うん そうだね やっぱり 日本昔ばなしかな",
  );
});
