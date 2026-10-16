import type { SceneConversationTurn, SceneProgressProposal, SceneStatus } from "./conversationTypes";

export type SceneProgressState = Readonly<{
  currentPhase: string;
  confirmedInformation: readonly string[];
  uncertainInformation: readonly string[];
  requiredInformationRemaining: readonly string[];
  sceneStatus: SceneStatus;
  goalReached: boolean;
  closingResponseGenerated: boolean;
  closingTtsFinished: boolean;
  shouldCloseInteraction: boolean;
}>;

export function createSceneProgressState(): SceneProgressState {
  return { currentPhase: "opening", confirmedInformation: [], uncertainInformation: [], requiredInformationRemaining: [], sceneStatus: "IN_PROGRESS", goalReached: false, closingResponseGenerated: false, closingTtsFinished: false, shouldCloseInteraction: false };
}

export function applySceneProgression(before: SceneProgressState, turn: SceneConversationTurn, semanticConfidence: "high" | "medium" | "low") {
  const proposal: SceneProgressProposal | undefined = turn.progress;
  const reasons: string[] = [];
  if (!proposal) reasons.push("missing-progress-metadata");
  if (semanticConfidence !== "high") reasons.push("semantic-confidence-below-goal-threshold");
  if (proposal && proposal.newlyConfirmedInformation.length > 1) reasons.push("more-than-one-fact-confirmed-in-one-turn");
  if (proposal && proposal.requiredInformationRemaining.length > 0) reasons.push("required-information-remains");
  if (proposal && !proposal.completionReady) reasons.push("progress-not-ready");

  const accepted = semanticConfidence === "high" ? (proposal?.newlyConfirmedInformation ?? []).slice(0, 1) : [];
  const modelClaimsGoal = turn.goalReached || turn.sceneStatus !== "IN_PROGRESS" || turn.goalStatus === "COMPLETED";
  const goalAccepted = modelClaimsGoal && reasons.length === 0;
  const closingReply = goalAccepted && (turn.action === "QUESTION" || /[?？]\s*$/.test(turn.reply)) ? "Great, that's all set. Thank you." : turn.reply;
  if (goalAccepted && closingReply !== turn.reply) reasons.push("substantive-question-replaced-after-goal");

  const state: SceneProgressState = {
    currentPhase: proposal?.currentPhase || before.currentPhase,
    confirmedInformation: [...before.confirmedInformation, ...accepted.filter((item) => !before.confirmedInformation.includes(item))],
    uncertainInformation: semanticConfidence === "high" ? proposal?.uncertainInformation ?? before.uncertainInformation : [...before.uncertainInformation, ...(proposal?.newlyConfirmedInformation ?? [])],
    requiredInformationRemaining: semanticConfidence === "high" ? proposal?.requiredInformationRemaining ?? before.requiredInformationRemaining : before.requiredInformationRemaining,
    sceneStatus: goalAccepted ? "GOAL_REACHED" : "IN_PROGRESS",
    goalReached: goalAccepted,
    closingResponseGenerated: goalAccepted,
    closingTtsFinished: false,
    shouldCloseInteraction: false,
  };
  const gatedTurn: SceneConversationTurn = goalAccepted
    ? { ...turn, reply: closingReply, action: "WAIT", goalStatus: "IN_PROGRESS", sceneStatus: "GOAL_REACHED", goalReached: true, shouldCloseInteraction: false, responseType: "closing" }
    : { ...turn, goalStatus: "IN_PROGRESS", sceneStatus: "IN_PROGRESS", goalReached: false, shouldCloseInteraction: false, responseType: "progress" };
  return { state, turn: gatedTurn, goalAccepted, reasons };
}

export function beginSceneClosing(state: SceneProgressState): SceneProgressState {
  if (!state.goalReached || !state.closingResponseGenerated) return state;
  return { ...state, sceneStatus: "CLOSING", shouldCloseInteraction: false };
}

export function finishSceneClosing(state: SceneProgressState): SceneProgressState {
  if (state.sceneStatus !== "CLOSING" || !state.goalReached || !state.closingResponseGenerated) return state;
  return { ...state, sceneStatus: "COMPLETED", closingTtsFinished: true, shouldCloseInteraction: true };
}
