import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Load the actual TS modules without introducing a test runner dependency.
const toModule = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText).toString("base64")}`;
const profileUrl = toModule(await readFile(new URL("../src/characters/characterProfiles.ts", import.meta.url), "utf8"));
const { CHARACTER_PROFILES, CONVERSATION_PARTNER_IDS, ENGLISH_CONVERSATION_PARTNER_IDS } = await import(profileUrl);
const selectorSource = await readFile(new URL("../src/sound/selectCharacterVoice.ts", import.meta.url), "utf8");
const { selectCharacterVoice: select, normalizeLang } = await import(toModule(
  selectorSource.replaceAll('"../characters/characterProfiles"', JSON.stringify(profileUrl)),
));
const voice = (name, lang) => ({ name, lang, localService: true, default: false, voiceURI: name });
const pc = [voice("Google US English", "en-US"), voice("Google UK English Female", "en-GB"), voice("Google UK English Male", "en-GB")];
const android = [voice("英語 オーストラリア", "en_AU"), voice("英語 イギリス", "en_GB"), voice("英語 インド", "en_IN"), voice("英語 ナイジェリア", "en_NG"), voice("英語 アメリカ合衆国", "en_US")];
const rows = [
  ["emma", 0, .95, 1, 1, .95, 1],
  ["sophie", 0, 1.05, 1.1, 0, 1.05, 1.05],
  ["lily", 1, .95, 1.08, 4, .95, 1],
  ["grandma_rose", 1, .82, .9, 3, .85, .9],
  ["mike", 2, 1.08, 1.08, 0, 1.08, .95],
  ["jamie", 2, .92, .95, 4, .92, .92],
  ["dr_dan", 2, .85, .85, 1, .85, .85],
  ["leo", 0, 1.1, .92, 0, 1.1, .92],
];
test("partner selection separates seven English partners from Miyabi", () => {
  assert.deepEqual(ENGLISH_CONVERSATION_PARTNER_IDS, [
    "mike", "sophie", "jamie", "lily", "grandma_rose", "dr_dan", "leo",
  ]);
  assert.deepEqual(CONVERSATION_PARTNER_IDS, [...ENGLISH_CONVERSATION_PARTNER_IDS, "miyabi"]);
  assert.ok(!CONVERSATION_PARTNER_IDS.includes("emma"));
  assert.ok(!ENGLISH_CONVERSATION_PARTNER_IDS.includes("miyabi"));
  for (const id of CONVERSATION_PARTNER_IDS) {
    const profile = CHARACTER_PROFILES[id];
    assert.equal(profile.isConversationPartner, true);
    assert.ok(profile.personality.length > 0);
    assert.ok(profile.conversationStyle.length > 0);
  }
});
test("Miyabi and Japanese Emma use character-specific Japanese voices", () => {
  const nanami = voice("Microsoft Nanami Online (Natural) - Japanese (Japan)", "ja-JP");
  const ayumi = voice("Microsoft Ayumi", "ja-JP");
  const sayaka = voice("Microsoft Sayaka", "ja-JP");
  const haruka = voice("Microsoft Haruka", "ja-JP");
  const voices = [nanami, haruka, ayumi, sayaka, ...pc];
  const miyabi = select("miyabi", voices, { deviceGroup: "desktop", locale: "ja-JP" });
  assert.equal(miyabi.voice, nanami);
  assert.equal(miyabi.lang, "ja-jp");
  assert.equal(miyabi.rate, 1.1);
  const emma = select("emma", voices, { deviceGroup: "desktop", locale: "ja-JP", brightJapanese: true });
  assert.equal(emma.voice, sayaka);
  assert.equal(emma.rate, 1.12);
  assert.equal(emma.pitch, 1.24);
  const emmaWithoutMiyabiVoice = select("emma", voices, {
    deviceGroup: "desktop", locale: "ja-JP", brightJapanese: true, excludedVoiceNames: [nanami.name, sayaka.name],
  });
  assert.equal(emmaWithoutMiyabiVoice.voice, ayumi);
});
for (const [id, pi, pr, pp, ai, ar, ap] of rows) {
  test(`${id}: PC, Android and fallback settings`, () => {
    for (const [group, voices, index, rate, pitch, reason] of [
      ["desktop", pc, pi, pr, pp, "preferredName"],
      ["android", android, ai, ar, ap, "preferredLang"],
    ]) {
      const result = select(id, voices, { deviceGroup: group });
      assert.equal(result.voice, voices[index]);
      assert.equal(result.rate, rate);
      assert.equal(result.pitch, pitch);
      assert.equal(result.selectionReason, reason);
    }
    const fallback = select(id, [], { deviceGroup: "fallback" });
    assert.equal(fallback.voice, null);
    assert.equal(fallback.lang, "en-US");
    assert.equal(fallback.rate, pr);
    assert.equal(fallback.pitch, pp);
  });
}
test("normalized languages, secondary preference and exact before prefix", () => {
  assert.equal(normalizeLang(" EN_us "), "en-us");
  const indian = android[2];
  assert.equal(select("grandma_rose", [indian], { deviceGroup: "android" }).voice, indian);
  const extended = voice("Extended", "en_GB_extra");
  assert.equal(select("emma", [extended], { deviceGroup: "android" }).selectionReason, "preferredLangPrefix");
  assert.equal(select("emma", [extended, android[1]], { deviceGroup: "android" }).voice, android[1]);
});
test("fallback uses preferred region, US, GB, any English, then null", () => {
  const us = voice("Unknown US", "en_US"), gb = voice("Unknown GB", "en-GB");
  const other = voice("Unknown", "en-CA"), jp = voice("Japanese", "ja-JP");
  assert.equal(select("emma", [gb, us], { deviceGroup: "fallback" }).voice, us);
  assert.equal(select("mike", [us, gb], { deviceGroup: "fallback" }).voice, gb);
  assert.equal(select("mike", [other, us], { deviceGroup: "fallback" }).voice, us);
  assert.equal(select("emma", [other, gb], { deviceGroup: "fallback" }).voice, gb);
  assert.equal(select("emma", [jp, other], { deviceGroup: "fallback" }).voice, other);
  assert.equal(select("emma", [jp], { deviceGroup: "fallback" }).voice, null);
  assert.equal(select("mike", android, { deviceGroup: "desktop" }).voice, android[1]);
});
test("device detection includes iPad desktop UA and ignores missing named voices", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    for (const [userAgent, maxTouchPoints, expected] of [
      ["Android", 1, "android"], ["Windows NT", 0, "desktop"],
      ["iPhone", 1, "ios"], ["Macintosh", 5, "ios"], ["Unknown", 0, "fallback"],
    ]) {
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent, maxTouchPoints } });
      assert.equal(select("emma", android).deviceGroup, expected);
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else delete globalThis.navigator;
  }
});

test("all nine characters use the selected Apple production settings with safe language fallback", () => {
  const appleRows = [
    ["emma", "Serena", "en-GB", 1, .98],
    ["mike", "Daniel", "en-GB", 1.03, .98],
    ["sophie", "Zoe", "en-US", 1.02, 1.06],
    ["jamie", "Jamie", "en-GB", .96, .98],
    ["lily", "Moira", "en-IE", 1.02, 1.06],
    ["grandma_rose", "Moira", "en-IE", .84, .96],
    ["dr_dan", "Daniel", "en-GB", .92, .96],
    ["leo", "Moira", "en-IE", 1.08, 1.1],
    ["miyabi", "O-Ren", "ja-JP", 1.1, 1.02],
  ];
  for (const [id, name, lang, rate, pitch] of appleRows) {
    const selectedVoice = voice(name, lang);
    const result = select(id, [selectedVoice], { deviceGroup: "ios" });
    assert.equal(result.voice, selectedVoice, id);
    assert.equal(result.rate, rate, id);
    assert.equal(result.pitch, pitch, id);
    assert.equal(result.deviceGroup, "ios", id);

    const languageFallback = voice(`${id} fallback`, lang);
    const fallbackResult = select(id, [languageFallback], { deviceGroup: "ios" });
    assert.equal(fallbackResult.voice, languageFallback, id);
    assert.notEqual(fallbackResult.selectionReason, "browserDefault", id);
  }
  assert.deepEqual(CHARACTER_PROFILES.leo.voicePreferences.ios.preferredNames.slice(0, 1), ["Moira"]);
  assert.deepEqual(CHARACTER_PROFILES.leo.voicePreferences.ios.preferredLangs.slice(0, 1), ["en-IE"]);
  assert.equal(select("emma", [voice("Serena (Enhanced)", "en-GB")], { deviceGroup: "ios" }).voice.name, "Serena (Enhanced)");
});
