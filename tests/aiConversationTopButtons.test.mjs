import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const uiSource = fs.readFileSync(new URL("../src/components/AiConversationUI.tsx", import.meta.url), "utf8");
const styleSource = fs.readFileSync(new URL("../src/styles/style.css", import.meta.url), "utf8");

test("AI conversation top uses three Japanese mode labels in the requested order", () => {
  const choices = uiSource.slice(uiSource.indexOf('<div className="ai-lesson-choices">'), uiSource.indexOf("</div>", uiSource.indexOf('<div className="ai-lesson-choices">')));
  assert.ok(choices.indexOf("トピック会話") < choices.indexOf("場面英会話"));
  assert.ok(choices.indexOf("場面英会話") < choices.indexOf("フリートーク"));
  assert.doesNotMatch(choices, /Talk Topic|Scene Role-play|Free Talk/);
  assert.match(choices, /beginLesson\(chooseTopic\(freshTopics\)\)/);
  assert.match(choices, /beginSceneSelection/);
  assert.match(choices, /beginFreeTalk/);
});

test("AI conversation top mode buttons use one equal-width column on every viewport", () => {
  assert.match(styleSource, /\.ai-lesson-choices\s*\{[^}]*display: grid;[^}]*grid-template-columns: 1fr;[^}]*gap: 8px;/s);
  assert.doesNotMatch(styleSource, /@media[^}]*\.ai-lesson-choices/s);
});

test("Emma guide keeps the first meaningful line together on narrow screens", () => {
  assert.match(uiSource, /<span className="ai-intro-guide-line">トピック会話・場面英会話・フリートークから<\/span><br \/>選んで始めましょう。/);
  assert.match(styleSource, /\.ai-intro-guide-line\s*\{[^}]*display: inline-block;[^}]*font-size: clamp\(12\.5px, 3\.9vw, 14px\);[^}]*white-space: nowrap;/s);
});
