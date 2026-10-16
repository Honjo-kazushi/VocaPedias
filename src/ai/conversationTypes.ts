export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  semanticConfidence?: "high" | "medium" | "low";
  likelyIntent?: string | null;
};

export type ConversationAction = "QUESTION" | "REACTION" | "SELF_DISCLOSURE" | "WAIT" | "CHANGE_TOPIC" | "CLOSE";

export type ConversationTurn = {
  reply: string;
  action: ConversationAction;
};

export type SceneGoalStatus = "IN_PROGRESS" | "COMPLETED";
export type SceneStatus = "IN_PROGRESS" | "GOAL_REACHED" | "CLOSING" | "COMPLETED";
export type SceneResponseType = "progress" | "closing" | "closed";

export type SceneProgressProposal = {
  currentPhase: string;
  newlyConfirmedInformation: string[];
  uncertainInformation: string[];
  requiredInformationRemaining: string[];
  completionReady: boolean;
};

export type SceneConversationTurn = ConversationTurn & {
  goalStatus: SceneGoalStatus;
  completionReason: string;
  progress?: SceneProgressProposal;
  sceneStatus: SceneStatus;
  goalReached: boolean;
  shouldCloseInteraction: boolean;
  responseType: SceneResponseType;
};

const CONVERSATION_ACTIONS = new Set<ConversationAction>([
  "QUESTION",
  "REACTION",
  "SELF_DISCLOSURE",
  "WAIT",
  "CHANGE_TOPIC",
  "CLOSE",
]);

export function parseConversationTurn(text: string, allowChangeTopic = true): ConversationTurn {
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(unfenced) as { reply?: unknown; action?: unknown };
  const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
  if (!reply || typeof parsed.action !== "string" || !CONVERSATION_ACTIONS.has(parsed.action as ConversationAction)) {
    throw new Error("The AI returned an invalid conversation turn.");
  }
  if (!allowChangeTopic && parsed.action === "CHANGE_TOPIC") {
    throw new Error("CHANGE_TOPIC is only valid in Topic Conversation.");
  }
  return { reply, action: parsed.action as ConversationAction };
}

export function parseSceneConversationTurn(text: string): SceneConversationTurn {
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(unfenced) as { reply?: unknown; action?: unknown; goalStatus?: unknown; completionReason?: unknown; progress?: unknown; sceneStatus?: unknown; goalReached?: unknown; shouldCloseInteraction?: unknown; responseType?: unknown };
  const turn = parseConversationTurn(JSON.stringify({ reply: parsed.reply, action: parsed.action }), false);
  const legacyGoalStatus: SceneGoalStatus = parsed.goalStatus === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS";
  const sceneStatus: SceneStatus = parsed.sceneStatus === "IN_PROGRESS" || parsed.sceneStatus === "GOAL_REACHED" || parsed.sceneStatus === "CLOSING" || parsed.sceneStatus === "COMPLETED"
    ? parsed.sceneStatus : legacyGoalStatus === "COMPLETED" ? "GOAL_REACHED" : "IN_PROGRESS";
  const goalReached = typeof parsed.goalReached === "boolean" ? parsed.goalReached : sceneStatus !== "IN_PROGRESS";
  const shouldCloseInteraction = typeof parsed.shouldCloseInteraction === "boolean" ? parsed.shouldCloseInteraction : sceneStatus === "COMPLETED";
  const responseType: SceneResponseType = parsed.responseType === "closing" || parsed.responseType === "closed" || parsed.responseType === "progress"
    ? parsed.responseType : goalReached ? "closing" : "progress";
  const completionReason = typeof parsed.completionReason === "string" ? parsed.completionReason.trim() : "";
  if (!completionReason) throw new Error("The AI returned no scene completion reason.");
  let progress: SceneProgressProposal | undefined;
  if (parsed.progress && typeof parsed.progress === "object") {
    const value = parsed.progress as Partial<SceneProgressProposal>;
    if (typeof value.currentPhase !== "string" || !Array.isArray(value.newlyConfirmedInformation) || !Array.isArray(value.uncertainInformation)
      || !Array.isArray(value.requiredInformationRemaining) || typeof value.completionReady !== "boolean"
      || ![...value.newlyConfirmedInformation, ...value.uncertainInformation, ...value.requiredInformationRemaining].every((item) => typeof item === "string")) {
      throw new Error("The AI returned invalid scene progress metadata.");
    }
    progress = {
      currentPhase: value.currentPhase.trim(),
      newlyConfirmedInformation: value.newlyConfirmedInformation,
      uncertainInformation: value.uncertainInformation,
      requiredInformationRemaining: value.requiredInformationRemaining,
      completionReady: value.completionReady,
    };
  }
  return { ...turn, goalStatus: legacyGoalStatus, completionReason, sceneStatus, goalReached, shouldCloseInteraction, responseType, ...(progress ? { progress } : {}) };
}

