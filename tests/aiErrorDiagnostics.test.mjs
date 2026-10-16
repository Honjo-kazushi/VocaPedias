import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const chatSource = await readFile(new URL("../src/ai/chatWithTutor.ts", import.meta.url), "utf8");
const uiSource = await readFile(new URL("../src/components/AiConversationUI.tsx", import.meta.url), "utf8");

test("AI failures distinguish connection errors from response processing errors", () => {
  for (const code of [
    "NETWORK_ERROR",
    "HTTP_ERROR",
    "TIMEOUT",
    "RESPONSE_PARSE_ERROR",
    "RESPONSE_VALIDATION_ERROR",
    "EMPTY_RESPONSE",
    "POST_RESPONSE_ERROR",
    "UNKNOWN_ERROR",
  ]) assert.match(`${chatSource}\n${uiSource}`, new RegExp(code));

  assert.match(chatSource, /NETWORK_ERROR[^]*HTTP_ERROR[^]*TIMEOUT/);
  assert.match(chatSource, /AIの応答を処理できませんでした。もう一度お試しください。/);
  assert.match(chatSource, /AIに接続できませんでした。通信状態を確認して、もう一度お試しください。/);
});

test("AI diagnostics retain request correlation without logging prompts", () => {
  for (const field of ["requestType", "requestId", "characterId", "lessonType", "httpStatus", "elapsedMs", "errorStage", "errorName", "errorMessage", "responseReceived", "responseParsed"])
    assert.match(chatSource, new RegExp(field));
  const errorLog = chatSource.slice(chatSource.indexOf("function logAiRequestError"), chatSource.indexOf("async function generate"));
  assert.doesNotMatch(errorLog, /systemInstruction|prompt|Authorization|Cookie|apiKey/);
});

test("stale AI failures cannot overwrite the current conversation UI", () => {
  const openingCatch = uiSource.slice(uiSource.indexOf(".catch((cause)"), uiSource.indexOf(".finally", uiSource.indexOf(".catch((cause)")));
  assert.match(openingCatch, /startTokenRef\.current !== token/);
  const continuationCatch = uiSource.slice(uiSource.indexOf("} catch (cause) {", uiSource.indexOf("const processUserTurn")), uiSource.indexOf("} finally", uiSource.indexOf("const processUserTurn")));
  assert.match(continuationCatch, /startTokenRef\.current === token/);
  assert.match(uiSource, /Opening response[^]*setError\(null\)/);
});

test("Free Talk forbids unresolved user-name placeholders and validates model output", () => {
  assert.match(chatSource, /Never invent or guess the user's name/);
  assert.match(chatSource, /Never output unresolved name placeholders/);
  assert.match(chatSource, /containsUnresolvedNamePlaceholder\(text\)/);
  assert.match(chatSource, /unresolvedPlaceholderDetected: true/);
  for (const placeholder of ["〇〇", "○○", "{name}", "[name]", "[userName]", "[名前]", "<name>"])
    assert.ok(chatSource.includes(placeholder));
});
