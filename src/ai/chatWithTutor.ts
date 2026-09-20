import type { TalkTopic } from "../data/talkTopics.seed";
import type { CharacterProfile, ConversationLanguage } from "../characters/characterProfiles";
import type { ChatMessage, LessonReview, SpokenReviewPart } from "./conversationTypes";
import { buildConversationPrompt, buildSceneRoleplayPrompt, formatConversation } from "./buildConversationPrompt";
import { buildJapaneseConversationReviewPrompt, buildReviewPrompt, type SceneReviewContext } from "./buildReviewPrompt";
import type { SceneSituation } from "../data/sceneRoleplays";
import { getSceneUsefulPhrases } from "../data/sceneRoleplays";

async function generate(systemInstruction: string, prompt: string): Promise<string> {
  const response = await fetch("/api/ai-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemInstruction, prompt }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    text?: string;
    error?: string;
  };
  if (!response.ok) throw new Error(body.error || "The AI request failed.");
  const text = body.text?.trim() ?? "";
  if (!text) throw new Error("The AI returned an empty response.");
  return text;
}

export function explainEnglishMessageInJapanese(message: string, partner: CharacterProfile): Promise<string> {
  return generate(
    `You are ${partner.displayName}, helping a Japanese beginner understand your immediately previous English message. Reply only in concise, friendly Japanese.`,
    `直前の英語発話を、日本語で短く分かりやすく説明してください。必要なら質問の意図を1文以内で補足してください。答えそのものを英語で教えすぎないでください。最後に、ユーザーが英語で答えるよう短く促してください。\n\n直前の英語発話:\n${message}`,
  );
}

export function startTutorConversation(topic: TalkTopic, partner: CharacterProfile, openingAngle?: string | null): Promise<string> {
  return generate(
    buildConversationPrompt(topic, partner, openingAngle),
    partner.conversationLanguage === "ja"
      ? "自然な日本語だけで、キャラクターらしい短い反応から会話を始め、質問をちょうど1つしてください。参考質問を直訳せず、新しい自然な表現にしてください。Topic名を見出しとして繰り返さないでください。"
      : "Start with a short, natural opening in this character's style and ask exactly one small, concrete question that is easy to answer immediately. Create fresh wording rather than copying a reference question or relying on a routine compliment. Do not repeat the topic title as a heading."
  );
}

export function continueTutorConversation(topic: TalkTopic, messages: ChatMessage[], partner: CharacterProfile): Promise<string> {
  return generate(
    buildConversationPrompt(topic, partner),
    partner.conversationLanguage === "ja"
      ? `自然な日本語だけで、ユーザーの最新の発言を優先して会話を続けてください。短い自然な反応と質問1つを基本にし、通常1〜2文にしてください。定型的な褒め言葉を毎回使わないでください。\n\n${formatConversation(messages)}`
      : `Continue naturally from the learner's latest message. Use one brief reaction plus one small, concrete question that is easy to answer immediately, usually 1-2 sentences and about 25 words or fewer. Pick one specific detail from the learner's answer; avoid broad or multi-part questions. Do not default to generic praise.\n\n${formatConversation(messages)}`
  );
}

export function startSceneRoleplay(
  situation: SceneSituation,
  partner: CharacterProfile,
  complication?: string | null,
): Promise<string> {
  return generate(
    buildSceneRoleplayPrompt(situation, partner, getSceneUsefulPhrases(situation), complication),
    "Begin the role-play in character with a natural, short opening. Set up the situation without naming a target phrase, giving a model answer, or telling the learner what to say. Ask at most one practical question.",
  );
}

export function continueSceneRoleplay(
  situation: SceneSituation,
  messages: ChatMessage[],
  partner: CharacterProfile,
  complication?: string | null,
): Promise<string> {
  return generate(
    buildSceneRoleplayPrompt(situation, partner, getSceneUsefulPhrases(situation), complication),
    `Continue from the learner's latest message with one brief reaction and one short practical question, usually 1-2 sentences and about 25 words or fewer. Accept any wording that communicates the meaning and do not default to generic praise. Move naturally toward the goal; if it is complete, confirm it and close briefly.\n\n${formatConversation(messages)}`,
  );
}

function parseLessonReview(text: string): LessonReview {
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(unfenced) as { sections?: unknown; spokenReview?: unknown };
  if (!parsed.sections || typeof parsed.sections !== "object") {
    throw new Error("The AI returned invalid review sections.");
  }
  const rawSections = parsed.sections as Record<string, unknown>;
  const parseSection = (key: string): string[] => {
    const value = rawSections[key];
    if (!Array.isArray(value)) throw new Error(`The AI returned an invalid ${key} section.`);
    return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      .map((item) => item.trim());
  };
  const sections = {
    goodPoints: parseSection("goodPoints"),
    corrections: parseSection("corrections"),
    alternatives: parseSection("alternatives"),
    todayPoints: parseSection("todayPoints"),
  };
  if (!Array.isArray(parsed.spokenReview)) {
    throw new Error("The AI returned an invalid spoken review.");
  }
  const spokenReview = parsed.spokenReview.filter((part): part is SpokenReviewPart => {
    if (!part || typeof part !== "object") return false;
    const candidate = part as { lang?: unknown; text?: unknown };
    return (candidate.lang === "ja-JP" || candidate.lang === "en-US") &&
      typeof candidate.text === "string" && Boolean(candidate.text.trim());
  });
  if (!spokenReview.length) throw new Error("The AI returned an empty spoken review.");
  return { sections, spokenReview };
}

export async function reviewTutorConversation(
  messages: ChatMessage[],
  language: ConversationLanguage = "en",
  topic?: TalkTopic,
  scene?: SceneReviewContext,
): Promise<LessonReview> {
  const text = await generate(
    language === "ja"
      ? "あなたはEmmaです。日本語の雑談を日本語で優しく短く振り返り、指定されたJSON形式を厳守してください。"
      : "You are a careful English conversation reviewer. Follow the requested format exactly.",
    language === "ja" && topic
      ? buildJapaneseConversationReviewPrompt(messages, topic)
      : buildReviewPrompt(messages, scene)
  );
  return parseLessonReview(text);
}
