import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/hooks/useUserSpeechRecognition.ts", import.meta.url), "utf8");
const testableSource = source
  .replace(/import[^;]+;\s*/g, "")
  .replaceAll("import.meta.env.DEV", "false")
  .replace("export const SPEECH_SILENCE_TIMEOUT_MS", "const SPEECH_SILENCE_TIMEOUT_MS")
  .replaceAll("export const IOS_DEAD_START_", "const IOS_DEAD_START_")
  .replace("export function useUserSpeechRecognition", "function useUserSpeechRecognition")
  + "\nexport { useUserSpeechRecognition, SPEECH_SILENCE_TIMEOUT_MS, IOS_DEAD_START_TIMEOUT_MS, IOS_DEAD_START_RETRY_TIMEOUT_MS, IOS_DEAD_START_RESTART_DELAY_MS, IOS_DEAD_START_MAX_RETRIES };";
const compiled = ts.transpileModule(testableSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;

function createHarness(device = "desktop") {
  let now = 0;
  let nextTimerId = 1;
  const timers = new Map();
  const instances = [];

  globalThis.useRef = (value) => ({ current: value });
  globalThis.useState = (value) => [value, () => {}];
  globalThis.useCallback = (callback) => callback;
  globalThis.useEffect = () => {};
  globalThis.mergeRecognitionResults = (chunks) => chunks.filter(Boolean).join(" ").trim();
  globalThis.tossaPerf = () => {};
  globalThis.APPLE_ERROR7_MAX_RETRIES = 1;
  globalThis.APPLE_ERROR7_RETRY_DELAY_MS = 500;
  globalThis.isAppleAssistantError7 = (group, error, message) =>
    group === "ios/fallback" && error === "aborted" && /kAFAssistantErrorDomain[\s\S]*7\b/.test(message);
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: device === "ios"
      ? { userAgent: "Mozilla/5.0 (iPad)", platform: "iPad", maxTouchPoints: 5 }
      : device === "android"
        ? { userAgent: "Mozilla/5.0 (Linux; Android 15)", platform: "Linux", maxTouchPoints: 5 }
        : { userAgent: "Mozilla/5.0 (Windows NT 10.0)", platform: "Win32", maxTouchPoints: 0 },
  });

  class MockRecognition {
    stopCalls = 0;
    abortCalls = 0;
    start() {}
    stop() { this.stopCalls += 1; }
    abort() { this.abortCalls += 1; }
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

test("onend preserves an interim transcript when no final result arrives", () => {
  const harness = createHarness();
  const ended = [];
  const hook = recognitionModule.useUserSpeechRecognition();
  hook.start({
    onStart() {}, onTranscript() {}, onCancel() {}, onError() {},
    onEnd(text, details) { ended.push({ text, details }); },
  });
  const recognition = harness.instances[0];
  recognition.onstart();
  recognition.onresult({
    results: [{ isFinal: false, 0: { transcript: "I like pizza" } }],
    resultIndex: 0,
  });
  recognition.onend();
  assert.deepEqual(ended, [{
    text: "I like pizza",
    details: { final: "", interim: "I like pizza" },
  }]);
});

test("iOS dead-start watchdog restarts twice and then leaves silence handling in control", () => {
  const harness = createHarness("ios");
  const hook = recognitionModule.useUserSpeechRecognition();
  hook.start({ onStart() {}, onTranscript() {}, onEnd() {}, onCancel() {}, onError() {} });
  harness.instances[0].onstart();
  harness.instances[0].onaudiostart();
  harness.advance(recognitionModule.IOS_DEAD_START_TIMEOUT_MS);
  assert.equal(harness.instances[0].abortCalls, 1);
  harness.advance(recognitionModule.IOS_DEAD_START_RESTART_DELAY_MS);
  assert.equal(harness.instances.length, 2);
  harness.instances[1].onstart();
  harness.advance(recognitionModule.IOS_DEAD_START_RETRY_TIMEOUT_MS);
  harness.advance(recognitionModule.IOS_DEAD_START_RESTART_DELAY_MS);
  assert.equal(harness.instances.length, 3);
  harness.instances[2].onstart();
  harness.advance(recognitionModule.IOS_DEAD_START_RETRY_TIMEOUT_MS * 2);
  assert.equal(harness.instances.length, 3);
});

test("iOS sound, speech, or result activity disarms the dead-start watchdog", () => {
  for (const event of ["onsoundstart", "onspeechstart", "onresult"]) {
    const harness = createHarness("ios");
    const hook = recognitionModule.useUserSpeechRecognition();
    hook.start({ onStart() {}, onTranscript() {}, onEnd() {}, onCancel() {}, onError() {} });
    const recognition = harness.instances[0];
    recognition.onstart();
    if (event === "onresult") recognition.onresult({ results: [], resultIndex: 0 });
    else recognition[event]();
    harness.advance(recognitionModule.IOS_DEAD_START_TIMEOUT_MS + 1_000);
    assert.equal(harness.instances.length, 1, event);
    assert.equal(recognition.abortCalls, 0, event);
  }
});

test("Miyabi TTS mode blocks recognition starts and disarms an active iOS watchdog", () => {
  const blockedHarness = createHarness("ios");
  const blockedHook = recognitionModule.useUserSpeechRecognition();
  blockedHook.setIgnoreRecognitionDuringMiyabi(true);
  blockedHook.start({ onStart() {}, onTranscript() {}, onEnd() {}, onCancel() {}, onError() {} });
  assert.equal(blockedHarness.instances.length, 0);

  const activeHarness = createHarness("ios");
  const activeHook = recognitionModule.useUserSpeechRecognition();
  activeHook.start({ onStart() {}, onTranscript() {}, onEnd() {}, onCancel() {}, onError() {} });
  activeHarness.instances[0].onstart();
  activeHook.setIgnoreRecognitionDuringMiyabi(true);
  activeHarness.advance(recognitionModule.IOS_DEAD_START_TIMEOUT_MS + recognitionModule.IOS_DEAD_START_RESTART_DELAY_MS);
  assert.equal(activeHarness.instances.length, 1);
  assert.equal(activeHarness.instances[0].abortCalls, 0);
});

test("Apple assistant error 7 creates one fresh instance after 500ms", () => {
  const harness = createHarness("ios");
  const errors = [];
  const hook = recognitionModule.useUserSpeechRecognition();
  hook.start({ onStart() {}, onTranscript() {}, onEnd() {}, onCancel() {}, onError(error) { errors.push(error); } });
  harness.instances[0].onerror({ error: "aborted", message: "kAFAssistantErrorDomain エラー7" });
  harness.advance(499);
  assert.equal(harness.instances.length, 1);
  harness.advance(1);
  assert.equal(harness.instances.length, 2);
  harness.instances[1].onerror({ error: "aborted", message: "kAFAssistantErrorDomain エラー7" });
  harness.advance(500);
  assert.equal(harness.instances.length, 2);
  assert.deepEqual(errors, ["aborted"]);
});

test("other errors and non-Apple devices never use the error 7 retry", () => {
  for (const [device, error, message] of [
    ["ios", "no-speech", "kAFAssistantErrorDomain エラー7"],
    ["ios", "aborted", "different error"],
    ["android", "aborted", "kAFAssistantErrorDomain エラー7"],
    ["desktop", "aborted", "kAFAssistantErrorDomain エラー7"],
  ]) {
    const harness = createHarness(device);
    const hook = recognitionModule.useUserSpeechRecognition();
    hook.start({ onStart() {}, onTranscript() {}, onEnd() {}, onCancel() {}, onError() {} });
    harness.instances[0].onerror({ error, message });
    harness.advance(500);
    assert.equal(harness.instances.length, 1, `${device}/${error}/${message}`);
  }
});
