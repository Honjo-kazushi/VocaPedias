import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const appSource = await read("../src/App.tsx");
const homeSource = await read("../src/ui/pages/HomePage.tsx");
const staticSource = await read("../src/ui/static/uiStatic.ts");
const cssSource = await read("../src/App.css");

test("startup offers four explicit modes and never starts one before a click", () => {
  assert.match(appSource, /mode: "AI"[\s\S]*mode: "DAILY"[\s\S]*mode: "SCENE"[\s\S]*mode: "TRAIN"/);
  assert.match(appSource, /!startupMode && \(/);
  assert.match(appSource, /onClick=\{\(\) => selectStartupMode\(mode\)\}/);
  assert.doesNotMatch(appSource, /useEffect[\s\S]*setStartupMode/);
});

test("HomePage initializes directly into every selected main mode", () => {
  assert.match(homeSource, /initialMainMode\?: MainMode/);
  assert.match(homeSource, /useState<MainMode>\(initialMainMode\)/);
  assert.match(homeSource, /initialMainMode === "DAILY" \|\| initialMainMode === "SCENE" \? "A" : initialMainMode/);
  assert.match(homeSource, /useState<boolean>\(initialMainMode === "SCENE"\)/);
});

test("startup stays compact and AI guide points caption and speed controls to Settings", () => {
  assert.match(cssSource, /\.startup-mode-list \{ display: grid; gap: 9px; \}/);
  assert.match(cssSource, /\.startup-mode-button span[\s\S]*white-space: nowrap/);
  assert.match(staticSource, /字幕表示や会話の速さは、設定から変更できます/);
  assert.doesNotMatch(staticSource, /会話中は細かく訂正せず、最後にEmmaがまとめて振り返ります/);
});
