import type { SceneSituation } from "../data/sceneRoleplays";

export type SceneRoleContract = Readonly<{
  userRole: string;
  partnerRole: string;
  sceneGoal: string;
  openingIntent: string;
  requiredInformation: readonly string[];
  completionCondition: string;
}>;

export function createSceneRoleContract(scene: SceneSituation): SceneRoleContract {
  return {
    userRole: scene.learnerRole,
    partnerRole: scene.partnerRole,
    sceneGoal: scene.goal,
    openingIntent: `Act as ${scene.partnerRole} immediately and give ${scene.learnerRole} one unmistakable practical cue to respond in role.`,
    requiredInformation: [scene.goal],
    completionCondition: scene.completionGuidance,
  };
}

export function detectsSceneRoleConflict(text: string): boolean {
  const normalized = text.normalize("NFKC").toLocaleLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
  return /\b(?:you(?:'re| are) the one|you (?:ask|tell|help) me|i(?:'m| am) not (?:the|a)|that(?:'s| is) your (?:role|job)|we have the roles? (?:wrong|backwards?|reversed)|switch (?:our )?roles?)\b/.test(normalized);
}

export function sceneRoleRepairPrompt(contract: SceneRoleContract): string {
  return `Let's reset the roles. You're ${contract.userRole}, and I'm ${contract.partnerRole}. I'll continue from my role.`;
}
