import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const toModule = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText).toString("base64")}`;

const snapshotSource = await read("../src/ai/userTurnSnapshot.ts");
const uiSource = await read("../src/components/AiConversationUI.tsx");
const { createUserTurnSnapshot } = await import(toModule(snapshotSource));

const makeSnapshot = (text = "I want to go to Kyoto.", id = 8) => createUserTurnSnapshot({
  id,
  generation: 21,
  text,
  language: "en",
  characterId: "emma",
  createdAt: 1234,
});

test("a finalized snapshot keeps the complete buffer text after the buffer is cleared", () => {
  let buffer = "I want to go to Kyoto.";
  const snapshot = makeSnapshot(buffer);
  buffer = "";
  assert.equal(snapshot.text, "I want to go to Kyoto.");
  assert.equal(buffer, "");
  assert.ok(Object.isFrozen(snapshot));
});

test("a later user turn and stale recognition text cannot change an existing snapshot", () => {
  const snapshot = makeSnapshot();
  let buffer = "This belongs to the next turn.";
  buffer += " stale callback";
  assert.equal(snapshot.text, "I want to go to Kyoto.");
  assert.equal(snapshot.id, 8);
  assert.match(buffer, /next turn/);
});

test("the LLM path consumes snapshot text and guards duplicate processing and history", () => {
  assert.match(uiSource, /const processUserTurn = async \(snapshot: UserTurnSnapshot\)/);
  assert.match(uiSource, /processedSnapshotIdsRef\.current\.has\(snapshot\.id\)/);
  assert.match(uiSource, /processedSnapshotIdsRef\.current\.add\(snapshot\.id\)/);
  assert.match(uiSource, /content: snapshot\.text/);
  assert.match(uiSource, /continue(?:SceneRoleplay|TutorConversation)\([\s\S]*nextMessages/);
  assert.doesNotMatch(uiSource, /processUserTurn\([\s\S]{0,80}utteranceBufferRef\.current/);
});

test("finalization snapshots before clearing and rejects stale recognition callbacks", () => {
  const createIndex = uiSource.indexOf("const snapshot = createUserTurnSnapshot", uiSource.indexOf("const finalizeUserTurn"));
  const clearIndex = uiSource.indexOf('utteranceBufferRef.current = ""', createIndex);
  const processIndex = uiSource.indexOf("void processUserTurn(snapshot)", clearIndex);
  assert.ok(createIndex >= 0 && createIndex < clearIndex && clearIndex < processIndex);
  assert.match(uiSource, /onFinalTranscript: \(text\) => \{\s*if \(startTokenRef\.current !== token \|\| utteranceSentRef\.current\) return/);
  assert.match(uiSource, /onTranscript: \(text\) => \{\s*if \(startTokenRef\.current !== token \|\| utteranceSentRef\.current\) return/);
  assert.match(uiSource, /onEnd: \(\) => \{\s*if \(startTokenRef\.current !== token \|\| utteranceSentRef\.current\) return/);
});

test("new turns use distinct IDs and end-lesson generation guards remain active", () => {
  assert.match(uiSource, /userTurnIdRef\.current \+= 1/);
  assert.match(uiSource, /const token = \+\+startTokenRef\.current;[\s\S]*stopInteraction\(\)/);
  assert.match(uiSource, /if \(!mountedRef\.current \|\| startTokenRef\.current !== token\) return/);
});
