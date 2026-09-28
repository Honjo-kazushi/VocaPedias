import type { TalkTopic } from "./talkTopics.seed";
import type { CharacterId } from "../characters/characterProfiles";
import {
  getRecentTopicHistory,
  readConversationTopicHistory,
  type ConversationTopicHistory,
} from "./conversationTopicHistory";

export type TopicAngleSelection = {
  angle: string | null;
  avoidedAngles: string[];
};

export function chooseTopicAngle(
  topic: TalkTopic,
  characterId?: CharacterId,
  history: readonly ConversationTopicHistory[] = readConversationTopicHistory(),
  random: () => number = Math.random,
): TopicAngleSelection {
  const angles = topic.angles ?? [];
  if (angles.length === 0) return { angle: null, avoidedAngles: [] };

  const recent = getRecentTopicHistory(topic, history);
  const sameCharacterAngles = new Set(
    characterId ? recent.filter((entry) => entry.characterId === characterId).map((entry) => entry.angle).filter(Boolean) : [],
  );
  const allRecentAngles = new Set(recent.map((entry) => entry.angle).filter(Boolean));
  const avoidAll = angles.filter((angle) => !sameCharacterAngles.has(angle) && !allRecentAngles.has(angle));
  const avoidSameCharacter = angles.filter((angle) => !sameCharacterAngles.has(angle));
  const choices = avoidAll.length > 0 ? avoidAll : avoidSameCharacter.length > 0 ? avoidSameCharacter : angles;
  const index = Math.min(choices.length - 1, Math.floor(Math.max(0, random()) * choices.length));
  const selected = choices[index];
  return {
    angle: selected,
    avoidedAngles: angles.filter((angle) => !choices.includes(angle)),
  };
}
