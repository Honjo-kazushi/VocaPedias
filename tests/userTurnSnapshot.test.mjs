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
const { createUserTurnSnapshot, selectUserTurnSnapshotText } = await import(toModule(snapshotSource));

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

test("snapshot selection safely includes a stable interim extension after final", () => {
  for (const [stableFinal, latestInterim, expected] of [
    ["After meal I want to", "After meal I want to drink a cup of coffee", "After meal I want to drink a cup of coffee"],
    ["I'd like curry", "I'd like curry and rice", "I'd like curry and rice"],
  ]) {
    const selection = selectUserTurnSnapshotText(stableFinal, latestInterim);
    assert.equal(selection.selectedSnapshot, expected);
    assert.equal(selection.snapshotSelectionReason, "extended-interim-after-final");
  }
});

test("snapshot selection retains final unless interim is a natural longer prefix extension", () => {
  assert.equal(selectUserTurnSnapshotText("Yes", "Yes").selectedSnapshot, "Yes");
  assert.equal(selectUserTurnSnapshotText("I like coffee", "").selectedSnapshot, "I like coffee");
  assert.equal(selectUserTurnSnapshotText("I like coffee", "coffee coffee coffee").selectedSnapshot, "I like coffee");
  assert.equal(selectUserTurnSnapshotText("Yes", "Yesterday was fun").selectedSnapshot, "Yes");
  assert.equal(selectUserTurnSnapshotText("I like coffee today", "I like coffee").selectedSnapshot, "I like coffee today");
  assert.equal(selectUserTurnSnapshotText("", "latest valid interim").snapshotSelectionReason, "interim-fallback");
});

test("the latest of multiple interim updates is selected", () => {
  let latestInterim = "After meal I want to drink";
  latestInterim = "After meal I want to drink a cup";
  latestInterim = "After meal I want to drink a cup of coffee";
  assert.equal(
    selectUserTurnSnapshotText("After meal I want to", latestInterim).selectedSnapshot,
    "After meal I want to drink a cup of coffee",
  );
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
  assert.match(uiSource, /onTranscript: \(text, resultDetails\) => \{\s*if \(startTokenRef\.current !== token \|\| utteranceSentRef\.current\) return/);
  assert.match(uiSource, /onEnd: \(text, details\) => \{\s*if \(startTokenRef\.current !== token \|\| utteranceSentRef\.current\) return/);
  assert.match(uiSource, /selectUserTurnSnapshotText\(utteranceBufferRef\.current, interimFallbackRef\.current\)/);
  assert.match(uiSource, /snapshotSelectionReason/);
});

test("new turns use distinct IDs and end-lesson generation guards remain active", () => {
  assert.match(uiSource, /userTurnIdRef\.current \+= 1/);
  assert.match(uiSource, /const token = \+\+startTokenRef\.current;[\s\S]*stopInteraction\([^)]*\)/);
  assert.match(uiSource, /if \(!mountedRef\.current \|\| startTokenRef\.current !== token\) return/);
});
