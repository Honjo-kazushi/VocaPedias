import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const toModule = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText).toString("base64")}`;
const historySource = (await read("../src/data/conversationTopicHistory.ts")).replace(/import type[^;]+;\s*/gs, "");
const historyModule = await import(toModule(historySource));
const promptModule = await import(toModule(await read("../src/ai/buildConversationPrompt.ts")));

const fixedShopping = {
  id: "topic047", title: "Shopping", category: "comparison",
  openingQuestion: "What do you enjoy or dislike about shopping?",
  deepQuestion: "When is shopping online better than visiting a store in person?",
  angles: ["shopping habits", "online convenience", "in-store experience"],
};
const freshShopping = { ...fixedShopping, id: "fresh-shopping", title: " shopping ", source: "fresh" };

function memoryStorage(initial = new Map()) {
  return {
    values: initial,
    getItem: (key) => initial.get(key) ?? null,
    setItem: (key, value) => initial.set(key, value),
  };
}

test("normalized titles prevent immediate fixed/fresh duplicates with a safe fallback", () => {
  assert.equal(historyModule.normalizeTopicTitle(" SHOPPING "), "shopping");
  const other = { ...fixedShopping, id: "topic001", title: "Travel" };
  assert.deepEqual(
    historyModule.filterTopicChoices([freshShopping, other], "shopping", fixedShopping.id).map(({ title }) => title),
    ["Travel"],
  );
  assert.deepEqual(
    historyModule.filterTopicChoices([fixedShopping, other], "shopping", freshShopping.id).map(({ title }) => title),
    ["Travel"],
  );
  assert.equal(historyModule.filterTopicChoices([freshShopping], "shopping", fixedShopping.id).length, 1);
});

test("history persists across module reads and is capped at twenty entries", () => {
  const storage = memoryStorage();
  globalThis.localStorage = storage;
  for (let index = 0; index < 25; index += 1) {
    historyModule.recordConversationTopicHistory(fixedShopping, "mike", "shopping habits", `Opening ${index}?`, index);
  }
  const reloaded = historyModule.readConversationTopicHistory();
  assert.equal(reloaded.length, 20);
  assert.equal(reloaded[0].opening, "Opening 24?");
  assert.equal(reloaded.at(-1).opening, "Opening 5?");
});

test("opening prompt uses prior Mike questions, character perspective, and no fixed opening references", () => {
  const partner = {
    displayName: "Mike", role: "Easygoing friend", personality: ["friendly", "casual"],
    conversationStyle: ["short questions", "everyday conversation"], conversationLanguage: "en",
  };
  const prompt = promptModule.buildConversationPrompt(fixedShopping, partner, "shopping habits", false, {
    recentSameCharacter: ["Do you shop online or in a store?"],
    recentOtherCharacters: ["Do you enjoy looking around shops?"],
  });
  assert.match(prompt, /Recent openings\/questions for this topic and character/);
  assert.match(prompt, /Do not repeat or closely paraphrase/);
  assert.match(prompt, /meaningfully different angle and first question/);
  assert.match(prompt, /perspective natural to their personality and conversation style/);
  assert.match(prompt, /Questions recently used by other characters/);
  assert.doesNotMatch(prompt, /When is shopping online better than visiting a store in person/);
});

test("different characters receive different recent-question context", () => {
  const history = [
    { topicId: "topic047", normalizedTitle: "shopping", source: "fixed", characterId: "mike", angle: "online convenience", opening: "Online or store?", firstQuestion: "Online or store?", usedAt: 2 },
    { topicId: "fresh-shopping", normalizedTitle: "shopping", source: "fresh", characterId: "sophie", angle: "shopping habits", opening: "Do you browse shops?", firstQuestion: "Do you browse shops?", usedAt: 1 },
  ];
  const mike = historyModule.buildOpeningVariationContext(fixedShopping, "mike", history);
  const sophie = historyModule.buildOpeningVariationContext(fixedShopping, "sophie", history);
  assert.deepEqual(mike.recentSameCharacter, ["Online or store?"]);
  assert.deepEqual(sophie.recentSameCharacter, ["Do you browse shops?"]);
  assert.deepEqual(mike.recentOtherCharacters, ["Do you browse shops?"]);
});
