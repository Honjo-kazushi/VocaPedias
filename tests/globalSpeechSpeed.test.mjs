import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText).toString("base64")}`;
const homeSource = await read("../src/ui/pages/HomePage.tsx");
const speechSource = await read("../src/sound/speakEn.ts");
const controlsSource = await read("../src/ai/conversationControls.ts");

test("all HomePage phrase TTS uses the shared speech speed multiplier", () => {
  assert.match(homeSource, /SPEECH_SPEED_MULTIPLIERS\[speechSpeed\]/);
  assert.match(homeSource, /speakEn\([\s\S]*SPEECH_SPEED_MULTIPLIERS\[speechSpeed\]/);
  assert.match(homeSource, /localStorage\.setItem\("speechSpeed", speechSpeed\)/);
  assert.match(controlsSource, /normal: 1, slightlySlow: 0\.92, slow: 0\.84/);
});

test("non-character English speech applies the multiplier once without changing pitch", () => {
  assert.match(speechSource, /if \(!isJapanese\) utter\.rate \*= Math\.max\(0\.8, Math\.min\(1, rateMultiplier\)\)/);
  assert.match(speechSource, /createUtterance\(text, lang, undefined, false, undefined, rateMultiplier\)/);
  assert.doesNotMatch(speechSource, /utter\.pitch \*=.*rateMultiplier/);
});

test("speakEn delivers each shared multiplier to the final utterance rate", async () => {
  const profiles = moduleUrl(await read("../src/characters/characterProfiles.ts"));
  const selector = moduleUrl((await read("../src/sound/selectCharacterVoice.ts"))
    .replaceAll('"../characters/characterProfiles"', JSON.stringify(profiles)));
  const cancelDiagnostics = moduleUrl(`
    export const setActiveTtsState = () => {};
    export const cancelSpeechSynthesis = (synth) => synth.cancel();
  `);
  const speech = await import(moduleUrl(speechSource
    .replaceAll('"../characters/characterProfiles"', JSON.stringify(profiles))
    .replaceAll('"./selectCharacterVoice"', JSON.stringify(selector))
    .replaceAll('"./cancelSpeechSynthesis"', JSON.stringify(cancelDiagnostics))
    .replace(/import \{ tossaPerf as logTossaPerf \} from "\.\.\/debug\/tossaPerf";/, "const logTossaPerf = () => {};")));
  const originalDescriptors = ["window", "speechSynthesis", "SpeechSynthesisUtterance"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const spoken = [];
  const synth = { getVoices: () => [], cancel() {}, speak: (utterance) => spoken.push(utterance) };
  const setGlobal = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, value });
  try {
    setGlobal("window", { speechSynthesis: synth });
    setGlobal("speechSynthesis", synth);
    setGlobal("SpeechSynthesisUtterance", class {
      constructor(text) { this.text = text; this.voice = null; this.rate = 1; this.pitch = 1; }
    });
    speech.speakEn("Normal", undefined, "en", undefined, undefined, 1);
    speech.speakEn("Slightly slow", undefined, "en", undefined, undefined, 0.92);
    speech.speakEn("Slow", undefined, "en", undefined, undefined, 0.84);
    speech.speakEn("日本語", undefined, "ja", undefined, undefined, 0.84);
    assert.deepEqual(spoken.map(({ rate }) => rate), [1, 0.92, 0.84, 1.3]);
    assert.deepEqual(spoken.map(({ pitch }) => pitch), [1, 1, 1, 1]);
  } finally {
    for (const [key, descriptor] of originalDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("settings labels follow the current UI language", () => {
  assert.match(homeSource, /jpLearnMode \? "Speech Speed" : "発話速度"/);
  for (const label of ["Normal", "Slightly Slow", "Slow", "通常", "ややゆっくり", "ゆっくり"]) {
    assert.ok(homeSource.includes(`"${label}"`), `missing speed label: ${label}`);
  }
});
