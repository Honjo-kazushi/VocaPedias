import type { CharacterExpression } from "../data/characters";
import type { CharacterProfile } from "./characterProfiles";

type ExpressionContext = {
  assistantText: string;
  userText?: string;
  isOpening?: boolean;
  profile: CharacterProfile;
};

const hasAny = (text: string, patterns: readonly RegExp[]) => patterns.some((pattern) => pattern.test(text));

const SURPRISE_CUES = [
  /\b(no way|really[!?]|wow|whoa|unbelievable|unexpected|surpris(?:e|ed|ing)|never before|first time)\b/i,
  /[!?]{2,}/,
];
const THINKING_CUES = [
  /\b(let me think|hmm+|that's a difficult question|good question|I wonder)\b/i,
  /(?:ちょっと考え|うーん|難しい質問|どうだろう)/,
];
const WARM_CUES = [
  /\b(I'm glad|sounds fun|sounds lovely|me too|I like|nice to hear|welcome|thank you)\b/i,
  /(?:うれしい|楽しそう|私も|いいですね|ありがとう|ようこそ)/,
];

export function selectConversationExpression({ assistantText, userText = "", isOpening = false, profile }: ExpressionContext): CharacterExpression {
  const combined = `${userText}\n${assistantText}`;
  if (profile.expressionBias.thinking >= 0.65 && hasAny(assistantText, THINKING_CUES)) return "thinking";
  if (profile.expressionBias.surprised >= 0.45 && hasAny(combined, SURPRISE_CUES)) return "surprised";
  if (profile.expressionBias.smile >= 0.45 && (isOpening || hasAny(assistantText, WARM_CUES))) return "smile";
  return "neutral";
}