export function detectsTopicChangeIntent(transcript: string): boolean {
  const normalized = transcript.normalize("NFKC").toLocaleLowerCase().replace(/[’]/g, "'");
  return /\b(?:change|switch)\s+(?:the\s+)?(?:topic|topics|subject)\b/.test(normalized)
    || /\bnext\s+(?:topic|subject)\b/.test(normalized)
    || /\b(?:talk|speak|chat)\s+about\s+something\s+(?:else|different)\b/.test(normalized)
    || /\bsomething\s+(?:else|different)\b/.test(normalized)
    || /\b(?:don't|do not)\s+want\s+to\s+talk\s+about\s+(?:this|that)(?:\s+(?:topic|subject))?\b/.test(normalized);
}

export function hasUserResponse(messages: readonly ChatMessage[]): boolean {
  return messages.some((message) => message.role === "user" && Boolean(message.content.trim()));
}

export function mergeSpeechTranscript(current: string, next: string, language: "en" | "ja"): string {
  const left = current.trim();
  const right = next.trim();
  if (!left) return right;
  if (!right || left === right || left.endsWith(right)) return left;
  if (right.startsWith(left)) return right;

  if (language === "ja") {
    const comparable = (value: string) => value
      .normalize("NFKC")
      .replace(/[\s。、！？!?・，．]/g, "")
      .toLocaleLowerCase();
    const leftComparable = comparable(left);
    const rightComparable = comparable(right);
    if (leftComparable === rightComparable || leftComparable.endsWith(rightComparable)) return left;
    if (rightComparable.startsWith(leftComparable)) return right;
  }

  const separator = language === "ja" ? "" : " ";
  const maxOverlap = Math.min(left.length, right.length);
  for (let length = maxOverlap; length > 0; length -= 1) {
    const overlapMatches = left.slice(-length).toLocaleLowerCase() === right.slice(0, length).toLocaleLowerCase();
    const englishWordBoundary = language !== "en"
      || ((length === left.length || /[\s.,!?;:'"()-]/.test(left[left.length - length - 1]))
        && (length === right.length || /[\s.,!?;:'"()-]/.test(right[length])));
    if (overlapMatches && englishWordBoundary) {
      return `${left}${right.slice(length)}`.replace(/\s+/g, " ").trim();
    }
  }
  return `${left}${separator}${right}`.replace(/\s+/g, " ").trim();
}

export function mergeRecognitionResults(transcripts: readonly string[], language: "en" | "ja"): string {
  return transcripts.reduce(
    (current, transcript) => mergeSpeechTranscript(current, transcript, language),
    "",
  );
}

export type SpokenReviewPart = {
  lang: "ja-JP" | "en-US";
  text: string;
};

export type LessonReview = {
  sections: {
    goodPoints: string[];
    corrections: string[];
    alternatives: string[];
    todayPoints: string[];
  };
  spokenReview: SpokenReviewPart[];
};
