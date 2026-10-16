export type UtteranceRecognitionObservation = Readonly<{
  transcript: string;
  isFinal: boolean;
  sessionId: number;
  timestamp: number;
}>;

export type UtteranceEngineState = Readonly<{
  rawTranscript: string;
  observations: readonly UtteranceRecognitionObservation[];
  lastGrowthAt: number | null;
  lastResultAt: number | null;
  revisionCount: number;
  sessionBoundaries: number;
}>;

export type UtteranceTurnDecision = Readonly<{
  action: "continueListening" | "commitUtterance" | "requestClarification" | "ignoreNoise";
  committedUtterance: string | null;
  completion: "complete" | "probablyComplete" | "incomplete";
  syntacticCompletion: "complete" | "uncertain" | "incomplete";
  semanticLanding: boolean;
  couldContinue: boolean;
  needsContinuation: boolean;
  completionScore: number;
  recognitionConfidence: "high" | "medium" | "low";
  semanticConfidence: "high" | "medium" | "low";
  likelyIntent: string | null;
  previousTurnExpectation: PreviousTurnExpectation;
  shortAnswerDetected: boolean;
  shortAnswerContinuationLikelihood: ContinuationLikelihood;
  shortAnswerGraceStarted: boolean;
  shortAnswerGraceMs: number;
  answerAdequacy: AnswerAdequacy;
  turnCompletionType: TurnCompletionType;
  turnConfidence: Confidence;
  clarificationLevel: 1 | 2 | 3 | null;
  clarificationPrompt: string | null;
  retryAfterMs: number;
  reasons: readonly string[];
}>;

export type UtteranceDecisionContext = Readonly<{
  candidate: string;
  previousAssistantText?: string;
  language: "en" | "ja";
  now: number;
  hardDeadline?: boolean;
  hasHeld?: boolean;
  holdCount?: number;
  deviceTimingProfile?: "desktop" | "android" | "ios" | "fallback";
}>;

export type PreviousTurnExpectation = "YES_NO_OPEN" | "YES_NO_CONFIRMATION" | "WH_OPEN" | "CHOICE" | "INSTRUCTION_ACK" | "FREE_RESPONSE" | "CLOSING";
export type TurnCompletionType = "TURN_COMPLETE_FINAL" | "TURN_COMPLETE_CONTINUABLE" | "TURN_INCOMPLETE";
export type ContinuationLikelihood = "HIGH" | "MEDIUM" | "LOW";
export type AnswerAdequacy = "sufficient" | "insufficient" | "uncertain";
type Confidence = "high" | "medium" | "low";

const CLEAR_SHORT_REPLIES = new Set([
  "yes", "no", "sure", "maybe", "of course", "i don't know", "not really",
  "at home", "by myself", "with my family", "sounds good", "that's right", "me too", "cash please",
  "okay", "ok", "here you are", "all right",
].map(normalize));

const TRAILING_INCOMPLETE_EN = /(?:\b(?:and|but|because|although|though|if|when|while|or|so|to|about|with|for|from|of|the|a|an|my|your|our|their|that)|\b(?:i|you|we|they)\s+(?:am|are|was|were|have|would|will|can|could|should)|\b(?:i\s+(?:think|guess|mean)|you\s+are\s+(?:speaking|talking)|i\s+(?:want|would\s+like))|\b(?:letting|giving|telling|putting|making))$/i;
const OBVIOUSLY_BROKEN_EN = /\b(?:like|love|enjoy|prefer)\s+(?:read|go|play|listen|watch)\s+(?:the\s+)?\w+$/i;
const SEMANTIC_REVERSAL_RISK_EN = /\b(?:a|an)\s+(?:any|no|some)\b|\b(?:i|we|he|she|they)\b[^.!?]*\b(?:what|who|where|why)\b[^?]*$/i;
const LANDED_CLAUSE_EN = /^(?:i|you|we|they|he|she|it|this|that)\s+(?:(?:can|could|will|would|should|do|did|have|am|are|is|was|were)\s+)?(?:remember|know|think|guess|like|love|prefer|live|work|agree|understand|mean|need|went|go|feel|want|have|had|did|can|could|will|would|should|am|are|is|was|were)\b(?:\s+.+)?$/i;
const LEADING_CONVERSATION_MARKER_EN = /^(?:(?:yes|no|well|actually|honestly|maybe|sure)\s+)+/i;
const SHORT_CONTINUABLE_REPLIES = new Set(["yes", "no", "maybe", "i think so", "probably", "sometimes", "usually"]);
const BARE_POLAR_REPLIES = new Set(["yes", "no"]);

