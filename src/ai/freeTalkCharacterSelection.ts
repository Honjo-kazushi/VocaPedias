import type { CharacterId } from "../characters/characterProfiles";

export const FREE_TALK_CHARACTER_IDS: readonly CharacterId[] = Object.freeze([
  "emma",
  "mike",
  "sophie",
  "jamie",
  "lily",
  "grandma_rose",
  "dr_dan",
  "leo",
  "miyabi",
]);

export const FREE_TALK_LAST_CHARACTER_KEY = "tossa.freeTalk.lastCharacter";

export type FreeTalkCharacterSelection = {
  selectedCharacter: CharacterId;
  candidates: readonly CharacterId[];
  previousCharacter: CharacterId | null;
  excludedCharacter: CharacterId | null;
};

export function isFreeTalkCharacterId(value: unknown): value is CharacterId {
  return typeof value === "string" && FREE_TALK_CHARACTER_IDS.includes(value as CharacterId);
}

export function chooseFreeTalkCharacter(
  previousCharacter: CharacterId | null,
  random: () => number = Math.random,
): FreeTalkCharacterSelection {
  const excludedCharacter = previousCharacter && FREE_TALK_CHARACTER_IDS.includes(previousCharacter)
    ? previousCharacter
    : null;
  const candidates = excludedCharacter
    ? FREE_TALK_CHARACTER_IDS.filter((id) => id !== excludedCharacter)
    : [...FREE_TALK_CHARACTER_IDS];
  const randomValue = Math.min(Math.max(random(), 0), 1 - Number.EPSILON);
  const selectedCharacter = candidates[Math.floor(randomValue * candidates.length)];
  return { selectedCharacter, candidates, previousCharacter: excludedCharacter, excludedCharacter };
}

export function loadLastFreeTalkCharacter(): CharacterId | null {
  try {
    const stored = window.localStorage.getItem(FREE_TALK_LAST_CHARACTER_KEY);
    return isFreeTalkCharacterId(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function saveLastFreeTalkCharacter(characterId: CharacterId): void {
  try {
    window.localStorage.setItem(FREE_TALK_LAST_CHARACTER_KEY, characterId);
  } catch {
    // A blocked localStorage must not prevent Free Talk from starting.
  }
}
