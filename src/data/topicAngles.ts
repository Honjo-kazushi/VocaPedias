import type { TalkTopic } from "./talkTopics.seed";

const lastAngleByTopicId = new Map<string, string>();

export function chooseTopicAngle(topic: TalkTopic, random: () => number = Math.random): string | null {
  const angles = topic.angles ?? [];
  if (angles.length === 0) return null;

  const previous = lastAngleByTopicId.get(topic.id);
  const choices = angles.length > 1 ? angles.filter((angle) => angle !== previous) : angles;
  const index = Math.min(choices.length - 1, Math.floor(Math.max(0, random()) * choices.length));
  const selected = choices[index];
  lastAngleByTopicId.set(topic.id, selected);
  return selected;
}