export function classifyPreviousTurnExpectation(text = ""): PreviousTurnExpectation {
  const raw = text.trim();
  const question = normalize(raw);
  if (!raw) return "FREE_RESPONSE";
  if (/\b(?:stop here|finish|anything else|shall we (?:stop|finish|end)|ready to (?:stop|finish|end))\b/i.test(question)) return "CLOSING";
  if (/\b(?:is that right|do you mean|is (?:this|that) (?:okay|ok|right)|are you ready|does that (?:sound right|make sense))\b/i.test(question)) return "YES_NO_CONFIRMATION";
  if (/\bor\b/i.test(question) && /[?？]\s*$/.test(raw)) return "CHOICE";
  if (/^(?:what|where|when|why|how|who|which)\b/i.test(question)) return "WH_OPEN";
  if (/^(?:do|did|have|has|are|is|can|could|would|will|should)\b/i.test(question) && /[?？]\s*$/.test(raw)) return "YES_NO_OPEN";
  if (!/[?？]\s*$/.test(raw) && /^(?:please\b|(?:roll|open|close|show|give|take|put|come|follow|wait)\b)/i.test(question)) return "INSTRUCTION_ACK";
  return "FREE_RESPONSE";
}

export function shortAnswerGraceMs(profile: UtteranceDecisionContext["deviceTimingProfile"]): number {
  if (profile === "ios") return 900;
  if (profile === "android") return 700;
  return 550;
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[.!?,;:'"’。、！？・，．-]/g, "").replace(/\s+/g, " ").trim();
}

function tokenDifference(left: string, right: string): number {
  const a = normalize(left).split(/\s+/).filter(Boolean);
  const b = normalize(right).split(/\s+/).filter(Boolean);
  const shared = a.filter((token, index) => b[index] === token).length;
  return Math.max(a.length, b.length) - shared;
}

function optionIntent(previousAssistantText: string, candidate: string): string | null {
  const question = normalize(previousAssistantText);
  const alternatives = question.split(/\s+or\s+/);
  if (alternatives.length !== 2) return null;
  const candidateTokens = new Set(normalize(candidate).split(/\s+/));
  const options = alternatives.map((value, index) => {
    const cleaned = value.replace(/^(?:do you want|would you like|is it)\s+/, "").trim();
    const tokens = cleaned.split(/\s+/);
    return (index === 0 ? tokens.slice(-4) : tokens.slice(0, 4)).join(" ");
  });
  return options.find((option) => option.split(/\s+/).filter((token) => token.length > 2).every((token) =>
    candidateTokens.has(token) || [...candidateTokens].some((candidateToken) => candidateToken.endsWith(token) && candidateToken.length - token.length <= 1),
  )) ?? null;
}

function reliableFragment(state: UtteranceEngineState): string | null {
  if (state.observations.length < 2) return null;
  const recent = state.observations.slice(-3).map((item) => normalize(item.transcript).split(/\s+/));
  const last = recent.at(-1) ?? [];
  const stable = last.filter((token) => token.length > 2 && recent.slice(0, -1).some((tokens) => tokens.includes(token)));
  return stable.length >= 2 ? stable.slice(-2).join(" ") : null;
}

export function createUtteranceEngineState(): UtteranceEngineState {
  return { rawTranscript: "", observations: [], lastGrowthAt: null, lastResultAt: null, revisionCount: 0, sessionBoundaries: 0 };
}

export function observeUtteranceRecognition(
  state: UtteranceEngineState,
  observation: UtteranceRecognitionObservation,
): UtteranceEngineState {
  const transcript = observation.transcript.trim();
  if (!transcript) return state;
  const previous = state.observations.at(-1);
  const grew = Boolean(previous) && normalize(transcript).startsWith(normalize(previous!.transcript))
    && normalize(transcript).length > normalize(previous!.transcript).length;
  const revised = Boolean(previous) && !grew && normalize(previous!.transcript) !== normalize(transcript)
    && tokenDifference(previous!.transcript, transcript) >= 1;
  const sessionBoundary = Boolean(previous) && previous!.sessionId !== observation.sessionId;
  return {
    rawTranscript: transcript,
    observations: [...state.observations, { ...observation, transcript }].slice(-12),
    lastGrowthAt: grew ? observation.timestamp : state.lastGrowthAt,
    lastResultAt: observation.timestamp,
    revisionCount: state.revisionCount + (revised ? 1 : 0),
    sessionBoundaries: state.sessionBoundaries + (sessionBoundary ? 1 : 0),
  };
}

export function decideUtteranceTurn(
  state: UtteranceEngineState,
  context: UtteranceDecisionContext,
): UtteranceTurnDecision {
  const candidate = context.candidate.trim();
  const previousTurnExpectation = classifyPreviousTurnExpectation(context.previousAssistantText);
  if (!candidate) return { action: "ignoreNoise", committedUtterance: null, completion: "probablyComplete", syntacticCompletion: "uncertain", semanticLanding: false, couldContinue: false, needsContinuation: false, completionScore: 0, recognitionConfidence: "high", semanticConfidence: "low", likelyIntent: null, previousTurnExpectation, shortAnswerDetected: false, shortAnswerContinuationLikelihood: "LOW", shortAnswerGraceStarted: false, shortAnswerGraceMs: 0, answerAdequacy: "uncertain", turnCompletionType: "TURN_INCOMPLETE", turnConfidence: "low", clarificationLevel: null, clarificationPrompt: null, retryAfterMs: 0, reasons: ["empty-transcript"] };

  const normalized = normalize(candidate);
  const words = normalized.split(/\s+/).filter(Boolean);
  const questionContext = /[?？]\s*$/.test(context.previousAssistantText?.trim() ?? "");
  const broken = context.language === "en" && OBVIOUSLY_BROKEN_EN.test(normalized);
  const reversalRisk = context.language === "en" && SEMANTIC_REVERSAL_RISK_EN.test(normalized);
  const clearShortReply = context.language === "en" && (CLEAR_SHORT_REPLIES.has(normalized)
    || (questionContext && words.length <= 4 && /^(?:at|by|with|in|on|from)\b/.test(normalized)));
  const syntacticallyIncomplete = context.language === "en" && !clearShortReply && TRAILING_INCOMPLETE_EN.test(normalized);
  const semanticBody = context.language === "en" ? normalized.replace(LEADING_CONVERSATION_MARKER_EN, "").trim() : normalized;
  const landedClause = context.language === "en" && !broken && !reversalRisk && LANDED_CLAUSE_EN.test(semanticBody)
    && !/\b(?:want|need|would like)\s+to$|\b(?:think|guess|mean|letting|giving|telling|putting|making|because|although|if|when|while|and|but|or|to|about|with|for|from|of)$/i.test(semanticBody);
  const semanticLanding = context.language === "ja"
    ? normalized.length > 0
    : clearShortReply || landedClause;
  const needsContinuation = syntacticallyIncomplete && !semanticLanding;
  const couldContinue = semanticLanding && (syntacticallyIncomplete || !/[.!?]$/.test(candidate.trim()));
  const recentGrowth = state.lastGrowthAt !== null && context.now - state.lastGrowthAt < 1_600;
  const recognitionConfidence = state.revisionCount >= 2 ? "low" : state.revisionCount > 0 || state.sessionBoundaries > 0 ? "medium" : "high";
  const likelyIntent = optionIntent(context.previousAssistantText ?? "", candidate);
  const shortAnswerDetected = context.language === "en" && SHORT_CONTINUABLE_REPLIES.has(normalized);
  const barePolarReply = context.language === "en" && BARE_POLAR_REPLIES.has(normalized);
  const answerAdequacy: AnswerAdequacy = barePolarReply && (previousTurnExpectation === "WH_OPEN" || previousTurnExpectation === "FREE_RESPONSE")
    ? "insufficient"
    : clearShortReply || likelyIntent || landedClause ? "sufficient" : needsContinuation ? "insufficient" : "uncertain";
  const shortAnswerContinuationLikelihood: ContinuationLikelihood = shortAnswerDetected && previousTurnExpectation === "YES_NO_OPEN"
    ? "HIGH"
    : shortAnswerDetected && previousTurnExpectation === "FREE_RESPONSE" ? "MEDIUM" : "LOW";
  const wordSalad = context.language === "en" && words.length >= 6 && (broken || reversalRisk);
  const optionNoise = Boolean(likelyIntent) && words.length > normalize(likelyIntent ?? "").split(/\s+/).length + 3;
  const semanticConfidence = clearShortReply
    ? "high"
    : likelyIntent ? reversalRisk ? "low" : optionNoise || recognitionConfidence !== "high" ? "medium" : "high"
      : !broken && !reversalRisk ? "high" : "low";
  const syntacticCompletion = syntacticallyIncomplete ? "incomplete" : words.length <= 2 ? "uncertain" : "complete";
  const completionScore = Math.max(0, Math.min(1,
    (semanticLanding ? 0.55 : 0.15) + (syntacticCompletion === "complete" ? 0.25 : syntacticCompletion === "uncertain" ? 0.1 : 0) + (landedClause ? 0.2 : 0)
      + (clearShortReply ? 0.2 : 0) - (recentGrowth ? 0.25 : 0) - (needsContinuation ? 0.35 : 0),
  ));
  const completion = semanticLanding
    ? completionScore >= 0.75 ? "complete" : "probablyComplete"
    : needsContinuation ? "incomplete" : "probablyComplete";
  const turnCompletionType: TurnCompletionType = needsContinuation || answerAdequacy === "insufficient"
    ? "TURN_INCOMPLETE"
    : shortAnswerContinuationLikelihood === "HIGH" ? "TURN_COMPLETE_CONTINUABLE" : "TURN_COMPLETE_FINAL";
  const turnConfidence: Confidence = semanticConfidence === "low" || answerAdequacy === "insufficient"
    ? "low" : recognitionConfidence === "high" && semanticConfidence === "high" ? "high" : "medium";
  const graceMs = shortAnswerGraceMs(context.deviceTimingProfile);
  const shortAnswerGraceStarted = turnCompletionType === "TURN_COMPLETE_CONTINUABLE" && shortAnswerContinuationLikelihood === "HIGH" && semanticConfidence === "high" && (context.holdCount ?? 0) === 0 && !context.hardDeadline;
  const decisionBase = { completion, syntacticCompletion, semanticLanding, couldContinue, needsContinuation, completionScore, recognitionConfidence, semanticConfidence, likelyIntent, previousTurnExpectation, shortAnswerDetected, shortAnswerContinuationLikelihood, shortAnswerGraceStarted, shortAnswerGraceMs: shortAnswerGraceStarted ? graceMs : 0, answerAdequacy, turnCompletionType, turnConfidence } as const;
  const holdCount = context.holdCount ?? (context.hasHeld ? 1 : 0);
  const reasons: string[] = [];
  if (clearShortReply) reasons.push("contextually-complete-short-reply");
  if (syntacticallyIncomplete) reasons.push("syntactically-incomplete");
  if (semanticLanding) reasons.push("semantic-landing");
  if (needsContinuation) reasons.push("needs-continuation");
  if (recentGrowth) reasons.push("recent-transcript-growth");
  if (recognitionConfidence !== "high") reasons.push("recognition-revisions");
  if (broken) reasons.push("low-language-plausibility");
  if (reversalRisk) reasons.push("meaning-reversal-or-role-ambiguity");
  if (likelyIntent) reasons.push("context-option-intent");
  if (state.sessionBoundaries > 0) reasons.push("recognition-session-boundary");
  reasons.push(`previous-turn-${previousTurnExpectation.toLowerCase()}`);
  if (answerAdequacy === "insufficient") reasons.push("answer-inadequate-for-question");
  if (shortAnswerGraceStarted) reasons.push("short-answer-grace");

  if (shortAnswerGraceStarted) {
    return { action: "continueListening", committedUtterance: null, ...decisionBase, clarificationLevel: null, clarificationPrompt: null, retryAfterMs: graceMs, reasons };
  }

  if (!context.hardDeadline && holdCount < 2 && (needsContinuation || (recentGrowth && !semanticLanding))) {
    return { action: "continueListening", committedUtterance: null, ...decisionBase, clarificationLevel: null, clarificationPrompt: null, retryAfterMs: needsContinuation ? 1_800 : 900, reasons };
  }
  if (semanticConfidence === "medium" && recognitionConfidence === "low" && holdCount === 0) {
    return { action: "continueListening", committedUtterance: null, ...decisionBase, clarificationLevel: null, clarificationPrompt: null, retryAfterMs: 700, reasons: [...reasons, "short-semantic-hold"] };
  }
  if ((semanticConfidence === "low" || answerAdequacy === "insufficient") && holdCount === 0) {
    return { action: "continueListening", committedUtterance: null, ...decisionBase, clarificationLevel: null, clarificationPrompt: null, retryAfterMs: 900, reasons: [...reasons, "short-semantic-hold"] };
  }
  if (semanticConfidence === "low" || answerAdequacy === "insufficient" || needsContinuation && (context.hardDeadline || holdCount >= 2)) {
    const fragment = reliableFragment(state);
    const clarificationLevel = likelyIntent ? 1 : fragment && !wordSalad ? 2 : 3;
    const clarificationPrompt = likelyIntent
      ? `Did you mean ${likelyIntent}?`
      : clarificationLevel === 2 ? `Sorry, did you say “${fragment}”?` : "Sorry, I didn't quite catch that. Could you say it again?";
    return { action: "requestClarification", committedUtterance: null, ...decisionBase, semanticConfidence: "low", clarificationLevel, clarificationPrompt, retryAfterMs: 0, reasons };
  }
  return { action: "commitUtterance", committedUtterance: candidate, ...decisionBase, clarificationLevel: null, clarificationPrompt: null, retryAfterMs: 0, reasons: reasons.length ? reasons : ["meaning-is-safe"] };
}
