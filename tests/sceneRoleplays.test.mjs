import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sceneSource = await readFile(new URL("../src/data/sceneRoleplays.ts", import.meta.url), "utf8");
const phraseSources = await Promise.all([
  readFile(new URL("../src/data/phrases.scene.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/data/phrases.seed.ts", import.meta.url), "utf8"),
]);
const uiSource = await readFile(new URL("../src/components/AiConversationUI.tsx", import.meta.url), "utf8");
const styleSource = await readFile(new URL("../src/styles/style.css", import.meta.url), "utf8");

test("full scene catalog contains seven families and all 46 requested situations", () => {
  const familyIds = [...sceneSource.matchAll(/\bf\("([^"]+)"/g)].map((match) => match[1]);
  const situationIds = [...sceneSource.matchAll(/\bq\("([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(familyIds, ["hotel", "airport", "street", "restaurant", "shopping", "transportation", "hospital"]);
  assert.equal(situationIds.length, 46);
  assert.deepEqual(
    familyIds.map((familyId) => situationIds.filter((id) => id.startsWith(`${familyId === "transportation" ? "transport" : familyId}-`)).length),
    [8, 8, 7, 7, 6, 6, 4],
  );
});

test("all useful phrase candidates reference the existing phrase catalogs", () => {
  const phraseIds = new Set(
    phraseSources.flatMap((source) => [...source.matchAll(/id: "([^"]+)"/g)].map((match) => match[1])),
  );
  const referencedIds = [...sceneSource.matchAll(/"([hmrst]\d{3})"/g)].map((match) => match[1]);
  assert.ok(referencedIds.length > 0);
  assert.deepEqual(referencedIds.filter((id) => !phraseIds.has(id)), []);
});

test("scene catalog stores phrase ids rather than duplicate English phrase text", () => {
  assert.doesNotMatch(sceneSource, /en:\s*"/);
  assert.match(sceneSource, /getSceneUsefulPhrases/);
});

test("scene selection automatically chooses situation and character", () => {
  assert.match(sceneSource, /chooseSceneSituation/);
  assert.match(sceneSource, /item\.id !== previous/);
  assert.match(sceneSource, /chooseScenePartner/);
  assert.match(uiSource, /const nextScene = chooseSceneSituation\(sceneFamily\)/);
  assert.match(uiSource, /const nextPartnerId = chooseScenePartner\(nextScene, partnerId\)/);
  assert.match(uiSource, /setLessonStage\("conversation"\)/);
  assert.match(uiSource, /setPartnerId\(nextPartnerId\)/);
});

test("scene partner pools contain four or five non-Emma candidates and avoid the previous character", () => {
  const partnerBlock = sceneSource.match(/const PARTNERS:[\s\S]*?\n};/)?.[0] ?? "";
  const pools = [...partnerBlock.matchAll(/^\s+\w+: \[([^\]]+)\]/gm)].map((match) => match[1].match(/"[^"]+"/g) ?? []);
  assert.equal(pools.length, 7);
  for (const pool of pools) {
    assert.ok(pool.length >= 3 && pool.length <= 5);
    assert.ok(!pool.includes('"emma"'));
  }
  assert.match(sceneSource, /id !== previousCharacter/);
  assert.match(uiSource, /chooseSceneSituation\(sceneFamily\)[\s\S]*chooseScenePartner\(nextScene, partnerId\)/);
});

test("scene menu is compact, two-column, and vertically scrollable", () => {
  assert.match(uiSource, /SCENE_ROLEPLAYS\.map\(\(family\)/);
  assert.match(uiSource, /family\.shortLabel/);
  assert.doesNotMatch(uiSource, /family\.situations\.map/);
  assert.match(styleSource, /\.scene-roleplay-select[\s\S]*?overflow-y: auto/);
  assert.match(styleSource, /\.scene-roleplay-groups[\s\S]*?grid-template-columns: 1fr 1fr/);
});

test("all scene cards reuse the conversation background mapping without changing card dimensions", () => {
  const cardBlock = styleSource.match(/\.scene-roleplay-card \{([^}]*)\}/)?.[1] ?? "";
  assert.match(uiSource, /SCENE_BACKGROUNDS\[family\.id\]/);
  assert.match(uiSource, /--scene-card-background/);
  assert.match(styleSource, /\.scene-roleplay-card::before[\s\S]*background-size: cover;[\s\S]*pointer-events: none/);
  assert.match(styleSource, /\.scene-roleplay-card::after[\s\S]*rgba\(255, 250, 244, 0\.6\)[\s\S]*pointer-events: none/);
  assert.match(styleSource, /\.scene-roleplay-card strong,[\s\S]*width: fit-content;[\s\S]*background: rgba\(255, 255, 255, 0\.86\)/);
  assert.match(styleSource, /\.scene-roleplay-card strong \{[\s\S]*font-weight: 700/);
  assert.match(styleSource, /\.scene-roleplay-card span \{[\s\S]*font-weight: 600/);
  assert.doesNotMatch(cardBlock, /^\s*(?:width|height):/m);
});

test("scene review reuses one generated result for Emma speech and the standard visible Review UI", () => {
  assert.match(uiSource, /scene \? \{ situation: scene, usefulPhrases: getSceneUsefulPhrases\(scene\) \} : undefined/);
  assert.match(uiSource, /setSpokenReview\(result\.spokenReview\);\s*setReview\(result\.sections\)/);
  assert.match(uiSource, /<ReviewSections sections=\{review\} language=\{conversationLanguage\} \/>/);
  assert.match(uiSource, /reviewLectureStartedRef\.current === review/);
});
