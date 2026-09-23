import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const toModule = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText).toString("base64")}`;

const freshSource = await read("../src/data/freshTopics.ts");
const uiSource = await read("../src/components/AiConversationUI.tsx");
const functionSource = await read("../functions/index.js");
const firebaseSource = await read("../firebase.json");
const freshModule = await import(toModule(freshSource));

const sampleTopics = Array.from({ length: 10 }, (_, index) => ({
  id: `fresh-2026-09-17-${index + 1}`,
  title: `Fresh topic ${index + 1}`,
  context: "A recent development is making this an easy subject for personal conversation.",
  category: "opinion",
  angles: ["personal experience", "things people like", "possible benefits", "the near future"],
  source: "fresh",
}));

test("fresh topics use the existing Gemini backend with Google Search and no new API", () => {
  assert.match(functionSource, /tools: \[\{ googleSearch: \{\} \}\]/);
  assert.match(functionSource, /exactly 10 timely English conversation topics/);
  assert.match(functionSource, /Avoid war, crime, fatal accidents/);
  assert.match(functionSource, /Use one familiar, concrete English noun whenever possible/);
  assert.match(functionSource, /Never use four or more words/);
  assert.match(functionSource, /news headline or a summary/);
  assert.match(functionSource, /learner's own experience, preferences, memories, simple choices, or feelings/);
  assert.match(functionSource, /Human Presence and Wildlife[\s\S]*title "Wildlife"/);
  assert.match(functionSource, /function simplifyFreshTitle/);
  assert.match(functionSource, /SIMPLE_TITLE_KEYWORDS\.find/);
  assert.match(functionSource, /title: simpleTitle/);
  assert.match(functionSource, /value\.slice\(0, 10\)/);
  assert.match(functionSource, /fallbackAngle/);
  assert.match(firebaseSource, /\/api\/fresh-topics/);
});

test("fresh topic loading caches valid results for 24 hours", async () => {
  const storage = new Map();
  let fetchCount = 0;
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  globalThis.window = { setTimeout, clearTimeout };
  globalThis.fetch = async () => {
    fetchCount += 1;
    return { ok: true, json: async () => ({ topics: sampleTopics }) };
  };

  const first = await freshModule.loadFreshTopics(1_000);
  const second = await freshModule.loadFreshTopics(2_000);
  assert.equal(first.length, 10);
  assert.equal(second.length, 10);
  assert.equal(fetchCount, 1);
  assert.equal(freshModule.FRESH_TOPIC_CACHE_MS, 86_400_000);
  assert.equal(freshModule.FRESH_TOPIC_REQUEST_TIMEOUT_MS, 50_000);
});

test("fresh topic failure falls back to an empty list and mixing prevents consecutive fresh topics", async () => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  globalThis.window = { setTimeout, clearTimeout };
  globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
  assert.deepEqual(await freshModule.loadFreshTopics(3_000), []);
  assert.match(uiSource, /freshTopics\.length > 0 && !previousTopicWasFresh/);
  assert.match(uiSource, /FRESH_TOPIC_MIX_RATIO/);
  assert.equal(freshModule.FRESH_TOPIC_MIX_RATIO, 0.4);
  assert.match(uiSource, /source = useFresh \? freshTopics : TALK_TOPICS/);
});

test("fresh topics reuse the topic UI and skip fixed reference questions", () => {
  assert.match(uiSource, /className="fresh-topic-mark"/);
  assert.match(uiSource, /topic && isFreshTalkTopic\(topic\)/);
  assert.doesNotMatch(uiSource, /Today's Topic · Fresh/);
  assert.match(freshSource, /openingQuestion: ""/);
  assert.match(freshSource, /deepQuestion: ""/);
  assert.match(freshSource, /angles\.length >= 4/);
  assert.match(freshSource, /titleWordCount <= 3/);
  assert.doesNotMatch(freshSource, /title:.*\*/);
});
