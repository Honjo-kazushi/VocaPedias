import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const selectionSource = await readFile(new URL("../src/ai/freeTalkCharacterSelection.ts", import.meta.url), "utf8");
const testableSource = selectionSource.replace(
  /import type \{ CharacterId \}[^;]+;/,
  "type CharacterId = string;",
);
const compiled = ts.transpileModule(testableSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const selection = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("Free Talk random pool contains each of the nine characters exactly once", () => {
  assert.deepEqual(selection.FREE_TALK_CHARACTER_IDS, [
    "emma", "mike", "sophie", "jamie", "lily", "grandma_rose", "dr_dan", "leo", "miyabi",
  ]);
  assert.equal(new Set(selection.FREE_TALK_CHARACTER_IDS).size, 9);
});

test("the first selection can reach every character with deterministic random values", () => {
  const reached = new Set(Array.from({ length: 9 }, (_, index) =>
    selection.chooseFreeTalkCharacter(null, () => (index + 0.5) / 9).selectedCharacter));
  assert.deepEqual(reached, new Set(selection.FREE_TALK_CHARACTER_IDS));
});

test("only the immediately previous character is excluded", () => {
  for (const previous of ["sophie", "emma", "miyabi"]) {
    const reached = new Set(Array.from({ length: 8 }, (_, index) =>
      selection.chooseFreeTalkCharacter(previous, () => (index + 0.5) / 8).selectedCharacter));
    assert.equal(reached.has(previous), false);
    assert.equal(reached.size, 8);
  }
  const afterSophie = selection.chooseFreeTalkCharacter("sophie", () => 0.2).selectedCharacter;
  assert.notEqual(afterSophie, "sophie");
  assert.equal(selection.chooseFreeTalkCharacter(afterSophie, () => 0.2).candidates.includes("sophie"), true);
});

test("selection persistence stores only the character id", () => {
  assert.match(selectionSource, /tossa\.freeTalk\.lastCharacter/);
  assert.match(selectionSource, /setItem\(FREE_TALK_LAST_CHARACTER_KEY, characterId\)/);
});
