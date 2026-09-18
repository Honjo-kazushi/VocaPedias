import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/ai/conversationTypes.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
const { hasUserResponse, mergeSpeechTranscript } = await import(moduleUrl);

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
