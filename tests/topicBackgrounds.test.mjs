import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const backgroundsUrl = new URL("../src/data/topicBackgrounds.ts", import.meta.url);
const topicsUrl = new URL("../src/data/talkTopics.seed.ts", import.meta.url);

test("the original topics have mapped backgrounds and added topics use the cafe fallback", async () => {
  const [backgroundsSource, topicsSource] = await Promise.all([
    readFile(backgroundsUrl, "utf8"),
    readFile(topicsUrl, "utf8"),
  ]);
  const topicIds = [...topicsSource.matchAll(/id: "(topic\d+)"/g)].map((match) => match[1]);
  const mappedIds = new Set([...backgroundsSource.matchAll(/^\s*(topic\d+):/gm)].map((match) => match[1]));
  assert.equal(topicIds.length, 90);
  assert.deepEqual(topicIds.slice(0, 15).filter((id) => !mappedIds.has(id)), []);
  assert.deepEqual(topicIds.slice(15).filter((id) => mappedIds.has(id)), []);
  assert.equal(mappedIds.size, 15);
  assert.match(backgroundsSource, /DEFAULT_TOPIC_BACKGROUND = cafe/);

  const imagePaths = [...backgroundsSource.matchAll(/from "(\.\.\/assets\/backgrounds\/[^"]+\.png)"/g)]
    .map((match) => new URL(match[1], backgroundsUrl));
  assert.ok(imagePaths.length > 1);
  await Promise.all(imagePaths.map((url) => access(url)));
});
