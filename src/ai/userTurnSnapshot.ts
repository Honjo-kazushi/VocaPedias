import type { ConversationLanguage } from "../characters/characterProfiles";

export type UserTurnSnapshot = Readonly<{
  id: number;
  generation: number;
  text: string;
  language: ConversationLanguage;
  characterId: string;
  createdAt: number;
  recognitionConfidence: "high" | "medium" | "low";
  semanticConfidence: "high" | "medium" | "low";
  likelyIntent: string | null;
}>;

export type SnapshotTextSelectionReason = "extended-interim-after-final" | "stable-final" | "interim-fallback" | "empty";

export type SnapshotTextSelection = Readonly<{
  stableFinal: string;
  latestInterim: string;
  mergedCandidate: string;
  selectedSnapshot: string;
  snapshotSelectionReason: SnapshotTextSelectionReason;
}>;

function comparableTranscript(value: string): string {
  return value.normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[.,!?;:'"’。、！？・，．-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function selectUserTurnSnapshotText(stableFinal: string, latestInterim: string): SnapshotTextSelection {
  const finalText = stableFinal.trim();
  const interimText = latestInterim.trim();
  const finalComparable = comparableTranscript(finalText);
  const interimComparable = comparableTranscript(interimText);
  const continuationBoundary = interimComparable[finalComparable.length];
  const safelyExtendsFinal = Boolean(finalComparable)
    && interimComparable.length > finalComparable.length
    && interimComparable.startsWith(finalComparable)
    && (continuationBoundary === " " || (finalComparable.codePointAt(finalComparable.length - 1) ?? 0) > 0x7f);

  if (safelyExtendsFinal) {
    return Object.freeze({
      stableFinal: finalText,
      latestInterim: interimText,
      mergedCandidate: interimText,
      selectedSnapshot: interimText,
      snapshotSelectionReason: "extended-interim-after-final",
    });
  }
  if (finalText) {
    return Object.freeze({
      stableFinal: finalText,
      latestInterim: interimText,
      mergedCandidate: finalText,
      selectedSnapshot: finalText,
      snapshotSelectionReason: "stable-final",
    });
  }
  if (interimText) {
    return Object.freeze({
      stableFinal: finalText,
      latestInterim: interimText,
      mergedCandidate: interimText,
      selectedSnapshot: interimText,
      snapshotSelectionReason: "interim-fallback",
    });
  }
  return Object.freeze({
    stableFinal: "",
    latestInterim: "",
    mergedCandidate: "",
    selectedSnapshot: "",
    snapshotSelectionReason: "empty",
  });
}

type CreateUserTurnSnapshotInput = Omit<UserTurnSnapshot, "text" | "createdAt" | "recognitionConfidence" | "semanticConfidence" | "likelyIntent"> & {
  text: string;
  createdAt?: number;
  recognitionConfidence?: UserTurnSnapshot["recognitionConfidence"];
  semanticConfidence?: UserTurnSnapshot["semanticConfidence"];
  likelyIntent?: string | null;
};

export function createUserTurnSnapshot({
  id,
  generation,
  text,
  language,
  characterId,
  createdAt = Date.now(),
  recognitionConfidence = "high",
  semanticConfidence = "high",
  likelyIntent = null,
}: CreateUserTurnSnapshotInput): UserTurnSnapshot | null {
  const finalizedText = text.trim();
  if (!finalizedText) return null;

  return Object.freeze({
    id,
    generation,
    text: finalizedText,
    language,
    characterId,
    createdAt,
    recognitionConfidence,
    semanticConfidence,
    likelyIntent,
  });
}
