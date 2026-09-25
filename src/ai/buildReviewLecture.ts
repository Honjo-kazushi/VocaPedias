import type { CharacterExpression } from "../data/characters";
import type { SpeechLocale } from "../sound/speakEn.ts";
import type { SpokenReviewPart } from "./conversationTypes";

export type ReviewSpeechItem = {
  lang: SpeechLocale;
  text: string;
  expression: CharacterExpression;
};

export function buildSpokenReviewLecture(parts: SpokenReviewPart[]): ReviewSpeechItem[] {
  return parts.map((part) => ({
    ...part,
    // Review speech keeps one aligned pose so only the mouth appears to move.
    expression: "neutral",
  }));
}
