import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const toModule = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText).toString("base64")}`;
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const topicsModule = await import(toModule(await read("../src/data/talkTopics.seed.ts")));
const angleModule = await import(toModule(await read("../src/data/topicAngles.ts")));
const promptModule = await import(toModule(await read("../src/ai/buildConversationPrompt.ts")));

test("three pilot topics contain conceptual angles", () => {
  const pilotIds = new Set(["topic003", "topic004", "topic012"]);
  const pilots = topicsModule.TALK_TOPICS.filter((topic) => pilotIds.has(topic.id));
  assert.deepEqual(pilots.map((topic) => topic.title), ["Sports", "Stress", "Friends"]);
  for (const topic of pilots) {
    assert.equal(topic.angles.length, 6);
    assert.ok(topic.angles.every((angle) => !/[?]$/.test(angle)));
  }
});

test("fixed topic catalog contains 90 sequential unique topics", () => {
  const { TALK_TOPICS } = topicsModule;
  assert.equal(TALK_TOPICS.length, 90);
  assert.equal(new Set(TALK_TOPICS.map(({ id }) => id)).size, 90);
  assert.deepEqual(
    TALK_TOPICS.map(({ id }) => id),
    Array.from({ length: 90 }, (_, index) => `topic${String(index + 1).padStart(3, "0")}`),
  );
});

test("the 75 added topics have six conceptual angles each", () => {
  const addedTopics = topicsModule.TALK_TOPICS.slice(15);
  assert.equal(addedTopics.length, 75);
  for (const topic of addedTopics) {
    assert.equal(topic.angles.length, 6, `${topic.id} should have six angles`);
    assert.ok(topic.angles.every((angle) => angle.trim() && !/[?]$/.test(angle)));
  }
});

test("each added PDF contributes one 15-topic block", () => {
  const expectedBlocks = [
    ["Inventions", "Helping Others"],
    ["Internet News", "Travel"],
    ["Working Environments", "Goals"],
    ["Reality TV", "Likenesses and Similarities"],
    ["Luck", "Success"],
  ];
  expectedBlocks.forEach(([firstTitle, lastTitle], bookIndex) => {
    const block = topicsModule.TALK_TOPICS.slice(15 + bookIndex * 15, 30 + bookIndex * 15);
    assert.equal(block.length, 15);
    assert.equal(block[0].title, firstTitle);
    assert.equal(block.at(-1).title, lastTitle);
  });
});

test("a repeated topic avoids its immediately previous angle", () => {
  const topic = topicsModule.TALK_TOPICS.find(({ id }) => id === "topic003");
  const first = angleModule.chooseTopicAngle(topic, () => 0);
  const second = angleModule.chooseTopicAngle(topic, () => 0);
  const third = angleModule.chooseTopicAngle(topic, () => 0.999);
  assert.equal(first, "team experience");
  assert.notEqual(second, first);
  assert.notEqual(third, second);
});

test("opening prompt combines angle and character without fixing later turns to it", () => {
  const topic = topicsModule.TALK_TOPICS.find(({ id }) => id === "topic012");
  const partner = {
    displayName: "Mike", role: "Easygoing friend",
    personality: ["friendly", "casual"], conversationStyle: ["short questions"],
  };
  const opening = promptModule.buildConversationPrompt(topic, partner, "old friendships");
  assert.match(opening, /You are Mike/);
  assert.match(opening, /friendly, casual/);
  assert.match(opening, /Conversation angle for this opening: old friendships/);
  assert.match(opening, /follow their answer naturally/);
  const continuation = promptModule.buildConversationPrompt(topic, partner);
  assert.doesNotMatch(continuation, /Conversation angle for this opening/);
});

test("fresh topic prompt gives brief context without becoming a news quiz", () => {
  const topic = {
    id: "fresh-2026-09-17-1",
    title: "Helpful Home Robots",
    category: "opinion",
    openingQuestion: "",
    deepQuestion: "",
    angles: ["a task to automate", "trusting robots", "daily convenience", "future homes"],
    source: "fresh",
    context: "New home robots are being demonstrated for simple everyday tasks.",
  };
  const partner = {
    displayName: "Lily", role: "Creative friend",
    personality: ["curious"], conversationStyle: ["warm"],
  };
  const prompt = promptModule.buildConversationPrompt(topic, partner, "a task to automate");
  assert.match(prompt, /Briefly introduce this context in no more than 1-2 short sentences/);
  assert.match(prompt, /Do not quiz the learner on news details/);
  assert.match(prompt, /There are no fixed reference questions/);
});

test("Miyabi uses the existing topic angle as internal Japanese conversation material", () => {
  const topic = topicsModule.TALK_TOPICS.find(({ id }) => id === "topic012");
  const partner = {
    displayName: "Miyabi", role: "Friendly Japanese university student",
    personality: ["calm", "cheerful"], conversationStyle: ["natural modern Japanese"],
    conversationLanguage: "ja", waitingPhrases: ["ゆっくりで大丈夫ですよ。"],
  };
  const prompt = promptModule.buildConversationPrompt(topic, partner, "recent experience");
  assert.match(prompt, /必ず自然な現代の日本語だけ/);
  assert.match(prompt, /recent experience/);
  assert.match(prompt, /文法訂正、発音指導、英語への言い換え、採点をしない/);
  assert.match(prompt, /英語のまま読まない/);
  assert.match(prompt, /「〇〇さん」「○○さん」「XXさん」/);
  assert.match(prompt, /二人称や主語を省略した自然な表現/);
});

test("scene role-play prompt creates a goal-driven situation without requiring a phrase", () => {
  const situation = {
    id: "hotel-check-in",
    sceneId: "hotel",
    sceneTitle: "Hotel",
    title: "Check-in",
    learnerRole: "a hotel guest",
    partnerRole: "a hotel receptionist",
    goal: "Complete check-in.",
    usefulPhraseIds: ["h107"],
    possibleComplications: [],
  };
  const partner = {
    displayName: "Mike",
    role: "Easygoing friend",
    personality: ["friendly", "casual"],
    conversationStyle: ["short questions"],
    waitingPhrases: ["Take your time."],
  };
  const prompt = promptModule.buildSceneRoleplayPrompt(
    situation,
    partner,
    [{ id: "h107", jp: "予約しています。", en: "I have a reservation.", tags: ["ホテル"] }],
    "The reservation takes a moment to find.",
  );
  assert.match(prompt, /acting as a hotel receptionist/);
  assert.match(prompt, /scene role wins/);
  assert.match(prompt, /Never tell the learner what exact sentence to say/);
  assert.match(prompt, /Accept any natural wording/);
  assert.match(prompt, /close the interaction naturally/);
  assert.match(prompt, /h107: I have a reservation/);
});
