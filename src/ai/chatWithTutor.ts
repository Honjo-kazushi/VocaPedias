import type { TalkTopic } from "../data/talkTopics.seed";
import type { CharacterProfile, ConversationLanguage } from "../characters/characterProfiles";
import type { ChatMessage, LessonReview, SpokenReviewPart } from "./conversationTypes";
import { buildConversationPrompt, buildSceneRoleplayPrompt, formatConversation } from "./buildConversationPrompt";
import { buildJapaneseConversationReviewPrompt, buildReviewPrompt, type SceneReviewContext } from "./buildReviewPrompt";
import type { SceneSituation } from "../data/sceneRoleplays";
import { getSceneUsefulPhrases } from "../data/sceneRoleplays";
import { tossaPerf } from "../debug/tossaPerf";
import { detectDeviceGroup } from "../sound/selectCharacterVoice";

type AiRequestType = "opening" | "continuation" | "review" | "rescue";

export type AiRequestContext = {
  generation?: number;
  snapshotId?: number;
};

type AiRequestResult = {
  text: string;
  requestId: string;
  httpStatus: number;
  elapsedMs: number;
};

class AiRequestError extends Error {
  httpStatus: number | null;
  diagnosticName: string;

  constructor(message: string, httpStatus: number | null, cause?: unknown, diagnosticName = "Error") {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "AiRequestError";
    this.httpStatus = httpStatus;
    this.diagnosticName = diagnosticName;
  }
}

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function errorDetails(error: unknown): { errorName: string; errorMessage: string; httpStatus: number | null } {
  if (error instanceof Error) {
    return {
      errorName: error instanceof AiRequestError ? error.diagnosticName : error.name,
      errorMessage: error.message,
      httpStatus: error instanceof AiRequestError ? error.httpStatus : null,
    };
  }
  return { errorName: "UnknownError", errorMessage: String(error), httpStatus: null };
}

function logAiRequestError(
  error: unknown,
  requestType: AiRequestType,
  id: string,
  startedAt: number,
  context: AiRequestContext,
): void {
  tossaPerf("FLOW", "AI request", {
    event: "error",
    requestType,
    requestId: id,
    ...errorDetails(error),
    deviceGroup: detectDeviceGroup(),
    generation: context.generation ?? null,
    snapshotId: context.snapshotId ?? null,
    elapsedMs: Math.round(performance.now() - startedAt),
  });
}

async function generate(
  systemInstruction: string,
  prompt: string,
  requestType: AiRequestType,
  context: AiRequestContext = {},
): Promise<AiRequestResult> {
  const id = requestId();
  const startedAt = performance.now();
  try {
    const response = await fetch("/api/ai-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction, prompt }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      text?: string;
      error?: string;
    };
    if (!response.ok) throw new AiRequestError(body.error || "The AI request failed.", response.status);
    const text = body.text?.trim() ?? "";
    if (!text) throw new AiRequestError("The AI returned an empty response.", response.status);
    const elapsedMs = Math.round(performance.now() - startedAt);
    tossaPerf("FLOW", "AI request", {
      event: "success",
      requestType,
      requestId: id,
      httpStatus: response.status,
      elapsedMs,
    });
    return { text, requestId: id, httpStatus: response.status, elapsedMs };
  } catch (cause) {
    const error = cause instanceof AiRequestError
      ? cause
      : new AiRequestError(
          cause instanceof Error ? cause.message : String(cause),
          null,
          cause,
          cause instanceof Error ? cause.name : "UnknownError",
        );
    logAiRequestError(error, requestType, id, startedAt, context);
    throw error;
  }
}

export async function explainEnglishMessageInJapanese(message: string, partner: CharacterProfile, context?: AiRequestContext): Promise<string> {
  const result = await generate(
    `You are ${partner.displayName}, helping a Japanese beginner understand your immediately previous English message. Reply only in concise, friendly Japanese.`,
    `直前の英語発話を、日本語で短く分かりやすく説明してください。必要なら質問の意図を1文以内で補足してください。答えそのものを英語で教えすぎないでください。最後に、ユーザーが英語で答えるよう短く促してください。\n\n直前の英語発話:\n${message}`,
    "rescue",
    context,
  );
  return result.text;
}

export async function startTutorConversation(topic: TalkTopic, partner: CharacterProfile, openingAngle?: string | null, context?: AiRequestContext): Promise<string> {
  const result = await generate(
    buildConversationPrompt(topic, partner, openingAngle),
    partner.conversationLanguage === "ja"
      ? "自然な日本語だけで、キャラクターらしい短い反応から会話を始め、質問をちょうど1つしてください。参考質問を直訳せず、新しい自然な表現にしてください。Topic名を見出しとして繰り返さないでください。"
      : "Start with a short, natural opening in this character's style and ask exactly one small, concrete question that is easy to answer immediately. Create fresh wording rather than copying a reference question or relying on a routine compliment. Do not repeat the topic title as a heading.",
    "opening",
    context,
  );
  return result.text;
}

