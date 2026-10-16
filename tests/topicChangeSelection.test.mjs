import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/ai/topicChangeSelection.ts", import.meta.url), "utf8");
const testable = source.replace(/import type \{ TalkTopic \}[^;]+;/, "type TalkTopic = { id: string; title: string };");
const compiled = ts.transpileModule(testable, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const topicChange = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const topics = [
  { id: "travel", title: "Travel" },
  { id: "music", title: "Music" },
  { id: "pets", title: "Pets" },
  { id: "food", title: "Food" },
];

test("delegated topic choice is explicit rather than inferred from a plain change request", () => {
  assert.equal(topicChange.delegatesTopicChoice("Let's change the topic."), false);
  for (const text of ["Anything is fine.", "You choose.", "Surprise me.", "Whatever you like.", "I don't know."])
    assert.equal(topicChange.delegatesTopicChoice(text), true, text);
});

test("user topic requests resolve without reusing the excluded current topic", () => {
  assert.equal(topicChange.resolveRequestedTopic("Let's talk about travel.", topics, "music")?.id, "travel");
  assert.equal(topicChange.resolveRequestedTopic("Maybe animals.", topics, "music")?.id, "pets");
  assert.equal(topicChange.resolveRequestedTopic("How about music?", topics, "music"), null);
  assert.equal(topicChange.resolveRequestedTopic("Something different.", topics, "music"), null);
});
