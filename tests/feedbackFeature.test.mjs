import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [appSource, homeSource, styleSource, repositorySource, logSource, rulesSnippet, completeRules] = await Promise.all([
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/pages/HomePage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/styles/style.css", import.meta.url), "utf8"),
  readFile(new URL("../src/feedback/feedbackRepository.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/feedback/FeedbackLogPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../firestore.feedback.rules.snippet", import.meta.url), "utf8"),
  readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
]);

test("startup menu includes feedback without changing MainMode", () => {
  assert.match(appSource, /ご意見・ご感想/);
  assert.match(appSource, /<FeedbackPage onBack=/);
});

test("feedback uses server time and automatic Firestore document IDs", () => {
  assert.match(repositorySource, /addDoc\(collection\(db, "feedback"\)/);
  assert.match(repositorySource, /createdAt: serverTimestamp\(\)/);
});

test("developer feedback log requires a five second pointer hold", () => {
  assert.match(homeSource, /feedbackLogHoldTimerRef/);
  assert.match(homeSource, /onPointerDown=\{\(event\) => \{\s*event\.preventDefault\(\);[\s\S]*?feedbackLogHoldTimerRef/);
  assert.match(homeSource, /window\.setTimeout\(\(\) => \{[\s\S]*?setShowFeedbackLog\(true\);[\s\S]*?\}, 5000\)/);
  assert.match(homeSource, /onPointerUp=\{\(\) => \{[\s\S]*?feedbackLogHoldTimerRef/);
  assert.match(homeSource, /onPointerCancel=\{\(\) => \{[\s\S]*?feedbackLogHoldTimerRef/);
  assert.match(homeSource, /onPointerLeave=\{\(\) => \{[\s\S]*?feedbackLogHoldTimerRef/);
  assert.match(homeSource, /onContextMenu=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(styleSource, /\.feedback-log-trigger \{[\s\S]*?user-select: none;[\s\S]*?-webkit-touch-callout: none;[\s\S]*?touch-action: none;/);
});

test("admin login is kept in local browser persistence", () => {
  assert.match(logSource, /setPersistence\(auth, browserLocalPersistence\)/);
  assert.match(logSource, /onAuthStateChanged\(auth/);
});

test("feedback rules snippet separates public create from allowlisted reads", () => {
  assert.match(rulesSnippet, /exists\(\/databases\/\$\(database\)\/documents\/feedbackAdmins\/\$\(request\.auth\.uid\)\)/);
  assert.match(rulesSnippet, /allow create:/);
  assert.match(rulesSnippet, /request\.resource\.data\.createdAt == request\.time/);
  assert.match(rulesSnippet, /allow read: if isFeedbackAdmin\(\)/);
  assert.match(rulesSnippet, /allow update, delete: if false/);
});

test("complete rules preserve only the validated access counter operations", () => {
  assert.match(completeRules, /match \/counters\/vocapedias/);
  assert.match(completeRules, /allow read: if true/);
  assert.match(completeRules, /request\.resource\.data\.count == 1/);
  assert.match(completeRules, /request\.resource\.data\.count == resource\.data\.count \+ 1/);
  assert.match(completeRules, /match \/\{document=\*\*\} \{[\s\S]*?allow read, write: if false/);
  assert.doesNotMatch(completeRules, /allow read, write: if true/);
});
