import type { ConversationLanguage } from "../characters/characterProfiles";

export type UserTurnSnapshot = Readonly<{
  id: number;
  generation: number;
  text: string;
  language: ConversationLanguage;
  characterId: string;
  createdAt: number;
}>;

type CreateUserTurnSnapshotInput = Omit<UserTurnSnapshot, "text" | "createdAt"> & {
  text: string;
  createdAt?: number;
};

export function createUserTurnSnapshot({
  id,
  generation,
  text,
  language,
  characterId,
  createdAt = Date.now(),
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
  });
}
