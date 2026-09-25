import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/ai/speechRecognitionRetry.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const retry = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("only Apple aborted kAFAssistantErrorDomain error 7 is retryable", () => {
  assert.equal(retry.APPLE_ERROR7_RETRY_DELAY_MS, 500);
  assert.equal(retry.APPLE_ERROR7_MAX_RETRIES, 1);
  assert.equal(retry.isAppleAssistantError7("ios/fallback", "aborted", "kAFAssistantErrorDomain エラー7"), true);
  assert.equal(retry.isAppleAssistantError7("ios/fallback", "no-speech", "kAFAssistantErrorDomain エラー7"), false);
  assert.equal(retry.isAppleAssistantError7("android", "aborted", "kAFAssistantErrorDomain エラー7"), false);
  assert.equal(retry.isAppleAssistantError7("desktop", "aborted", "kAFAssistantErrorDomain エラー7"), false);
});
