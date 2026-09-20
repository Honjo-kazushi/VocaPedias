export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

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
