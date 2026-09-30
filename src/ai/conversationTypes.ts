export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ConversationAction = "QUESTION" | "REACTION" | "SELF_DISCLOSURE" | "WAIT" | "CLOSE";

export type ConversationTurn = {
  reply: string;
  action: ConversationAction;
};

export type SceneGoalStatus = "IN_PROGRESS" | "COMPLETED";

export type SceneConversationTurn = ConversationTurn & {
  goalStatus: SceneGoalStatus;
};

const CONVERSATION_ACTIONS = new Set<ConversationAction>([
  "QUESTION",
  "REACTION",
  "SELF_DISCLOSURE",
  "WAIT",
  "CLOSE",
]);

export function parseConversationTurn(text: string): ConversationTurn {
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(unfenced) as { reply?: unknown; action?: unknown };
  const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
  if (!reply || typeof parsed.action !== "string" || !CONVERSATION_ACTIONS.has(parsed.action as ConversationAction)) {
    throw new Error("The AI returned an invalid conversation turn.");
  }
  return { reply, action: parsed.action as ConversationAction };
}

export function parseSceneConversationTurn(text: string): SceneConversationTurn {
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(unfenced) as { reply?: unknown; action?: unknown; goalStatus?: unknown };
  const turn = parseConversationTurn(JSON.stringify({ reply: parsed.reply, action: parsed.action }));
  if (parsed.goalStatus !== "IN_PROGRESS" && parsed.goalStatus !== "COMPLETED") {
    throw new Error("The AI returned an invalid scene goal status.");
  }
  if (parsed.goalStatus === "COMPLETED" && turn.action !== "CLOSE") {
    throw new Error("A completed scene must close the interaction.");
  }
  return { ...turn, goalStatus: parsed.goalStatus };
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
    if (left.slice(-length).toLocaleLowerCase() === right.slice(0, length).toLocaleLowerCase()) {
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
