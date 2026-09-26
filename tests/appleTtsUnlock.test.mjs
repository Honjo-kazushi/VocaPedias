import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText).toString("base64")}`;
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const profiles = moduleUrl(await read("../src/characters/characterProfiles.ts"));
const selector = moduleUrl((await read("../src/sound/selectCharacterVoice.ts"))
  .replaceAll('"../characters/characterProfiles"', JSON.stringify(profiles)));
const cancelDiagnostics = moduleUrl(`
  export const setActiveTtsState = () => {};
  export const cancelSpeechSynthesis = (synth) => synth.cancel();
`);
const speechSource = await read("../src/sound/speakEn.ts");
const uiSource = await read("../src/components/AiConversationUI.tsx");
const appSource = await read("../src/App.tsx");

async function loadSpeech(suffix) {
  return import(moduleUrl((speechSource
    .replaceAll('"../characters/characterProfiles"', JSON.stringify(profiles))
    .replaceAll('"./selectCharacterVoice"', JSON.stringify(selector))
    .replaceAll('"./cancelSpeechSynthesis"', JSON.stringify(cancelDiagnostics))
    .replace(/import \{ tossaPerf as logTossaPerf \} from "\.\.\/debug\/tossaPerf";/, "const logTossaPerf = () => {};")) + `\n// ${suffix}`));
}

function installSpeechEnvironment({ userAgent, voices }) {
  const keys = ["navigator", "window", "speechSynthesis", "SpeechSynthesisUtterance"];
  const descriptors = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  const queued = [];
  const synth = {
    speaking: false,
    pending: false,
    getVoices: () => voices,
    speak: (utterance) => queued.push(utterance),
    cancel() {},
    addEventListener() {},
    removeEventListener() {},
  };
  const setGlobal = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, value });
  setGlobal("navigator", { userAgent, platform: /Windows/.test(userAgent) ? "Win32" : "iPhone", maxTouchPoints: 1 });
  setGlobal("window", { speechSynthesis: synth });
  setGlobal("speechSynthesis", synth);
  setGlobal("SpeechSynthesisUtterance", class {
    constructor(text) { this.text = text; this.voice = null; this.rate = 1; this.pitch = 1; this.volume = 1; }
  });
  return {
    queued,
    setDevice(nextUserAgent) {
      setGlobal("navigator", { userAgent: nextUserAgent, platform: /Windows/.test(nextUserAgent) ? "Win32" : "iPhone", maxTouchPoints: 1 });
    },
    restore() {
      keys.forEach((key, index) => {
        const descriptor = descriptors[index];
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      });
    },
  };
}

test("Apple Talk unlock runs synchronously once and supports an empty voice list", async () => {
  const speech = await loadSpeech("empty voices");
  const environment = installSpeechEnvironment({ userAgent: "Windows NT Chrome", voices: [] });
  try {
    speech.unlockAppleTtsOnUserGesture("topic-fallback");
    environment.setDevice("Android Chrome");
    speech.unlockAppleTtsOnUserGesture("scene-fallback");
    assert.equal(environment.queued.length, 0);

    environment.setDevice("iPhone Safari");
    speech.unlockAppleTtsOnUserGesture("startup-dialog");
    assert.equal(environment.queued.length, 1);
    assert.equal(environment.queued[0].text, ".");
    assert.equal(environment.queued[0].volume, 0.01);
    assert.equal(environment.queued[0].lang, "en-US");
    assert.equal(environment.queued[0].voice, null);

    speech.unlockAppleTtsOnUserGesture("topic-fallback");
    assert.equal(environment.queued.length, 1);
  } finally {
    environment.restore();
  }
});

test("Apple Talk unlock uses Samantha immediately when she is already available", async () => {
  const speech = await loadSpeech("Samantha available");
  const samantha = { name: "Samantha", lang: "en-US", voiceURI: "Samantha" };
  const environment = installSpeechEnvironment({ userAgent: "iPhone Safari", voices: [samantha] });
  try {
    speech.unlockAppleTtsOnUserGesture("startup-dialog");
    assert.equal(environment.queued.length, 1);
    assert.equal(environment.queued[0].voice, samantha);
    assert.equal(environment.queued[0].rate, 1);
    assert.equal(environment.queued[0].pitch, 1);
  } finally {
    environment.restore();
  }
});

test("Topic and Scene fallbacks call Apple unlock after the existing cancel", () => {
  const beginLesson = uiSource.slice(uiSource.indexOf("const beginLesson"), uiSource.indexOf("const beginSceneSelection"));
  const cancelIndex = beginLesson.indexOf('stopInteraction("conversation:talk-topic-selected")');
  const unlockIndex = beginLesson.indexOf('unlockAppleTtsOnUserGesture("topic-fallback")');
  const stateIndex = beginLesson.indexOf("setTopic(nextTopic)");
  assert.ok(cancelIndex >= 0 && cancelIndex < unlockIndex && unlockIndex < stateIndex);
  assert.doesNotMatch(beginLesson.slice(cancelIndex, stateIndex), /await|Promise|setTimeout|requestAnimationFrame/);

  const beginScene = uiSource.slice(uiSource.indexOf("const beginSceneSelection"), uiSource.indexOf("const beginScene", uiSource.indexOf("const beginSceneSelection") + 20));
  assert.match(beginScene, /stopInteraction\("conversation:scene-selection-opened"\);\s*unlockAppleTtsOnUserGesture\("scene-fallback"\)/);
});

test("startup guide appears once per App mount and OK synchronously unlocks before closing", () => {
  assert.match(appSource, /useState\(true\)/);
  assert.match(appSource, /role="dialog"[^>]*aria-modal="true"/);
  assert.match(appSource, /字幕のON\/OFF/);
  assert.match(appSource, /ゆっくり \/ ややゆっくり \/ 通常/);
  const handler = appSource.slice(appSource.indexOf("const closeStartupGuide"), appSource.indexOf("return ("));
  assert.match(handler, /unlockAppleTtsOnUserGesture\("startup-dialog"\);\s*setShowStartupGuide\(false\)/);
  assert.doesNotMatch(handler, /await|Promise|setTimeout|requestAnimationFrame|useEffect/);
});
