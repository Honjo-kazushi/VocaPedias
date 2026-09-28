import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/components/AiConversationUI.tsx", import.meta.url), "utf8");

test("iPad Emma guide starts its second utterance after the first and retries if onstart stalls", () => {
  assert.match(source, /IPAD_EMMA_SECOND_UTTERANCE_WATCHDOG_MS = 750/);
  assert.match(source, /\/iPad\/i\.test\(navigator\.userAgent\)/);
  assert.match(source, /if \(!isIPad\) \{[\s\S]*speakCharacterItems\(\[firstItem, secondItem\]/);
  assert.match(source, /onFinish: \(firstReason\) => \{[\s\S]*firstReason !== "complete"/);
  assert.match(source, /const speakSecond = \(\) => speakCharacterItems\(\[secondItem\]/);
  assert.match(source, /secondStarted = true;[\s\S]*clearTimeout\(watchdog\)/);
  assert.match(source, /if \(!secondStarted && startTokenRef\.current === token\) speakSecond\(\)/);
});
