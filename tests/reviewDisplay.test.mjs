import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/ai/reviewDisplay.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
const { buildReviewDisplayModel } = await import(moduleUrl);

const emptySections = () => ({ goodPoints: [], corrections: [], alternatives: [], todayPoints: [] });

test("keeps existing English review sections unchanged", () => {
  const sections = { ...emptySections(), goodPoints: ["既存の表示"] };
  const result = buildReviewDisplayModel(sections, [{ lang: "ja-JP", text: "音声" }], "en");
  assert.equal(result.sections, sections);
  assert.equal(result.visibleSectionCount, 1);
  assert.equal(result.usedFallback, false);
});

test("creates at least one visible English section when API sections are empty", () => {
  const result = buildReviewDisplayModel(emptySections(), [{ lang: "ja-JP", text: "具体的に伝えられていました。" }], "en");
  assert.deepEqual(result.sections.goodPoints, ["具体的に伝えられていました。"]);
  assert.equal(result.visibleSectionCount, 1);
  assert.equal(result.usedFallback, true);
});

test("maps an English spoken example to the alternatives fallback", () => {
  const result = buildReviewDisplayModel(emptySections(), [
    { lang: "ja-JP", text: "内容を伝えられていました。" },
    { lang: "ja-JP", text: "語順を整えると分かりやすいです。" },
    { lang: "en-US", text: "I usually watch the news." },
  ], "en");
  assert.deepEqual(result.sections.corrections, ["語順を整えると分かりやすいです。"]);
  assert.deepEqual(result.sections.alternatives, ["別表現：I usually watch the news."]);
  assert.equal(result.visibleSectionCount, 3);
  assert.equal(result.usedFallback, true);
});

test("preserves the existing Japanese todayPoints behavior", () => {
  const sections = { ...emptySections(), todayPoints: ["👍 よかった"] };
  const result = buildReviewDisplayModel(sections, [{ lang: "ja-JP", text: "音声だけの内容" }], "ja");
  assert.equal(result.sections, sections);
  assert.equal(result.visibleSectionCount, 1);
  assert.equal(result.usedFallback, false);
});

test("review scrolling has an explicit parent state class independent of :has", async () => {
  const [home, style] = await Promise.all([
    readFile(new URL("../src/ui/pages/HomePage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/style.css", import.meta.url), "utf8"),
  ]);
  assert.match(home, /app-shell\$\{aiReviewActive \? " ai-review-active" : ""\}/);
  assert.match(style, /\.app-shell\.ai-review-active[\s\S]*?overflow-y: auto/);
  assert.match(style, /\.app-shell\.ai-review-active \{[\s\S]*?height: 100dvh/);
});

test("review diagnostics report source counts, visible count, and fallback use", async () => {
  const ui = await readFile(new URL("../src/components/AiConversationUI.tsx", import.meta.url), "utf8");
  for (const field of [
    "goodPointsCount",
    "correctionsCount",
    "alternativesCount",
    "todayPointsCount",
    "spokenReviewCount",
    "visibleSectionCount",
    "usedFallback",
  ]) {
    assert.match(ui, new RegExp(`${field}:`));
  }
});

test("English review prompt requires at least one genuine display section", async () => {
  const prompt = await readFile(new URL("../src/ai/buildReviewPrompt.ts", import.meta.url), "utf8");
  assert.match(prompt, /at least one of goodPoints, corrections, or alternatives/);
  assert.match(prompt, /never invent an error, intended meaning, or unnatural suggestion/);
  assert.match(prompt, /Prefer goodPoints first, then corrections, then alternatives/);
});
