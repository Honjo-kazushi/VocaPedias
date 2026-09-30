import type { TalkTopic } from "../data/talkTopics.seed";
import type { CharacterProfile, ConversationLanguage } from "../characters/characterProfiles";
import { parseConversationTurn, parseSceneConversationTurn, type ChatMessage, type ConversationTurn, type LessonReview, type SceneConversationTurn, type SpokenReviewPart } from "./conversationTypes";
import { buildConversationPrompt, buildSceneRoleplayPrompt, formatConversation } from "./buildConversationPrompt";
import { buildJapaneseConversationReviewPrompt, buildReviewPrompt, type SceneReviewContext } from "./buildReviewPrompt";
import type { SceneSituation } from "../data/sceneRoleplays";
import { getSceneUsefulPhrases } from "../data/sceneRoleplays";
import { tossaPerf } from "../debug/tossaPerf";
import { detectDeviceGroup } from "../sound/selectCharacterVoice";
import type { OpeningVariationContext } from "../data/conversationTopicHistory";
import {
  applyMemoryCandidates,
  getPromptMemories,
  loadConversationMemories,
  parseMemoryCandidates,
  saveConversationMemories,
  type ConversationMemory,
} from "../memory/conversationMemory";

type AiRequestType = "opening" | "continuation" | "review" | "rescue" | "memory";

export type AiRequestContext = {
  generation?: number;
  snapshotId?: number;
};

