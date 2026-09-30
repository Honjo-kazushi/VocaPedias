import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/memory/conversationMemory.ts", import.meta.url), "utf8")
  .replace('import { tossaPerf } from "../debug/tossaPerf";', "const tossaPerf = () => {};");
const output = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const memory = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);

const existing = (overrides = {}) => ({
  id: "m1", key: "coffee habit", text: "drinks coffee every morning", category: "habit",
  createdAt: 1, updatedAt: 1, ...overrides,
});

test("safe explicit fact is saved and AI statements are outside the source", () => {
  const result = memory.applyMemoryCandidates([], [{
    action: "upsert", key: "music preference", text: "likes jazz", category: "preference", evidence: "I like jazz.",
  }], ["I like jazz."], 10);
  assert.equal(result.added, 1);
  assert.equal(result.memories[0].text, "likes jazz");

  const assistantOnly = memory.applyMemoryCandidates([], [{
    action: "upsert", key: "music preference", text: "likes jazz", evidence: "You like jazz.",
  }], ["I like pop."], 10);
  assert.equal(assistantOnly.memories.length, 0);
  assert.equal(assistantOnly.ignored[0].reason, "evidence not found in user statements");
});

test("sensitive facts are excluded", () => {
  const result = memory.applyMemoryCandidates([], [{
    action: "upsert", key: "email address", text: "email is me@example.com", evidence: "My email is me@example.com",
  }], ["My email is me@example.com"], 10);
  assert.equal(result.memories.length, 0);
  assert.equal(result.ignored[0].reason, "sensitive information");
});

test("candidate without exact user evidence is rejected as inference", () => {
  const result = memory.applyMemoryCandidates([], [{
    action: "upsert", key: "home", text: "lives near Osaka", evidence: "I live near Osaka",
  }], ["I went to Osaka yesterday."], 10);
  assert.equal(result.memories.length, 0);
});

test("duplicates merge and explicit corrections update the stable key", () => {
  const duplicate = memory.applyMemoryCandidates([existing()], [{
    action: "upsert", key: "coffee habit", text: "drinks coffee every morning", evidence: "I drink coffee every morning.",
  }], ["I drink coffee every morning."], 10);
  assert.equal(duplicate.memories.length, 1);
  assert.equal(duplicate.ignored[0].reason, "duplicate");

  const corrected = memory.applyMemoryCandidates([existing()], [{
    action: "upsert", key: "coffee habit", text: "does not drink coffee anymore", evidence: "I don't drink coffee anymore.",
  }], ["I don't drink coffee anymore."], 20);
  assert.equal(corrected.updated, 1);
  assert.equal(corrected.memories[0].text, "does not drink coffee anymore");
  assert.equal(corrected.memories[0].updatedAt, 20);
});

test("maximum count keeps the most recently updated memories", () => {
  const many = Array.from({ length: 15 }, (_, index) => existing({
    id: `m${index}`, key: `key ${index}`, text: `likes item ${index}`, createdAt: index, updatedAt: index,
  }));
  const result = memory.applyMemoryCandidates(many, [{
    action: "upsert", key: "new key", text: "likes a new item", evidence: "I like a new item.",
  }], ["I like a new item."], 100);
  assert.equal(result.memories.length, 15);
  assert.equal(result.memories.some((item) => item.key === "key 0"), false);
  assert.equal(result.memories.at(-1).key, "new key");
});

test("empty and malformed Gemini responses produce no candidates", () => {
  assert.deepEqual(memory.parseMemoryCandidates("[]"), []);
  assert.deepEqual(memory.parseMemoryCandidates("not json"), []);
  assert.deepEqual(memory.parseMemoryCandidates('[{"action":"upsert"}]'), []);
});

test("scene exclusion is enforced at the conversation integration boundary", () => {
  const ui = fs.readFileSync(new URL("../src/components/AiConversationUI.tsx", import.meta.url), "utf8");
  assert.match(ui, /conversationMode === "SCENE" \|\| scene/);
  assert.match(ui, /reason: "scene role-play"/);
});
