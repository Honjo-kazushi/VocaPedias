import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const homeSource = fs.readFileSync(new URL("../src/ui/pages/HomePage.tsx", import.meta.url), "utf8");
const uiSource = fs.readFileSync(new URL("../src/ui/static/uiStatic.ts", import.meta.url), "utf8");
const styleSource = fs.readFileSync(new URL("../src/styles/style.css", import.meta.url), "utf8");

test("Japanese settings use localized learning-mode copy without changing English copy", () => {
  assert.match(uiSource, /japaneseLearningMode: "日本語学習モード"/);
  assert.match(uiSource, /japaneseLearningModeDescription: "英語 → 日本語の練習"/);
  assert.match(uiSource, /japaneseLearningMode: "Japanese Learning Mode"/);
  assert.match(uiSource, /japaneseLearningModeDescription: "English → Japanese practice"/);
});

test("speech-speed choices keep all three labels on one responsive row", () => {
  assert.match(homeSource, /className="settings-item speech-speed-settings"/);
  assert.match(homeSource, /className="speech-speed-options"/);
  for (const label of ["ゆっくり", "ややゆっくり", "通常"]) assert.match(homeSource, new RegExp(label));
  assert.match(styleSource, /\.speech-speed-options\s*\{[^}]*grid-template-columns: repeat\(3, max-content\);[^}]*justify-content: space-between;/s);
  assert.match(styleSource, /\.speech-speed-options label\s*\{[^}]*white-space: nowrap;/s);
});

test("Japanese panel has mobile-safe width and descriptions break only at phrase boundaries", () => {
  assert.match(homeSource, /settings-panel-ja/);
  assert.match(styleSource, /\.settings-panel-ja\s*\{[^}]*width: min\(320px, calc\(100vw - 16px\)\)/s);
  assert.match(styleSource, /\.settings-panel-ja \.settings-item small\s*\{[^}]*word-break: keep-all/s);
  assert.match(uiSource, /録音した英語を正解音声と\\u200B聞き比べます/);
  assert.match(uiSource, /相手と自分の会話を文字で\\u200B表示します/);
});
