import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const home = await readFile(new URL("../src/ui/pages/HomePage.tsx", import.meta.url), "utf8");
const ui = await readFile(new URL("../src/ui/static/uiStatic.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles/style.css", import.meta.url), "utf8");

test("phrase learning automatically reuses its guarded recognition flow", () => {
  assert.match(home, /trainPhase !== "QUESTION" \|\| speechState !== "IDLE" \|\| recognitionRef\.current/);
  assert.match(home, /initSpeechRecognition\(\);\s*setTrainPhase\("RECORDING"\);\s*startSpeechFlow\(\);/);
  assert.match(home, /if \(speechState === "RECORDING" \|\| recognitionRef\.current\) return/);
  assert.match(home, /const activeRecognition = recognitionRef\.current;\s*activeRecognition\.start\(\)/);
  assert.match(home, /activeRecognition\.stop\(\);[\s\S]*MAX_RECORD_MS/);
});

test("timeout stops phrase recognition without changing the five-second limit", () => {
  assert.match(home, /if \(next >= 5 && !showEn && !isPaused\) \{\s*stopTrainingRecognition\(\)/);
  assert.match(home, /recognition\.onend = null;[\s\S]*recognition\.stop\(\)/);
});

test("the fallback button keeps fixed bilingual text and a visual listening state", () => {
  assert.match(ui, /speak: "🎤 発声"/);
  assert.match(ui, /speak: "🎤 Speak"/);
  assert.match(home, /speechState === "RECORDING" \? "is-listening" : ""/);
  assert.match(css, /\.btn-en\.is-listening/);
});
