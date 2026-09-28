import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/components/AiConversationUI.tsx", import.meta.url), "utf8");

test("normal iPad Emma guide advances from first onend to the second utterance", () => {
  assert.match(source, /onFinish: \(firstReason\) => \{[\s\S]*firstReason === "complete"\) advanceToSecond\(\)/);
  assert.match(source, /const advanceToSecond = \(\) => \{[\s\S]*speakSecond\(\)/);
});

test("stalled first iPad utterance advances through a 4.5 second watchdog", () => {
  assert.match(source, /IPAD_EMMA_FIRST_UTTERANCE_WATCHDOG_MS = 4500/);
  assert.match(source, /onItemStart: \(\) => \{[\s\S]*setTimeout\(advanceToSecond, IPAD_EMMA_FIRST_UTTERANCE_WATCHDOG_MS\)/);
});

test("iPad guide prevents duplicate advancement and retains the second onstart watchdog", () => {
  assert.match(source, /IPAD_EMMA_SECOND_UTTERANCE_WATCHDOG_MS = 750/);
  assert.match(source, /\/iPad\/i\.test\(navigator\.userAgent\)/);
  assert.match(source, /if \(!isIPad\) \{[\s\S]*speakCharacterItems\(\[firstItem, secondItem\]/);
  assert.match(source, /if \(advancedToSecond \|\| startTokenRef\.current !== token\) return/);
  assert.match(source, /advancedToSecond = true/);
  assert.match(source, /const speakSecond = \(\) => speakCharacterItems\(\[secondItem\]/);
  assert.match(source, /secondStarted = true;[\s\S]*clearTimeout\(secondStartWatchdog\)/);
  assert.match(source, /if \(!secondStarted && startTokenRef\.current === token\) speakSecond\(\)/);
});
