import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const homeSource = await readFile(new URL("../src/ui/pages/HomePage.tsx", import.meta.url), "utf8");
const uiSource = await readFile(new URL("../src/components/AiConversationUI.tsx", import.meta.url), "utf8");
const textSource = await readFile(new URL("../src/ui/static/uiStatic.ts", import.meta.url), "utf8");
const avatarSource = await readFile(new URL("../src/components/CharacterAvatar.tsx", import.meta.url), "utf8");
const styleSource = await readFile(new URL("../src/styles/style.css", import.meta.url), "utf8");

test("conversation captions default to off and use the existing localStorage settings flow", () => {
  assert.match(homeSource, /readBool\("showConversationCaptions", false\)/);
  assert.match(homeSource, /localStorage\.setItem\("showConversationCaptions", JSON\.stringify\(showConversationCaptions\)\)/);
});

test("the settings group has the requested Japanese and English copy", () => {
  for (const text of [
    "AIアバターとの会話",
    "会話字幕を表示",
    "相手と自分の会話を文字で表示します。",
    "AI Avatar Conversation",
    "Show conversation captions",
    "Display your conversation with the AI as text.",
  ]) assert.match(textSource, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("caption visibility only gates rendered conversation text", () => {
  assert.match(uiSource, /showConversationCaptions && \(/);
  assert.match(uiSource, /if \(showConversationCaptions\) setInterimCaption\(utteranceBufferRef\.current\)/);
  assert.match(uiSource, /if \(showConversationCaptions\) \{\s*setInterimCaption\(mergeSpeechTranscript/);
  assert.doesNotMatch(uiSource, /showConversationCaptions[^\n]*(?:createUserTurnSnapshot|processUserTurn|continueTutorConversation|continueSceneRoleplay|setMessages)/);
});

test("review remains independent of the caption setting", () => {
  assert.match(uiSource, /\{review \? \(/);
  assert.doesNotMatch(uiSource, /showConversationCaptions[^\n]*review/);
});

test("settings use four localized groups with left-aligned controls and parenthesized descriptions", () => {
  for (const text of ["基本設定", "学習モード", "開発用", "Basic Settings", "Learning Mode", "Developer"]) {
    assert.match(textSource, new RegExp(text));
  }
  assert.match(homeSource, /className="settings-item"[\s\S]*?<input[\s\S]*?<span>\{UI\.showConversationCaptions\}/);
  assert.match(homeSource, /<small>（\{UI\.showConversationCaptionsDescription\}）<\/small>/);
  assert.match(styleSource, /\.settings-item\s*\{[\s\S]*font-weight: 400/);
});

test("Miyabi uses one shared avatar class and an Emma-intro-sized presentation", () => {
  assert.match(avatarSource, /avatar-\$\{character\.id\}/);
  assert.match(styleSource, /\.character-avatar-stack\.avatar-miyabi[\s\S]*width: 230px;[\s\S]*height: 230px;/);
  assert.match(styleSource, /\.character-avatar\.intro\s*\{[\s\S]*width: min\(210px, 72vw\)/);
  assert.match(styleSource, /\.character-stage\s*\{[\s\S]*border: 1px solid #ddd;[\s\S]*border-radius: 12px;/);
});

test("conversation is voice-only and caption-off leaves no fixed transcript panel", () => {
  assert.doesNotMatch(uiSource, /<textarea|>\s*Send\s*</);
  assert.doesNotMatch(uiSource, /submitUserMessage/);
  assert.match(uiSource, /\{showConversationCaptions && \(\s*<div className="ai-history"/);
  assert.match(styleSource, /\.ai-history\s*\{[\s\S]*max-height: min\(30vh, 220px\)/);
  assert.match(styleSource, /\.ai-history\s*\{[\s\S]*margin-top: 20px;/);
  assert.doesNotMatch(styleSource, /\.ai-history\s*\{[^}]*min-height/);
});