function asrContinuationGuidance(anchors: readonly string[]): string {
  return `Conversation anchors:
${anchors.map((anchor) => `- ${anchor}`).join("\n")}
- Immediately previous Partner question: use the last Partner message in the conversation history.

The Learner messages are SpeechRecognition transcripts and may contain misrecognized words.
Interpret the latest Learner transcript first as an answer to the immediately previous Partner question, using the anchors above.
Respect what the learner says, but do not change topics merely because one isolated word appears unrelated to the current context.
Follow a genuinely new topic only when the learner clearly and intentionally introduces it, rather than when a stray recognized word suggests it.
If the transcript strongly conflicts with the previous question and the anchors, infer the intended meaning only when the context makes it reasonably clear. Otherwise, ask one short clarification question, such as "Do you mean your dog?" Do not explain the recognition problem or invent a new topic from the suspicious word.`;
}

export async function continueTutorConversation(
  topic: TalkTopic,
  messages: ChatMessage[],
  partner: CharacterProfile,
  topicAngle?: string | null,
  context?: AiRequestContext,
): Promise<string> {
  const continuationAnchors = [
    `Today's Topic: ${topic.title}`,
    `Current Angle: ${topicAngle ?? "the current thread established by the conversation history"}`,
    ...(topic.source === "fresh" && topic.context ? [`Timely context: ${topic.context}`] : []),
  ];
  const result = await generate(
    buildConversationPrompt(topic, partner, null, true),
    partner.conversationLanguage === "ja"
      ? `自然な日本語だけで、ユーザーの最新の発言を優先して会話を続けてください。短い自然な反応と質問1つを基本にし、通常1〜2文にしてください。定型的な褒め言葉を毎回使わないでください。\n\n${formatConversation(messages)}`
      : `${asrContinuationGuidance(continuationAnchors)}

Continue naturally from the learner's latest message after interpreting it with the rules above. Use one brief reaction plus one small, concrete question that is easy to answer immediately, usually 1-2 sentences and about 25 words or fewer. Pick one contextually reliable detail from the learner's answer; avoid broad or multi-part questions. Do not default to generic praise.

${formatConversation(messages)}`,
    "continuation",
    context,
  );
  return result.text;
}

export async function startSceneRoleplay(
  situation: SceneSituation,
  partner: CharacterProfile,
  complication?: string | null,
  context?: AiRequestContext,
): Promise<string> {
  const result = await generate(
    buildSceneRoleplayPrompt(situation, partner, getSceneUsefulPhrases(situation), complication),
    "Begin the role-play in character with a natural, short opening. Set up the situation without naming a target phrase, giving a model answer, or telling the learner what to say. Ask at most one practical question.",
    "opening",
    context,
  );
  return result.text;
}

export async function continueSceneRoleplay(
  situation: SceneSituation,
  messages: ChatMessage[],
  partner: CharacterProfile,
  complication?: string | null,
  context?: AiRequestContext,
): Promise<string> {
  const continuationAnchors = [
    `Current Scene: ${situation.sceneTitle} — ${situation.title}`,
    `Scene Goal: ${situation.goal}`,
  ];
  const result = await generate(
    buildSceneRoleplayPrompt(situation, partner, getSceneUsefulPhrases(situation), complication, true),
    `${asrContinuationGuidance(continuationAnchors)}

Continue from the learner's latest message after interpreting it with the rules above. Use one brief reaction and one short practical question, usually 1-2 sentences and about 25 words or fewer. Accept any wording that communicates the meaning and do not default to generic praise. Do not leave the scene because of one isolated, unrelated word. Move naturally toward the goal; if it is complete, confirm it and close briefly.

${formatConversation(messages)}`,
    "continuation",
    context,
  );
  return result.text;
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
  context: AiRequestContext = {},
): Promise<LessonReview> {
  const result = await generate(
    language === "ja"
      ? "あなたはEmmaです。日本語の雑談を日本語で優しく短く振り返り、指定されたJSON形式を厳守してください。"
      : "You are a careful English conversation reviewer. Follow the requested format exactly.",
    language === "ja" && topic
      ? buildJapaneseConversationReviewPrompt(messages, topic)
      : buildReviewPrompt(messages, scene),
    "review",
    context,
  );
  try {
    return parseLessonReview(result.text);
  } catch (cause) {
    logAiRequestError(cause, "review", result.requestId, performance.now() - result.elapsedMs, context);
    throw cause;
  }
}
