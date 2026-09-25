export type ConversationCancelTrigger =
  | "user"
  | "selection-inactivity"
  | "conversation-inactivity"
  | "review-inactivity";

export type ConversationCancelState = {
  lessonStage: "sceneSelect" | "partnerSelect" | "conversation";
  phase: "idle" | "thinking" | "ttsPending" | "speaking" | "recognizing";
  partnerSelectionReady: boolean;
  reviewActive: boolean;
};

export function shouldCancelConversation(
  trigger: ConversationCancelTrigger,
  state: ConversationCancelState,
): boolean {
  if (trigger === "user") return true;
  if (state.phase === "ttsPending" || state.phase === "speaking") return false;
  if (trigger === "selection-inactivity") {
    return state.lessonStage === "sceneSelect" ||
      (state.lessonStage === "partnerSelect" && state.partnerSelectionReady);
  }
  if (trigger === "review-inactivity") return state.reviewActive;
  return state.lessonStage === "conversation" && !state.reviewActive;
}
