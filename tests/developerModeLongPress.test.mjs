import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [homeSource, styleSource] = await Promise.all([
  readFile(new URL("../src/ui/pages/HomePage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/styles/style.css", import.meta.url), "utf8"),
]);

test("developer mode changes only after a 900ms pointer hold", () => {
  assert.match(homeSource, /const debugHoldTimerRef = useRef<number \| null>\(null\)/);
  assert.match(homeSource, /onPointerDown=\{\(\) => \{[\s\S]*?window\.setTimeout\(\(\) => \{[\s\S]*?setDebugMode\(\(current\) => \{[\s\S]*?const next = !current;[\s\S]*?\}, 900\)/);
  assert.match(homeSource, /onPointerUp=\{\(\) => \{[\s\S]*?clearTimeout/);
  assert.match(homeSource, /onPointerCancel=\{\(\) => \{[\s\S]*?clearTimeout/);
  assert.match(homeSource, /onPointerLeave=\{\(\) => \{[\s\S]*?clearTimeout/);
});

test("ordinary clicks cannot toggle the controlled developer checkbox", () => {
  assert.match(homeSource, /onClick=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(homeSource, /checked=\{debugMode\}\s*readOnly\s*tabIndex=\{-1\}\s*style=\{\{ pointerEvents: "none" \}\}/);
  assert.doesNotMatch(homeSource, /checked=\{debugMode\}[\s\S]{0,120}onChange=/);
});

test("only the off state uses the muted developer setting appearance", () => {
  assert.match(homeSource, /developer-setting\$\{debugMode \? "" : " is-off"\}/);
  assert.match(styleSource, /\.developer-setting\.is-off \{[\s\S]*?color: #aaa;[\s\S]*?opacity: 0\.72/);
  assert.doesNotMatch(styleSource, /\.developer-setting \{[^}]*color:/);
});
