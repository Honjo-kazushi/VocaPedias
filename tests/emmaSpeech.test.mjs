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
const { CHARACTER_PROFILES } = await import(profiles);
const voice = (name, lang) => ({ name, lang });
const us = voice("Google US English", "en-US");
const gb = voice("英語 イギリス", "en_GB");
const legacy = voice("Microsoft Zira", "en-US");
const japanese = voice("Japanese", "ja-JP");

// Runtime imports explicitly target the instrumented TS implementation.
for (const extension of ["ts"]) {
  const speech = await import(moduleUrl(((await read(`../src/sound/speakEn.${extension}`))
    .replaceAll('"../characters/characterProfiles"', JSON.stringify(profiles))
    .replaceAll('"./selectCharacterVoice"', JSON.stringify(selector))
    .replaceAll('"./cancelSpeechSynthesis"', JSON.stringify(cancelDiagnostics))
    .replace(/import \{ tossaPerf as logTossaPerf \} from "\.\.\/debug\/tossaPerf";/, "const logTossaPerf = () => {};")) + `\n// ${extension} test module`));

  test(`${extension}: Emma queue settings, fallback, Review and lifecycle`, () => {
    const keys = ["navigator", "window", "speechSynthesis", "SpeechSynthesisUtterance"];
    const descriptors = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
    let available = [legacy, us, gb, japanese];
    let failDiscovery = false;
    let reads = 0;
    const queued = [];
    let now = 0;
    let timerId = 0;
    const timers = new Map();
    const listeners = new Set();
    let autoFinishWarmup = false;
    const advance = (ms) => {
      const until = now + ms;
      for (;;) {
        const next = [...timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
      }
      now = until;
    };
    const speakSentences = (...args) => {
      const cancel = speech.speakEnSentences(...args);
      if (autoFinishWarmup) settleWarmupAndStart();
      else advance(1150);
      return cancel;
    };
    const speakQueue = (...args) => {
      const cancel = speech.speakSpeechQueue(...args);
      if (autoFinishWarmup) settleWarmupAndStart();
      else advance(1150);
      return cancel;
    };
    const settleWarmupAndStart = () => {
      let warmup = queued.find((utterance) => utterance.volume === 0);
      if (!warmup && queued.length === 0) {
        advance(1000);
        warmup = queued.find((utterance) => utterance.volume === 0);
      }
      if (warmup) {
        queued.splice(queued.indexOf(warmup), 1);
        warmup.onend?.();
      }
      advance(250);
    };
    const synth = {
      addEventListener(type, listener) { assert.equal(type, "voiceschanged"); listeners.add(listener); },
      removeEventListener(type, listener) { assert.equal(type, "voiceschanged"); listeners.delete(listener); },
      getVoices() { reads++; if (failDiscovery) throw new Error("unavailable"); return available; },
      cancel() { queued.length = 0; },
      speak(utter) { queued.push(utter); },
    };
    const setGlobal = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, value });
    const setDevice = (userAgent) => setGlobal("navigator", { userAgent, maxTouchPoints: 0 });
    const events = [];
    const callbacks = {
      onSentenceStart: (text) => events.push(text), onSentenceEnd: () => events.push("end"),
      onBoundary: () => events.push("boundary"), onFinish: (reason) => events.push(reason),
    };
    const check = (expectedVoice, lang) => {
      assert.ok(queued.length > 0);
      for (const utter of queued) {
        assert.equal(utter.voice, expectedVoice);
        assert.equal(utter.lang, lang);
        assert.equal(utter.rate, .95);
        assert.equal(utter.pitch, 1);
      }
    };
    try {
      setGlobal("window", {
        speechSynthesis: synth,
        setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { at: now + ms, fn }); return id; },
        clearTimeout(id) { timers.delete(id); },
      });
      setGlobal("speechSynthesis", synth);
      setGlobal("SpeechSynthesisUtterance", class {
        constructor(text) { this.text = text; this.voice = null; this.rate = 1; this.pitch = 1; }
      });
      setDevice("Windows NT Chrome");
      // The first call silently warms the selected voice before the 250ms settling delay.
      let stopPending = speech.speakEnSentences("Hello. Second.", callbacks, "mike");
      assert.equal(queued.length, 1);
      const warmup = queued.shift();
      assert.equal(warmup.text, ".");
      assert.equal(warmup.volume, 0);
      assert.equal(warmup.voice, gb);
      assert.deepEqual(events, []);
      warmup.onstart?.();
      assert.deepEqual(events, []);
      warmup.onend();
      advance(249);
      assert.equal(queued.length, 0);
      assert.deepEqual(events, []);
      advance(1);
      assert.equal(queued.length, 2);
      assert.deepEqual(events, []);
      stopPending();
      events.length = 0;
      // Stopping during the short delay must never resurrect speech.
      stopPending = speech.speakEnSentences("Cancelled.", callbacks, "mike");
      stopPending();
      advance(2000);
      assert.equal(queued.length, 0);
      assert.deepEqual(events, ["end", "cancel"]);
      events.length = 0;
      speakSentences("Slower now.", callbacks, "mike", "en-US", 0.8);
      assert.equal(queued.length, 1);
      assert.equal(queued[0].rate, CHARACTER_PROFILES.mike.voicePreferences.desktop.rate * 0.8);
      queued[0].onstart(); queued[0].onend();
      // Empty voice list: do not create utterances until discovery completes.
      events.length = 0;
      available = [];
      stopPending = speech.speakEnSentences("Hello. Again.", callbacks, "mike");
      advance(200);
      assert.equal(queued.length, 0);
      assert.equal(listeners.size, 1);
      const male = voice("Google UK English Male", "en-GB");
      available = [male];
      for (const listener of listeners) listener();
      assert.equal(queued.length, 1);
      const discoveredVoiceWarmup = queued.shift();
      assert.equal(discoveredVoiceWarmup.text, ".");
      assert.equal(discoveredVoiceWarmup.volume, 0);
      assert.equal(discoveredVoiceWarmup.voice, male);
      discoveredVoiceWarmup.onend();
      advance(249);
      assert.equal(queued.length, 0);
      advance(1);
      assert.equal(queued.length, 2);
      assert.ok(queued.every(utter => utter.voice === male));
      assert.deepEqual(events, []);
      assert.equal(listeners.size, 0);
      stopPending();
      // Cancelling voice discovery removes both the event and timeout.
      available = [];
      stopPending = speech.speakEnSentences("Cancelled discovery.", callbacks, "mike");
      stopPending();
      assert.equal(listeners.size, 0);
      advance(2000);
      assert.equal(queued.length, 0);
      assert.equal(timers.size, 0);
      // Discovery timeout is bounded; late voice events cannot enqueue twice.
      events.length = 0;
      stopPending = speech.speakEnSentences("Hello fallback.", callbacks, "mike");
      advance(999);
      assert.equal(queued.length, 0);
      advance(1);
      assert.equal(listeners.size, 0);
      assert.equal(queued.length, 1);
      const fallbackWarmup = queued.shift();
      assert.equal(fallbackWarmup.text, ".");
      assert.equal(fallbackWarmup.volume, 0);
      assert.equal(fallbackWarmup.voice, null);
      fallbackWarmup.onend();
      advance(250);
      assert.equal(queued.length, 1);
      assert.equal(queued[0].voice, null);
      assert.deepEqual(events, []);
      available = [male];
      for (const listener of listeners) listener();
      advance(2000);
      assert.equal(queued.length, 1);
      stopPending();
      // Review cancellation during discovery must finish once without starting.
      available = [];
      const pendingReviewEvents = [];
      const stopReview = speech.speakSpeechQueue([
        { lang: "ja-JP", text: "説明" }, { lang: "en-US", text: "Hello." },
      ], {
        onItemStart: () => pendingReviewEvents.push("start"),
        onItemEnd: () => pendingReviewEvents.push("end"),
        onFinish: (reason) => pendingReviewEvents.push(reason),
      }, "emma");
      advance(200);
      stopReview();
      stopReview();
      advance(2000);
      assert.deepEqual(pendingReviewEvents, ["cancel"]);
      assert.equal(queued.length, 0);
      assert.equal(listeners.size, 0);
      assert.equal(timers.size, 0);
      // A newer Review queue supersedes a still-waiting conversation.
      speech.speakEnSentences("Old conversation.", callbacks, "mike");
      available = [us, japanese];
      speech.speakSpeechQueue([{ lang: "en-US", text: "Review." }], {
        onItemStart() {}, onItemEnd() {},
      }, "emma");
      assert.deepEqual(queued.map(utter => utter.text), ["."]);
      assert.equal(queued[0].voice, us);
      assert.equal(queued[0].volume, 0);
      const emmaWarmup = queued.shift();
      emmaWarmup.onend();
      advance(250);
      assert.deepEqual(queued.map(utter => utter.text), ["Review."]);
      assert.equal(queued[0].voice, us);
      advance(2000);
      assert.equal(queued.length, 1);
      assert.equal(listeners.size, 0);
      events.length = 0;
      autoFinishWarmup = true;
      // Every partner, every sentence, repeated responses and device profiles.
      const pcVoices = [us, voice("Google UK English Male", "en-GB"), voice("Google UK English Female", "en-GB")];
      const androidVoices = ["en-AU", "en-US", "en-GB", "en-NG", "en-IN"].map(lang => voice(lang, lang));
      for (const [id, profile] of Object.entries(CHARACTER_PROFILES)) {
        if (id === "miyabi") continue;
        for (const [device, voices, preference] of [
          ["Windows NT Chrome", pcVoices, profile.voicePreferences.desktop],
          ["Android Chrome", androidVoices, profile.voicePreferences.android],
        ]) {
          setDevice(device);
          available = voices;
          for (let response = 0; response < 2; response++) {
            speakSentences("First. Second. Third.", callbacks, id);
            assert.equal(queued.length, 3);
            const expected = preference.preferredNames
              ? voices.find(v => v.name === preference.preferredNames[0])
              : voices.find(v => v.lang === preference.preferredLangs[0]);
            for (const utter of queued) {
              assert.equal(utter.voice, expected, id);
              assert.equal(utter.lang, expected.lang.toLowerCase(), id);
              assert.equal(utter.rate, preference.rate, id);
              assert.equal(utter.pitch, preference.pitch, id);
              utter.onstart(); utter.onboundary({}); utter.onend();
            }
          }
        }
        setDevice("iPhone");
        const applePreference = profile.voicePreferences.ios;
        for (const fail of [false, true]) {
          available = []; failDiscovery = fail;
          speakSentences("Fallback. Still speaking.", callbacks, id);
          assert.equal(queued.length, 1);
          assert.equal(queued[0].text, "Fallback.");
          queued[0].onend();
          assert.equal(queued.length, 2);
          assert.equal(queued[1].text, "Still speaking.");
          for (const utter of queued) {
            assert.equal(utter.voice, null);
            assert.equal(utter.rate, applePreference.rate);
            assert.equal(utter.pitch, applePreference.pitch);
            assert.equal(utter.lang, "en-US");
          }
        }
        failDiscovery = false;
        available = [voice("Fallback English", "en-US")];
        const waitingForPreferred = speech.speakEnSentences("Preferred voice.", callbacks, "emma");
        advance(999);
        assert.equal(queued.length, 0);
        assert.equal(listeners.size, 1);
        const samantha = voice("Samantha", "en-US");
        available = [samantha];
        for (const listener of [...listeners]) listener();
        settleWarmupAndStart();
        assert.deepEqual(queued.map((utter) => utter.text), ["Preferred voice."]);
        assert.equal(queued[0].voice, samantha);
        waitingForPreferred();

        available = [voice("Samantha", "en-US")];
        const sequentialCancel = speakSentences("One. Two. Three.", callbacks, "emma");
        assert.deepEqual(queued.map((utter) => utter.text), ["One."]);
        const cancelledFirst = queued[0];
        sequentialCancel();
        cancelledFirst.onend();
        assert.deepEqual(queued, []);

        speakSentences("Error one. Error two.", callbacks, "emma");
        assert.deepEqual(queued.map((utter) => utter.text), ["Error one."]);
        queued[0].onerror({ error: "synthesis-failed" });
        assert.deepEqual(queued, []);

        const appleQueueEvents = [];
        speakQueue([
          { lang: "en-US", text: "Queue one." },
          { lang: "en-US", text: "Queue two." },
        ], {
          onItemStart() {}, onItemEnd: (item) => appleQueueEvents.push(`end:${item.text}`),
          onFinish: (reason) => appleQueueEvents.push(reason),
        }, "emma");
        assert.deepEqual(queued.map((utter) => utter.text), ["Queue one."]);
        queued[0].onend();
        assert.deepEqual(queued.map((utter) => utter.text), ["Queue one.", "Queue two."]);
        queued[1].onend();
        assert.deepEqual(appleQueueEvents, ["complete"]);
        failDiscovery = false;
        available = [...pcVoices, japanese];
        setDevice("Windows NT Chrome");
        speakQueue([{ lang: "ja-JP", text: "説明" }], {
          onItemStart() {}, onItemEnd() {},
        }, id);
        assert.equal(queued[0].voice, japanese);
        const japanesePreference = profile.japaneseVoicePreferences?.desktop ?? profile.voicePreferences.desktop;
        assert.equal(queued[0].rate, japanesePreference.rate);
        assert.equal(queued[0].pitch, japanesePreference.pitch);
        // Review explicitly overrides the previous conversation partner.
        speakQueue([{ lang: "en-US", text: "Review." }], {
          onItemStart() {}, onItemEnd() {},
        }, "emma");
        assert.equal(queued[0].voice, us);
        assert.equal(queued[0].rate, .95);
        assert.equal(queued[0].pitch, 1);
      }
      available = [japanese];
      setDevice("Windows NT Chrome");
      speakSentences("こんにちは。今日はどうでした？", callbacks, "miyabi", "ja-JP");
      assert.equal(queued.length, 2);
      for (const utter of queued) {
        assert.equal(utter.voice, japanese);
        assert.equal(utter.lang, "ja-JP");
        assert.equal(utter.rate, CHARACTER_PROFILES.miyabi.voicePreferences.desktop.rate);
        assert.equal(utter.pitch, CHARACTER_PROFILES.miyabi.voicePreferences.desktop.pitch);
        utter.onstart(); utter.onend();
      }
      available = [legacy, us, gb, japanese];
      reads = 0; events.length = 0;
      setDevice("Windows NT Chrome");
      const stop = speakSentences("First. Second. Third.", callbacks, "emma");
      // One readiness lookup, one warm-up selection, then one per sentence.
      assert.equal(reads, 5);
      check(us, "en-us");
      assert.deepEqual(events, []);
      const stale = queued[0];
      stale.onstart(); stale.onboundary({});
      stop(); stale.onend(); stale.onstart(); stale.onboundary({});
      assert.deepEqual(events, ["First.", "boundary", "end", "cancel"]);
      events.length = 0;
      speakSentences("Again. Last.", callbacks, "emma");
      check(us, "en-us");
      for (const utter of queued) { utter.onstart(); utter.onend(); }
      assert.deepEqual(events, ["Again.", "end", "Last.", "end", "complete"]);
      setDevice("Android Chrome");
      speakSentences("First. Second.", callbacks, "emma");
      check(gb, "en-gb");
      available = [];
      speakSentences("Empty. Still speaking.", callbacks, "emma");
      check(null, "en-US");
      failDiscovery = true;
      speakSentences("Failure. Still speaking.", callbacks, "emma");
      check(null, "en-US");
      failDiscovery = false;
      available = [japanese];
      speakSentences("No English.", callbacks, "emma");
      check(null, "en-US");
      available = [legacy, us, gb, japanese];
      setDevice("iPhone");
      speakSentences("Fallback.", callbacks, "emma");
      assert.ok(queued.length > 0);
      for (const utter of queued) {
        assert.equal(utter.voice, legacy);
        assert.equal(utter.lang, "en-us");
        assert.equal(utter.rate, 1);
        assert.equal(utter.pitch, .98);
      }
      for (const id of [undefined]) {
        speakSentences("Other character.", callbacks, id);
        assert.equal(queued[0].voice, legacy);
        assert.equal(queued[0].rate, 1);
        assert.equal(queued[0].pitch, 1);
      }
      setDevice("Android Chrome");
      const reviewEvents = [];
      speakQueue([
        { lang: "ja-JP", text: "説明" }, { lang: "en-US", text: "Example." },
        { lang: "en-US", text: "Another example." },
      ], {
        onItemStart: (_, index) => reviewEvents.push(index), onItemEnd: () => reviewEvents.push("end"),
        onFinish: (reason) => reviewEvents.push(reason),
      }, "emma");
      assert.equal(queued[0].voice, japanese);
      assert.equal(queued[0].rate, CHARACTER_PROFILES.emma.japaneseVoicePreferences.android.rate);
      assert.equal(queued[0].lang, "ja-JP");
      for (const utter of queued.slice(1)) {
        assert.equal(utter.voice, gb); assert.equal(utter.rate, .95); assert.equal(utter.pitch, 1);
      }
      for (const utter of queued) { utter.onstart(); utter.onend(); }
      assert.deepEqual(reviewEvents, [0, "end", 1, "end", 2, "end", "complete"]);
      speakQueue([{ lang: "ja-JP", text: "休憩モードの振り返り", brightJapanese: true }], {
        onItemStart() {}, onItemEnd() {},
      }, "emma");
      assert.equal(queued[0].voice, japanese);
      assert.equal(queued[0].rate, CHARACTER_PROFILES.emma.brightJapaneseVoicePreferences.android.rate);
      assert.equal(queued[0].pitch, CHARACTER_PROFILES.emma.brightJapaneseVoicePreferences.android.pitch);
      const nanami = voice("Microsoft Nanami Online (Natural) - Japanese (Japan)", "ja-JP");
      const ayumi = voice("Microsoft Ayumi", "ja-JP");
      available = [nanami, ayumi];
      speakQueue([{
        lang: "ja-JP", text: "Emmaの振り返り", brightJapanese: true,
        characterId: "emma", avoidVoiceCharacterId: "miyabi",
      }], { onItemStart() {}, onItemEnd() {} }, "miyabi");
      assert.equal(queued[0].voice, ayumi);
      assert.equal(queued[0].rate, CHARACTER_PROFILES.emma.brightJapaneseVoicePreferences.android.rate);
    } finally {
      keys.forEach((key, index) => {
        if (descriptors[index]) Object.defineProperty(globalThis, key, descriptors[index]);
        else delete globalThis[key];
      });
    }
  });
}