export type FreeTalkSetup = {
  relationship: string;
  situation: string;
  mood: string;
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

export async function startTutorConversation(
  topic: TalkTopic,
  partner: CharacterProfile,
  openingAngle?: string | null,
  context?: AiRequestContext,
  variation?: OpeningVariationContext,
): Promise<string> {
  const result = await generate(
    buildConversationPrompt(topic, partner, openingAngle, false, variation),
    partner.conversationLanguage === "ja"
      ? `自然な日本語だけで、キャラクターらしい短い反応から会話を始め、質問をちょうど1つしてください。参考質問を直訳せず、新しい自然な表現にしてください。Topic名を見出しとして繰り返さないでください。\n\n${memoryGuidance()}`
      : `Start with a short, natural opening in this character's style and ask exactly one small, concrete question that is easy to answer immediately. Create fresh wording rather than copying a reference question or relying on a routine compliment. Do not repeat the topic title as a heading.\n\n${memoryGuidance()}`,
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

function memoryGuidance(memories: readonly ConversationMemory[] = getPromptMemories()): string {
  tossaPerf("MEMORY", "memory load", { count: memories.length, usedForPrompt: Math.min(memories.length, 5) });
  if (!memories.length) return "No saved conversation memory is available.";
  return `Optional conversation memory (user-explicit facts only):\n${memories.map((memory) => `- ${memory.text}`).join("\n")}\nUse a relevant item only when it fits naturally. Do not mention memory, stored data, or remembering. Do not force these facts into the conversation and do not use more than one item in a turn.`;
}

export async function extractAndSaveConversationMemory(messages: ChatMessage[], context?: AiRequestContext): Promise<void> {
  const userUtterances = messages.filter((message) => message.role === "user").map((message) => message.content.trim()).filter(Boolean);
  if (!userUtterances.length) {
    tossaPerf("MEMORY", "memory ignored", { reason: "no user statements" });
    return;
  }
  tossaPerf("MEMORY", "memory extraction start", { userTurnCount: userUtterances.length });
  try {
    const existing = loadConversationMemories();
    const result = await generate(
      `Extract only safe, lightweight conversation memory explicitly stated by the user. Never infer, strengthen, diagnose, or use assistant statements. Exclude addresses, contact details, credentials, identifiers, financial, workplace-detail, medical, health, political, religious, voting, sexual, and other sensitive information. Keep only durable preferences, hobbies, ordinary habits, pets, travel wishes, light recent events, and language-learning preferences. Each candidate must quote an exact contiguous user statement as evidence. Use the same stable key for later corrections. A correction should upsert the corrected fact under the old key, or remove it only when no corrected fact should remain. Return [] when nothing is clearly useful. Return JSON only.`,
      `Existing memory keys (for merging/corrections):\n${existing.map((memory) => `- ${memory.key}: ${memory.text}`).join("\n") || "(none)"}\n\nUser statements only:\n${userUtterances.map((text, index) => `${index + 1}. ${text}`).join("\n")}\n\nReturn an array with this shape:\n[{"action":"upsert|remove","key":"stable topic key","text":"short third-person fact for upsert","category":"optional category","evidence":"exact user statement"}]`,
      "memory",
      context,
    );
    const candidates = parseMemoryCandidates(result.text);
    tossaPerf("MEMORY", "memory extraction result", { candidateCount: candidates.length, malformedOrEmpty: candidates.length === 0 });
    const applied = applyMemoryCandidates(existing, candidates, userUtterances);
    saveConversationMemories(applied.memories);
    if (applied.added) tossaPerf("MEMORY", "memory added", { count: applied.added });
    if (applied.updated || applied.removed) tossaPerf("MEMORY", "memory updated", { updated: applied.updated, removed: applied.removed });
    for (const ignored of applied.ignored) tossaPerf("MEMORY", "memory ignored", { reason: ignored.reason });
  } catch (error) {
    tossaPerf("MEMORY", "memory ignored", { reason: error instanceof Error ? error.name : "extraction error" });
  }
}

export async function continueTutorConversation(
  topic: TalkTopic,
  messages: ChatMessage[],
  partner: CharacterProfile,
  topicAngle?: string | null,
  context?: AiRequestContext,
): Promise<ConversationTurn> {
  const continuationAnchors = [
    `Today's Topic: ${topic.title}`,
    `Current Angle: ${topicAngle ?? "the current thread established by the conversation history"}`,
    ...(topic.source === "fresh" && topic.context ? [`Timely context: ${topic.context}`] : []),
  ];
  const result = await generate(
    buildConversationPrompt(topic, partner, null, true),
    partner.conversationLanguage === "ja"
      ? `自然な日本語だけで、ユーザーの最新の発言を優先して会話を続けてください。毎回質問せず、短い反応、共感、自己開示、質問、待機、自然終了から最も自然なものを選んでください。明確な終了意思には質問せず別れの挨拶を返してください。定型的な褒め言葉を毎回使わないでください。

${memoryGuidance()}

次の形のJSONだけを返してください:
{"reply":"キャラクターらしい短い返答","action":"QUESTION|REACTION|SELF_DISCLOSURE|WAIT|CLOSE"}

${formatConversation(messages)}`
      : `${asrContinuationGuidance(continuationAnchors)}

${memoryGuidance()}

Continue naturally from the learner's latest message after interpreting it with the rules above. Do not ask a question by default. Choose QUESTION, REACTION, SELF_DISCLOSURE, WAIT, or CLOSE according to the conversation. A reaction or brief personal answer may stand alone. Follow a clearly introduced related idea, but avoid narrow repeated probing. Do not default to generic praise.

Return valid JSON only in this exact shape:
{"reply":"one short in-character response","action":"QUESTION|REACTION|SELF_DISCLOSURE|WAIT|CLOSE"}

The action must describe the response you actually wrote. CLOSE requires a natural closing or farewell with no question. Use CLOSE only for a clear learner ending intent or when the topic has genuinely run its course.

${formatConversation(messages)}`,
    "continuation",
    context,
  );
  return parseConversationTurn(result.text);
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
): Promise<SceneConversationTurn> {
  const continuationAnchors = [
    `Current Scene: ${situation.sceneTitle} — ${situation.title}`,
    `Scene Goal: ${situation.goal}`,
  ];
  const result = await generate(
    buildSceneRoleplayPrompt(situation, partner, getSceneUsefulPhrases(situation), complication, true),
    `${asrContinuationGuidance(continuationAnchors)}

Continue from the learner's latest message after interpreting it with the rules above. Use one brief reaction and at most one short practical question, usually 1-2 sentences and about 25 words or fewer. Accept any wording that communicates the meaning and do not default to generic praise. Do not leave the scene because of one isolated, unrelated word. Judge completion from the Scene Goal, not turn count. Once the practical goal is complete, confirm the outcome, choose CLOSE, and do not add unrelated small talk.

Return valid JSON only in this exact shape:
{"reply":"one short in-role response","action":"QUESTION|REACTION|SELF_DISCLOSURE|WAIT|CLOSE","goalStatus":"IN_PROGRESS|COMPLETED"}

Use goalStatus COMPLETED only when the practical goal has actually been achieved. COMPLETED must use action CLOSE and contain a natural final scene line with no new question.
If the learner clearly asks to stop before completion, use action CLOSE with goalStatus IN_PROGRESS and a brief farewell.

${formatConversation(messages)}`,
    "continuation",
    context,
  );
  return parseSceneConversationTurn(result.text);
}

function buildFreeTalkSystemInstruction(partner: CharacterProfile, setup: FreeTalkSetup): string {
  const languageRules = partner.conversationLanguage === "ja"
    ? `Miyabi is having a normal casual conversation in Japanese. This is not English practice. Speak only natural modern Japanese. Do not switch to English teaching or give a lesson review.`
    : `Speak only in English suitable for an A2-B1 learner. This is casual free talk, not an exercise or review.`;
  const emmaRules = partner.id === "emma"
    ? `You are an English teacher, but this is casual free talk, not a lesson or review. You may casually discuss English learning or everyday life. Do not grade the user or correct every mistake.`
    : "";
  return `You are ${partner.displayName}, having a casual, natural conversation with the user.

Your role: ${partner.role}
Your personality: ${partner.personality.join(", ")}
Your conversation style: ${partner.conversationStyle.join("; ")}

Improvised fictional setup for this conversation only:
- relationship: ${setup.relationship}
- situation: ${setup.situation}
- mood: ${setup.mood}
This setup is playful scene-setting, not a real memory. Never claim to remember actual past conversations or personal facts about the user.

${memoryGuidance()}

${languageRules}
${emmaRules}

Rules:
- There is no lesson topic to complete.
- Do not interview the user and do not ask a question in every turn.
- Choose QUESTION, REACTION, SELF_DISCLOSURE, WAIT, or CLOSE naturally.
- You may react, briefly share a thought, answer the user's question, leave space, change direction naturally, or close the conversation.
- Let the user lead part of the conversation. Keep responses short and conversational, usually 1-2 sentences.
- If the user clearly wants to finish, choose CLOSE and give a short farewell without a question.
- Do not treat a short or incomplete SpeechRecognition transcript as an ending without clear intent.`;
}

export async function startFreeTalk(
  partner: CharacterProfile,
  setup: FreeTalkSetup,
  context?: AiRequestContext,
): Promise<string> {
  const result = await generate(
    buildFreeTalkSystemInstruction(partner, setup),
    partner.conversationLanguage === "ja"
      ? "この即興設定から、短く自然な日本語の雑談を始めてください。見出しや説明は不要です。"
      : "Start the casual conversation naturally from the improvised setup. Keep it short and in character. Do not explain the setup.",
    "opening",
    context,
  );
  return result.text;
}

export async function continueFreeTalk(
  messages: ChatMessage[],
  partner: CharacterProfile,
  setup: FreeTalkSetup,
  elapsedSeconds: number,
  context?: AiRequestContext,
): Promise<ConversationTurn> {
  const windingDown = elapsedSeconds >= 240
    ? "The conversation has lasted about four minutes. If a natural break appears, you may close soon, but never cut off an active thread merely because of time."
    : "Do not end early merely because only a few turns have passed.";
  const result = await generate(
    buildFreeTalkSystemInstruction(partner, setup),
    `${windingDown}

Continue naturally from the latest user message. Return valid JSON only:
{"reply":"one short in-character response","action":"QUESTION|REACTION|SELF_DISCLOSURE|WAIT|CLOSE"}

The action must match the response. CLOSE must be a natural farewell with no question.

${formatConversation(messages)}`,
    "continuation",
    context,
  );
  return parseConversationTurn(result.text);
}

export async function generateConversationFarewell(
  partner: CharacterProfile,
  context?: AiRequestContext,
): Promise<string> {
  const result = await generate(
    `You are ${partner.displayName}. Reply only with one short, natural farewell in ${partner.conversationLanguage === "ja" ? "Japanese" : "English"}. Stay consistent with this personality: ${partner.personality.join(", ")}. Do not ask a question.`,
    partner.conversationLanguage === "ja"
      ? "ユーザーが終了ボタンを押しました。自然な別れの挨拶を1文だけ返してください。"
      : "The user chose to end the conversation. Give one brief, friendly farewell. No question.",
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
