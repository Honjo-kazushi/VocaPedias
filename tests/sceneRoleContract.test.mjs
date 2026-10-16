import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

let source = await readFile(new URL("../src/ai/sceneRoleContract.ts", import.meta.url), "utf8");
source = source.replace(/^import type .*$/gm, "");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { createSceneRoleContract, detectsSceneRoleConflict, sceneRoleRepairPrompt } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const scene = { learnerRole: "a local person giving directions", partnerRole: "a traveler looking for a place", goal: "Give clear directions.", completionGuidance: "Continue until the traveler can proceed." };

test("a reusable role contract captures both roles and the completion boundary", () => {
  const contract = createSceneRoleContract(scene);
  assert.equal(contract.userRole, scene.learnerRole);
  assert.equal(contract.partnerRole, scene.partnerRole);
  assert.match(contract.openingIntent, /Act as/);
  assert.equal(contract.completionCondition, scene.completionGuidance);
});

test("role objections repair the contract without completing scene progression", () => {
  const contract = createSceneRoleContract(scene);
  for (const text of ["No, you're the one asking me.", "You ask me.", "We have the roles reversed."]) {
    assert.equal(detectsSceneRoleConflict(text), true, text);
  }
  assert.match(sceneRoleRepairPrompt(contract), /You're a local person giving directions/);
});

test("ordinary role-play answers are not role conflicts", () => {
  assert.equal(detectsSceneRoleConflict("Turn left at the bank."), false);
});
