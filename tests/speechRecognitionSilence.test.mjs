import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/hooks/useUserSpeechRecognition.ts", import.meta.url), "utf8");
const testableSource = source
  .replace(/import[^;]+;\s*/g, "")
  .replaceAll("import.meta.env.DEV", "false")
  .replace("export const SPEECH_SILENCE_TIMEOUT_MS", "const SPEECH_SILENCE_TIMEOUT_MS")
  .replace("export function useUserSpeechRecognition", "function useUserSpeechRecognition")
  + "\nexport { useUserSpeechRecognition, SPEECH_SILENCE_TIMEOUT_MS };";
const compiled = ts.transpileModule(testableSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;

function createHarness() {
  let now = 0;
  let nextTimerId = 1;
  const timers = new Map();
  const instances = [];

  globalThis.useRef = (value) => ({ current: value });
  globalThis.useState = (value) => [value, () => {}];
  globalThis.useCallback = (callback) => callback;
  globalThis.useEffect = () => {};
  globalThis.mergeRecognitionResults = (chunks) => chunks.filter(Boolean).join(" ").trim();

  class MockRecognition {
    stopCalls = 0;
    start() {}
    stop() { this.stopCalls += 1; }
    abort() {}
  }

  globalThis.window = {
    SpeechRecognition: class extends MockRecognition {
      constructor() {
        super();
        instances.push(this);
      }
    },
    setTimeout(callback, delay) {
      const id = nextTimerId++;
      timers.set(id, { callback, due: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };

  const advance = (milliseconds) => {
    const target = now + milliseconds;
    while (true) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.due <= target)
        .sort((left, right) => left[1].due - right[1].due)[0];
      if (!next) break;
      timers.delete(next[0]);
      now = next[1].due;
      next[1].callback();
    }
    now = target;
  };

  return { instances, advance };
}

const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const recognitionModule = await import(moduleUrl);

function startRecognition() {
  const harness = createHarness();
  const hook = recognitionModule.useUserSpeechRecognition();
  hook.start({
    onStart() {}, onTranscript() {}, onEnd() {}, onCancel() {}, onError() {},
  });
  return { ...harness, recognition: harness.instances[0] };
}

test("silence before the learner speaks does not stop recognition", () => {
  const { recognition, advance } = startRecognition();
  recognition.onstart();
  recognition.onaudiostart();
  recognition.onsoundstart();
  advance(15_000);
  assert.equal(recognition.stopCalls, 0);
});

test("three seconds after speechstart stops recognition", () => {
  const { recognition, advance } = startRecognition();
  recognition.onstart();
  recognition.onspeechstart();
  advance(2_999);
  assert.equal(recognition.stopCalls, 0);
  advance(1);
  assert.equal(recognition.stopCalls, 1);
});

test("a result arms the timer even without speechstart", () => {
  const { recognition, advance } = startRecognition();
  recognition.onstart();
  recognition.onresult({ results: [], resultIndex: 0 });
  advance(3_000);
  assert.equal(recognition.stopCalls, 1);
});

test("a later result resets the armed timer", () => {
  const { recognition, advance } = startRecognition();
  recognition.onstart();
  recognition.onresult({ results: [], resultIndex: 0 });
  advance(2_000);
  recognition.onresult({ results: [], resultIndex: 0 });
  advance(1_000);
  assert.equal(recognition.stopCalls, 0);
  advance(2_000);
  assert.equal(recognition.stopCalls, 1);
});
