import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { detectsTopicChangeIntent, hasUserResponse, mergeSpeechTranscript, type ChatMessage, type LessonReview, type SpokenReviewPart } from "../ai/conversationTypes";
import {
  continueTutorConversation,
  continueSceneRoleplay,
  continueFreeTalk,
  extractAndSaveConversationMemory,
  generateConversationFarewell,
  getAiErrorUserMessage,
  AiRequestError,
  reviewTutorConversation,
  explainEnglishMessageInJapanese,
  startSceneRoleplay,
  startFreeTalk,
  startTutorConversation,
  type FreeTalkSetup,
} from "../ai/chatWithTutor";
import { buildSpokenReviewLecture } from "../ai/buildReviewLecture";
import { buildReviewDisplayModel } from "../ai/reviewDisplay";
import { createUserTurnSnapshot, selectUserTurnSnapshotText, type UserTurnSnapshot } from "../ai/userTurnSnapshot";
import { chooseFreeTalkCharacter, loadLastFreeTalkCharacter, saveLastFreeTalkCharacter } from "../ai/freeTalkCharacterSelection";
import { delegatesTopicChoice, resolveRequestedTopic } from "../ai/topicChangeSelection";
import { loadConversationMemories, loadLastUsedFreeTalkMemoryId, saveLastUsedFreeTalkMemoryId, selectConversationMemoryForUse } from "../memory/conversationMemory";
import { applySpeechRateIntent, detectSpeechRateIntent, SPEECH_SPEED_MULTIPLIERS, type SpeechSpeed } from "../ai/conversationControls";
import { shouldCancelConversation, type ConversationCancelTrigger } from "../ai/conversationCancelPolicy";
import { classifyUserTurnSoftTimeout, CONTINUATION_HOLD_MIN_WORDS, CONTINUATION_HOLD_MS, decideSoftTimerFire, ttsRecognitionRestartDelayMs, type UserTurnSoftTimeoutDecision } from "../ai/speechRecognitionTiming";
import { TALK_TOPICS, type TalkTopic } from "../data/talkTopics.seed";
import { getTopicBackground } from "../data/topicBackgrounds";
import { chooseTopicAngle } from "../data/topicAngles";
import {
  buildOpeningVariationContext,
  filterTopicChoices,
  getRecentTopicHistory,
  normalizeTopicTitle,
  readConversationTopicHistory,
  recordConversationTopicHistory,
} from "../data/conversationTopicHistory";
import { FRESH_TOPIC_MIX_RATIO, isFreshTalkTopic, loadFreshTopics, type FreshTalkTopic } from "../data/freshTopics";
import {
  chooseSceneComplication,
  chooseScenePartner,
  chooseSceneSituation,
  getSceneUsefulPhrases,
  SCENE_ROLEPLAYS,
  type SceneRoleplay,
  type SceneSituation,
} from "../data/sceneRoleplays";
import { useCharacterListening } from "../hooks/useCharacterListening";
import { useUserSpeechRecognition } from "../hooks/useUserSpeechRecognition";
import { useCharacterSpeech } from "../hooks/useCharacterSpeech";
import { setTtsConversationState } from "../sound/cancelSpeechSynthesis";
import { prewarmEmmaVoice, unlockAppleTtsOnUserGesture, type SpeechFinishReason } from "../sound/speakEn.ts";
import { detectDeviceGroup } from "../sound/selectCharacterVoice";
import { useIdleExpression } from "../hooks/useIdleExpression";
import { getCharacter, type CharacterExpression } from "../data/characters";
import { ANYONE_THUMBNAIL, PARTNER_THUMBNAILS, SCENE_THUMBNAILS } from "../data/imageThumbnails";
import { CHARACTER_PROFILES, ENGLISH_CONVERSATION_PARTNER_IDS, type CharacterId, type ConversationLanguage } from "../characters/characterProfiles";
import emmaRoom from "../assets/backgrounds/emma_room.webp";
import hotelBackground from "../assets/backgrounds/hotel.webp";
import airportBackground from "../assets/backgrounds/airport.webp";
import streetBackground from "../assets/backgrounds/street.webp";
import restaurantBackground from "../assets/backgrounds/restaurant.webp";
import marketBackground from "../assets/backgrounds/market.webp";
import stationBackground from "../assets/backgrounds/station.webp";
import hospitalBackground from "../assets/backgrounds/hospital.webp";
import fastFoodBackground from "../assets/backgrounds/fastfood.webp";
import { CharacterAvatar } from "./CharacterAvatar";
import { tossaPerf } from "../debug/tossaPerf";
import { createUtteranceEngineState, decideUtteranceTurn, observeUtteranceRecognition, type UtteranceEngineState } from "../ai/utteranceEngine";
import { clearConversationHistory, recordConversationHistory } from "../debug/conversationHistory";
import { applySceneProgression, beginSceneClosing, createSceneProgressState, finishSceneClosing, type SceneProgressState } from "../ai/sceneProgression";
import { createSceneRoleContract, detectsSceneRoleConflict, sceneRoleRepairPrompt } from "../ai/sceneRoleContract";

type ConversationPhase = "idle" | "recognizing" | "thinking" | "ttsPending" | "speaking";
type LessonStage = "sceneSelect" | "partnerSelect" | "conversation";
type ConversationMode = "TOPIC" | "SCENE" | "FREE_TALK";
type SilenceStage = "NORMAL" | "CHECK" | "CONFIRM_END" | "AUTO_CLOSE";

export const HARD_UTTERANCE_TIMEOUT_MS = 7000;
export const CONVERSATION_INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
export const SELECTION_INACTIVITY_TIMEOUT_MS = 3 * 60 * 1000;
export const SILENCE_CHECK_TIMEOUT_MS = 45 * 1000;
export const SILENCE_CONFIRM_TIMEOUT_MS = 35 * 1000;
export const SILENCE_AUTO_CLOSE_TIMEOUT_MS = 35 * 1000;

let previousTopicId: string | null = null;
let previousNormalizedTopicTitle: string | null = null;
let previousTopicWasFresh = false;
const REVIEW_CHARACTER = getCharacter("emma");
const ENGLISH_PARTNERS = ENGLISH_CONVERSATION_PARTNER_IDS.map((id) => getCharacter(id));
const MIYABI = getCharacter("miyabi");
const PARTNER_SELECTION_PROMPT = "Who would you like to talk with today?";
const SCENE_SELECTION_PROMPT = "Choose a scene you would like to practice.";
const IPAD_EMMA_FIRST_UTTERANCE_WATCHDOG_MS = 4500;
const IPAD_EMMA_SECOND_UTTERANCE_WATCHDOG_MS = 750;
const SCENE_BACKGROUNDS = {
  hotel: hotelBackground,
  airport: airportBackground,
  street: streetBackground,
  restaurant: restaurantBackground,
  shopping: marketBackground,
  transportation: stationBackground,
  hospital: hospitalBackground,
  fastfood: fastFoodBackground,
} as const;

const FREE_TALK_RELATIONSHIPS = ["old acquaintance", "former classmate", "coworker", "neighbor", "new acquaintance"] as const;
const FREE_TALK_SITUATIONS = ["met by chance at a cafe", "ran into each other in town", "sat next to each other while traveling", "are taking a short break together"] as const;
const FREE_TALK_MOODS = ["relaxed", "cheerful", "calm", "curious"] as const;

function chooseFreeTalkSetup(random: () => number = Math.random): FreeTalkSetup {
  const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)];
  return { relationship: pick(FREE_TALK_RELATIONSHIPS), situation: pick(FREE_TALK_SITUATIONS), mood: pick(FREE_TALK_MOODS) };
}

function chooseTopic(freshTopics: readonly FreshTalkTopic[] = [], random: () => number = Math.random, excludedTopicId?: string): TalkTopic {
  const requestedTitle = new URLSearchParams(window.location.search).get("topic");
  const requestedTopic = [...TALK_TOPICS, ...freshTopics].find(
    (topic) => topic.title.toLowerCase() === requestedTitle?.toLowerCase()
  );
  if (requestedTopic && requestedTopic.id !== excludedTopicId) {
    previousTopicId = requestedTopic.id;
    previousNormalizedTopicTitle = normalizeTopicTitle(requestedTopic.title);
    previousTopicWasFresh = isFreshTalkTopic(requestedTopic);
    return requestedTopic;
  }

  const persistedLatest = readConversationTopicHistory()[0];
  const recentNormalizedTitle = previousNormalizedTopicTitle ?? persistedLatest?.normalizedTitle ?? null;
  const latestWasFresh = previousTopicId === null && persistedLatest ? persistedLatest.source === "fresh" : previousTopicWasFresh;
  const useFresh = freshTopics.length > 0 && !latestWasFresh && random() < FRESH_TOPIC_MIX_RATIO;
  const source = useFresh ? freshTopics : TALK_TOPICS;
  let choices = filterTopicChoices(source, recentNormalizedTitle, excludedTopicId ?? previousTopicId);
  if (excludedTopicId && choices.every((candidate) => candidate.id === excludedTopicId)) {
    choices = [...TALK_TOPICS, ...freshTopics].filter((candidate) => candidate.id !== excludedTopicId);
  }
  const topic = choices[Math.floor(random() * choices.length)];
  previousTopicId = topic.id;
  previousNormalizedTopicTitle = normalizeTopicTitle(topic.title);
  previousTopicWasFresh = isFreshTalkTopic(topic);
  return topic;
}

function friendlyError(error: unknown): string {
  console.error("[AI conversation]", error);
  if (!(error instanceof AiRequestError)) {
    tossaPerf("FLOW", "AI post-response error", {
      event: "error",
      requestType: "unknown",
      requestId: null,
      httpStatus: null,
      elapsedMs: null,
      errorCode: "POST_RESPONSE_ERROR",
      errorStage: "post-response",
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error),
      responseReceived: true,
      responseParsed: true,
    });
  }
  return getAiErrorUserMessage(error);
}

function speechDebug(event: string, details: Record<string, unknown>) {
  if (import.meta.env.DEV) console.debug("[TossaSpeak speech]", event, details);
}

const REVIEW_SECTION_DEFINITIONS: ReadonlyArray<{
  key: keyof LessonReview["sections"];
  heading: string;
  language: ConversationLanguage;
}> = [
  { key: "goodPoints", heading: "今日よく使えた英語", language: "en" },
  { key: "corrections", heading: "ここを直そう", language: "en" },
  { key: "alternatives", heading: "こんな言い方もできる", language: "en" },
  { key: "todayPoints", heading: "今日のポイント", language: "ja" },
];

function ReviewSections({ sections, language }: { sections: LessonReview["sections"]; language: ConversationLanguage }) {
  const visibleSections = REVIEW_SECTION_DEFINITIONS.filter(
    (definition) => definition.language === language && sections[definition.key].length > 0,
  );

  return (
    <div className="ai-review-sections">
      {visibleSections.map(({ key, heading }) => (
        <section className="ai-review-section" key={key}>
          <h3>{heading}</h3>
          <div>{sections[key].map((item, index) => <p key={`${key}-${index}`}>{item}</p>)}</div>
        </section>
      ))}
    </div>
  );
}

type AiConversationUIProps = {
  showConversationCaptions: boolean;
  uiLanguage?: "ja" | "en";
  onButtonPress: () => void;
  speechSpeed: SpeechSpeed;
  onSpeechSpeedChange: (speed: SpeechSpeed) => void;
  onReviewActiveChange?: (active: boolean) => void;
};

export default function AiConversationUI({ showConversationCaptions, uiLanguage = "ja", onButtonPress, speechSpeed, onSpeechSpeedChange, onReviewActiveChange }: AiConversationUIProps) {
  const [topic, setTopic] = useState<TalkTopic | null>(null);
  const [freshTopics, setFreshTopics] = useState<FreshTalkTopic[]>([]);
  const [scene, setScene] = useState<SceneSituation | null>(null);
  const [sceneComplication, setSceneComplication] = useState<string | null>(null);
  const [conversationMode, setConversationMode] = useState<ConversationMode>("TOPIC");
  const [freeTalkSetup, setFreeTalkSetup] = useState<FreeTalkSetup | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [interimCaption, setInterimCaption] = useState("");
  const [review, setReview] = useState<LessonReview["sections"] | null>(null);
  const [spokenReview, setSpokenReview] = useState<SpokenReviewPart[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<ConversationPhase>("idle");
  const [lessonStage, setLessonStage] = useState<LessonStage>("partnerSelect");
  const [partnerId, setPartnerId] = useState<CharacterId | null>(null);
  const [topicAngle, setTopicAngle] = useState<string | null>(null);
  const [avoidedTopicAngles, setAvoidedTopicAngles] = useState<string[]>([]);
  const [partnerSelectionReady, setPartnerSelectionReady] = useState(false);
  const [introOpeningComplete, setIntroOpeningComplete] = useState(false);
  const [partnerExpression, setPartnerExpression] = useState<CharacterExpression>("neutral");
  const [reviewExpression, setReviewExpression] = useState<CharacterExpression>("neutral");
  const [microphoneFallback, setMicrophoneFallback] = useState(false);
  const [rescueBusy, setRescueBusy] = useState(false);
  const [rescueMessage, setRescueMessage] = useState("");
  const [awaitingUserInput, setAwaitingUserInput] = useState(false);
  const [hasRecognizedSpeech, setHasRecognizedSpeech] = useState(false);
  const requestBusyRef = useRef(false);
  const lessonEndingRef = useRef(false);
  const { pose: listeningPose, start: startListening, stop: stopListening } = useCharacterListening();
  const {
    active: recognitionActive,
    start: startRecognition,
    cancel: cancelRecognition,
    getSessionId: getRecognitionSessionId,
    setIgnoreRecognitionDuringMiyabi,
  } = useUserSpeechRecognition();
  const character = partnerId ? getCharacter(partnerId) : REVIEW_CHARACTER;
  const visibleCharacter = rescueBusy ? getCharacter("miyabi") : character;
  const stageCharacter = review ? REVIEW_CHARACTER : visibleCharacter;
  const conversationLanguage = partnerId ? CHARACTER_PROFILES[partnerId].conversationLanguage : "en";
  const speechLocale = conversationLanguage === "ja" ? "ja-JP" : "en-US";
  const {
    isSpeaking: partnerIsSpeaking,
    mouthOpenRef: partnerMouthOpenRef,
    speakAssistantMessage,
    speakCharacterItems,
    stopAssistantSpeech,
  } = useCharacterSpeech(character.id, speechLocale);
  const {
    isSpeaking: reviewIsSpeaking,
    mouthOpenRef: reviewMouthOpenRef,
    speakCharacterItems: speakReviewItems,
    stopAssistantSpeech: stopReviewSpeech,
  } = useCharacterSpeech(REVIEW_CHARACTER.id, "ja-JP");
  const {
    isSpeaking: miyabiIsSpeaking,
    mouthOpenRef: miyabiMouthOpenRef,
    speakCharacterItems: speakMiyabiItems,
    stopAssistantSpeech: stopMiyabiSpeech,
  } = useCharacterSpeech(MIYABI.id, "ja-JP");
  const isSpeaking = review ? reviewIsSpeaking : rescueBusy ? miyabiIsSpeaking : partnerIsSpeaking;
  const activeMouthOpenRef = review ? reviewMouthOpenRef : rescueBusy ? miyabiMouthOpenRef : partnerMouthOpenRef;
  const idleProfile = partnerId ? CHARACTER_PROFILES[partnerId] : CHARACTER_PROFILES.emma;
  const openingIdleActive = showIntro && introOpeningComplete;

  useEffect(() => {
    setTtsConversationState(`AiConversationUI stage=${lessonStage} phase=${phase} intro=${showIntro} partner=${partnerId ?? "none"}`);
  }, [lessonStage, partnerId, phase, showIntro]);
  useEffect(() => {
    onReviewActiveChange?.(Boolean(review));
    return () => onReviewActiveChange?.(false);
  }, [onReviewActiveChange, review]);
  const idleActive = !review && !busy && phase === "idle" && !partnerIsSpeaking && (
    openingIdleActive || (!showIntro && (lessonStage !== "partnerSelect" || partnerSelectionReady))
  );
  const idleVisual = useIdleExpression(idleActive, idleProfile, character.listening?.blink);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTokenRef = useRef(0);
  const mountedRef = useRef(false);
  const historyEndRef = useRef<HTMLDivElement | null>(null);
  const reviewLectureStartedRef = useRef<LessonReview["sections"] | null>(null);
  const partnerOpeningStartedRef = useRef<string | null>(null);
  const topicChangeHistoryRef = useRef<ChatMessage[] | null>(null);
  const topicChangeStateRef = useRef<{ state: "waitingForUserChoice"; fromTopicId: string } | null>(null);
  const recognitionRestartTimerRef = useRef<number | null>(null);
  const miyabiIgnoreReleaseTimerRef = useRef<number | null>(null);
  const softFinalizeTimerRef = useRef<number | null>(null);
  const hardFinalizeTimerRef = useRef<number | null>(null);
  const conversationInactivityTimerRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const silenceStageRef = useRef<SilenceStage>("NORMAL");
  const handleSilenceStageRef = useRef<() => void>(() => {});
  const reviewInactivityTimerRef = useRef<number | null>(null);
  const returnToTopRef = useRef<(trigger: ConversationCancelTrigger) => void>(() => {});
  const pendingPartnerAnnouncementRef = useRef<string | null>(null);
  const utteranceBufferRef = useRef("");
  const interimFallbackRef = useRef("");
  const utteranceSentRef = useRef(false);
  const miyabiTtsInputIgnoredRef = useRef(false);
  const miyabiResumeFromSessionRef = useRef<number | null>(null);
  const userTurnIdRef = useRef(0);
  const processedSnapshotIdsRef = useRef(new Set<number>());
  const lastActivityAtRef = useRef(0);
  const recognitionProgressRef = useRef<{
    previousTranscript: string;
    lastResultAt: number | null;
    lastGrowthAt: number | null;
    recentGrowth: boolean[];
    latestIsFinal: boolean;
  }>({ previousTranscript: "", lastResultAt: null, lastGrowthAt: null, recentGrowth: [], latestIsFinal: false });
  const continuationHoldRef = useRef<{ userTurnId: number; startedAt: number } | null>(null);
  const softTimerExtendedRef = useRef(false);
  const softTimeoutDecisionRef = useRef<UserTurnSoftTimeoutDecision>(classifyUserTurnSoftTimeout({
    transcript: "",
    language: "en",
    lastResultIntervalMs: null,
    recentGrowthCount: 0,
  }));
  const utteranceEngineRef = useRef<UtteranceEngineState>(createUtteranceEngineState());
  const recognitionSessionIdRef = useRef(0);
  const utteranceHoldRef = useRef(0);
  const shortAnswerGraceRef = useRef<{ userTurnId: number; startedAt: number; initialText: string; additionalFragmentReceived: boolean; mergeCount: number } | null>(null);
  const lastUserSpeechEndAtRef = useRef<number | null>(null);
  const consecutiveFullClarificationsRef = useRef(0);
  const sceneProgressRef = useRef<SceneProgressState>(createSceneProgressState());
  const startMicrophoneRef = useRef<(continuationToken?: number) => void>(() => {});
  const speechRateMultiplierRef = useRef(SPEECH_SPEED_MULTIPLIERS[speechSpeed]);
  speechRateMultiplierRef.current = SPEECH_SPEED_MULTIPLIERS[speechSpeed];
  const partnerCancelRef = useRef<HTMLButtonElement | null>(null);
  const partnerListEndRef = useRef<HTMLDivElement | null>(null);
  const topicFlowStartedAtRef = useRef<number | null>(null);
  const loadedPartnerThumbnailsRef = useRef(new Set<string>());
  const desiredStageBackground = lessonStage === "conversation" && !review
    ? scene
      ? SCENE_BACKGROUNDS[scene.sceneId]
      : topic
        ? getTopicBackground(topic.id)
        : emmaRoom
    : emmaRoom;
  const [displayedStageBackground, setDisplayedStageBackground] = useState(emmaRoom);

  const armConversationInactivityTimer = useCallback(() => {
    if (conversationInactivityTimerRef.current !== null) {
      window.clearTimeout(conversationInactivityTimerRef.current);
    }
    conversationInactivityTimerRef.current = window.setTimeout(() => {
      conversationInactivityTimerRef.current = null;
      returnToTopRef.current("conversation-inactivity");
    }, CONVERSATION_INACTIVITY_TIMEOUT_MS);
  }, []);

  const armSilenceTimer = useCallback((reset = false) => {
    if (silenceTimerRef.current !== null) window.clearTimeout(silenceTimerRef.current);
    if (reset) silenceStageRef.current = "NORMAL";
    const timeoutMs = silenceStageRef.current === "NORMAL"
      ? SILENCE_CHECK_TIMEOUT_MS
      : silenceStageRef.current === "CHECK"
        ? SILENCE_CONFIRM_TIMEOUT_MS
        : SILENCE_AUTO_CLOSE_TIMEOUT_MS;
    silenceTimerRef.current = window.setTimeout(() => {
      silenceTimerRef.current = null;
      handleSilenceStageRef.current();
    }, timeoutMs);
  }, []);

  const armReviewInactivityTimer = useCallback(() => {
    if (reviewInactivityTimerRef.current !== null) window.clearTimeout(reviewInactivityTimerRef.current);
    reviewInactivityTimerRef.current = window.setTimeout(() => {
      reviewInactivityTimerRef.current = null;
      returnToTopRef.current("review-inactivity");
    }, CONVERSATION_INACTIVITY_TIMEOUT_MS);
  }, []);

  const stopInteraction = useCallback((
    reason = "conversation:stop-interaction",
    cancelSpeechRecognition = true,
    stopSpeechOutput = true,
  ) => {
    if (miyabiIgnoreReleaseTimerRef.current !== null) {
      window.clearTimeout(miyabiIgnoreReleaseTimerRef.current);
      miyabiIgnoreReleaseTimerRef.current = null;
    }
    setIgnoreRecognitionDuringMiyabi(false);
    miyabiTtsInputIgnoredRef.current = false;
    miyabiResumeFromSessionRef.current = null;
    if (recognitionRestartTimerRef.current !== null) {
      window.clearTimeout(recognitionRestartTimerRef.current);
      recognitionRestartTimerRef.current = null;
    }
    if (softFinalizeTimerRef.current !== null) {
      window.clearTimeout(softFinalizeTimerRef.current);
      softFinalizeTimerRef.current = null;
    }
    if (hardFinalizeTimerRef.current !== null) {
      window.clearTimeout(hardFinalizeTimerRef.current);
      hardFinalizeTimerRef.current = null;
    }
    if (conversationInactivityTimerRef.current !== null) {
      window.clearTimeout(conversationInactivityTimerRef.current);
      conversationInactivityTimerRef.current = null;
    }
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    silenceStageRef.current = "NORMAL";
    if (reviewInactivityTimerRef.current !== null) {
      window.clearTimeout(reviewInactivityTimerRef.current);
      reviewInactivityTimerRef.current = null;
    }
    utteranceBufferRef.current = "";
    interimFallbackRef.current = "";
    utteranceSentRef.current = false;
    continuationHoldRef.current = null;
    shortAnswerGraceRef.current = null;
    lastUserSpeechEndAtRef.current = null;
    if (cancelSpeechRecognition) cancelRecognition();
    stopListening();
    if (stopSpeechOutput) {
      stopAssistantSpeech(`${reason}:partner-speech`);
      stopReviewSpeech(`${reason}:review-speech`);
      stopMiyabiSpeech(`${reason}:miyabi-speech`);
    }
    setPartnerExpression("neutral");
    setAwaitingUserInput(false);
    setHasRecognizedSpeech(false);
    setPhase("idle");
  }, [cancelRecognition, setIgnoreRecognitionDuringMiyabi, stopListening, stopAssistantSpeech, stopReviewSpeech, stopMiyabiSpeech]);

  const scheduleMicrophoneStart = useCallback((
    token: number,
    delay = ttsRecognitionRestartDelayMs(detectDeviceGroup()),
    continuation = false,
  ) => {
    if (lessonEndingRef.current) return;
    if (recognitionRestartTimerRef.current !== null) window.clearTimeout(recognitionRestartTimerRef.current);
    tossaPerf("SPEECH", "recognition restart requested", { generation: token, userTurnId: userTurnIdRef.current, delayMs: delay, continuation });
    speechDebug("recognition restart scheduled", { generation: token, userTurnId: userTurnIdRef.current, delay, continuation });
    recognitionRestartTimerRef.current = window.setTimeout(() => {
      recognitionRestartTimerRef.current = null;
      if (!mountedRef.current || startTokenRef.current !== token || requestBusyRef.current || lessonEndingRef.current) return;
      tossaPerf("SPEECH", "recognition restart timer fired", { generation: token, userTurnId: userTurnIdRef.current, delayMs: delay, continuation });
      speechDebug("recognition restart executed", { generation: token, userTurnId: userTurnIdRef.current, continuation });
      startMicrophoneRef.current(continuation ? token : undefined);
    }, delay);
  }, []);

  const queueAssistantSpeech = useCallback((text: string, token: number, onComplete?: () => void) => {
    recordConversationHistory({ kind: "ai", text });
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    cancelRecognition();
    stopListening();
    setPartnerExpression("neutral");
    setPhase("ttsPending");
    window.requestAnimationFrame(() => {
      if (!mountedRef.current || startTokenRef.current !== token) return;
      speakAssistantMessage(text, {
        rateMultiplier: speechRateMultiplierRef.current,
        onStart: () => {
          if (startTokenRef.current === token) {
            speechDebug("TTS start", { generation: token, userTurnId: userTurnIdRef.current });
            setPartnerExpression("neutral");
            setPhase("speaking");
          }
        },
        onFinish: (reason) => {
          if (startTokenRef.current !== token) return;
          speechDebug("TTS finish", { generation: token, userTurnId: userTurnIdRef.current, reason });
          tossaPerf("SPEECH", "TTS onend", { generation: token, userTurnId: userTurnIdRef.current, reason });
          setPartnerExpression("neutral");
          setPhase("idle");
          if (reason === "complete" && onComplete) onComplete();
          else if (reason === "complete" && !lessonEndingRef.current) scheduleMicrophoneStart(token);
          else if (reason === "error") setError("音声を再生できませんでした。返答は会話履歴で確認できます。");
        },
      });
    });
  }, [cancelRecognition, scheduleMicrophoneStart, stopListening, speakAssistantMessage]);

  const playReviewLecture = useCallback((parts: SpokenReviewPart[]) => {
    const items = buildSpokenReviewLecture(parts).map((item) => ({
      ...item,
      brightJapanese: conversationLanguage === "ja" && item.lang === "ja-JP",
      characterId: REVIEW_CHARACTER.id,
      avoidVoiceCharacterId: conversationLanguage === "ja" && item.lang === "ja-JP" ? partnerId ?? undefined : undefined,
      rateMultiplier: speechRateMultiplierRef.current,
    }));
    stopAssistantSpeech("conversation:review-replaces-partner-speech");
    speakReviewItems(items, {
      onItemStart: () => setReviewExpression("neutral"),
      onFinish: () => setReviewExpression("neutral"),
    }, REVIEW_CHARACTER.id);
  }, [conversationLanguage, partnerId, speakReviewItems, stopAssistantSpeech]);

  const announcePartnerSelection = useCallback((lessonAnnouncement: string, token: number) => {
    setPhase("ttsPending");
    window.requestAnimationFrame(() => {
      if (!mountedRef.current || startTokenRef.current !== token) return;
      const firstItem = { lang: "en-US" as const, text: lessonAnnouncement, rateMultiplier: speechRateMultiplierRef.current };
      const secondItem = { lang: "en-US" as const, text: PARTNER_SELECTION_PROMPT, rateMultiplier: speechRateMultiplierRef.current };
      const onItemStart = () => {
        if (startTokenRef.current === token) {
          setPartnerExpression("neutral");
          setPhase("speaking");
        }
      };
      const onGuideFinish = (reason: SpeechFinishReason) => {
        if (startTokenRef.current !== token) return;
        setPartnerExpression("neutral");
        setPhase("idle");
        if (reason !== "cancel") setPartnerSelectionReady(true);
        if (reason === "error") setError("音声を再生できませんでした。会話相手を選んで続けられます。");
      };
      const isIPad = /iPad/i.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      if (!isIPad) {
        speakCharacterItems([firstItem, secondItem], { onItemStart, onFinish: onGuideFinish }, REVIEW_CHARACTER.id);
        return;
      }

      let advancedToSecond = false;
      let firstEndWatchdog = 0;
      let secondStartWatchdog = 0;
      let secondStarted = false;
      const speakSecond = () => speakCharacterItems([secondItem], {
        onItemStart: () => {
          secondStarted = true;
          window.clearTimeout(secondStartWatchdog);
          onItemStart();
        },
        onFinish: onGuideFinish,
      }, REVIEW_CHARACTER.id);
      const advanceToSecond = () => {
        if (advancedToSecond || startTokenRef.current !== token) return;
        advancedToSecond = true;
        window.clearTimeout(firstEndWatchdog);
        speakSecond();
        secondStartWatchdog = window.setTimeout(() => {
          if (!secondStarted && startTokenRef.current === token) speakSecond();
        }, IPAD_EMMA_SECOND_UTTERANCE_WATCHDOG_MS);
      };
      speakCharacterItems([firstItem], {
        onItemStart: () => {
          onItemStart();
          firstEndWatchdog = window.setTimeout(advanceToSecond, IPAD_EMMA_FIRST_UTTERANCE_WATCHDOG_MS);
        },
        onFinish: (firstReason) => {
          if (advancedToSecond) return;
          window.clearTimeout(firstEndWatchdog);
          if (firstReason === "complete") advanceToSecond();
          else onGuideFinish(firstReason);
        },
      }, REVIEW_CHARACTER.id);
    });
  }, [speakCharacterItems]);

  const beginLesson = useCallback((nextTopic: TalkTopic) => {
    topicFlowStartedAtRef.current = performance.now();
    const topicType = isFreshTalkTopic(nextTopic) ? "fresh" : "fixed";
    tossaPerf("FLOW", "Talk Topic click / topic selected", { topicId: nextTopic.id, topicType });
    tossaPerf("FRESH", "selected topic", { topicId: nextTopic.id, topicType, topicTitle: nextTopic.title });
    ++startTokenRef.current;
    requestBusyRef.current = false;
    lessonEndingRef.current = false;
    stopInteraction("conversation:talk-topic-selected");
    unlockAppleTtsOnUserGesture("topic-fallback");
    setRescueBusy(false);
    setRescueMessage("");
    setTopic(nextTopic);
    setScene(null);
    setSceneComplication(null);
    setConversationMode("TOPIC");
    setFreeTalkSetup(null);
    setTopicAngle(null);
    setAvoidedTopicAngles([]);
    setShowIntro(false);
    setLessonStage("partnerSelect");
    setPartnerId(null);
    setPartnerSelectionReady(false);
    partnerOpeningStartedRef.current = null;
    setMessages([]);
    setReview(null);
    setSpokenReview([]);
    setReviewExpression("neutral");
    setError(null);
    setInterimCaption("");
    setElapsedSeconds(0);
    setBusy(false);
    pendingPartnerAnnouncementRef.current = `Today's topic is ${nextTopic.title}.`;
  }, [stopInteraction]);

  const beginSceneSelection = useCallback(() => {
    tossaPerf("FLOW", "Scene click");
    const token = ++startTokenRef.current;
    requestBusyRef.current = false;
    lessonEndingRef.current = false;
    stopInteraction("conversation:scene-selection-opened");
    unlockAppleTtsOnUserGesture("scene-fallback");
    setRescueBusy(false);
    setRescueMessage("");
    setTopic(null);
    setScene(null);
    setSceneComplication(null);
    setConversationMode("SCENE");
    setFreeTalkSetup(null);
    setShowIntro(false);
    setLessonStage("sceneSelect");
    setPartnerId(null);
    setPartnerSelectionReady(false);
    setMessages([]);
    setReview(null);
    setSpokenReview([]);
    setError(null);
    setInterimCaption("");
    setBusy(false);
    setPhase("ttsPending");
    window.requestAnimationFrame(() => {
      if (!mountedRef.current || startTokenRef.current !== token) return;
      tossaPerf("FLOW", "Scene TTS request");
      speakCharacterItems([{ lang: "en-US", text: SCENE_SELECTION_PROMPT, rateMultiplier: speechRateMultiplierRef.current }], {
        onItemStart: () => {
          if (startTokenRef.current !== token) return;
          setPartnerExpression("neutral");
          setPhase("speaking");
        },
        onFinish: (reason) => {
          if (startTokenRef.current !== token) return;
          setPartnerExpression("neutral");
          setPhase("idle");
          if (reason === "error") setError("音声を再生できませんでした。Sceneはそのまま選択できます。");
        },
      }, REVIEW_CHARACTER.id);
    });
  }, [speakCharacterItems, stopInteraction]);

  const cancelSceneSelection = useCallback(() => {
    startTokenRef.current += 1;
    requestBusyRef.current = false;
    lessonEndingRef.current = false;
    stopInteraction("conversation:scene-selection-canceled");
    setShowIntro(true);
    setLessonStage("partnerSelect");
    setTopic(null);
    setScene(null);
    setSceneComplication(null);
    setFreeTalkSetup(null);
    setPartnerId(null);
    setMessages([]);
    setError(null);
  }, [stopInteraction]);

  const beginScene = useCallback((sceneFamily: SceneRoleplay) => {
    ++startTokenRef.current;
    const nextScene = chooseSceneSituation(sceneFamily);
    const nextPartnerId = chooseScenePartner(nextScene, partnerId);
    tossaPerf("FLOW", "Scene selected", { sceneId: sceneFamily.id, situationId: nextScene.id, characterId: nextPartnerId });
    requestBusyRef.current = false;
    lessonEndingRef.current = false;
    stopInteraction("conversation:scene-selected");
    setRescueBusy(false);
    setRescueMessage("");
    setTopic(null);
    setScene(nextScene);
    sceneProgressRef.current = createSceneProgressState();
    setSceneComplication(chooseSceneComplication(nextScene));
    setConversationMode("SCENE");
    setFreeTalkSetup(null);
    setLessonStage("conversation");
    setPartnerId(nextPartnerId);
    setPartnerSelectionReady(false);
    partnerOpeningStartedRef.current = null;
    setMessages([]);
    setReview(null);
    setSpokenReview([]);
    setError(null);
    setInterimCaption("");
    setElapsedSeconds(0);
    setStartedAt(Date.now());
    setBusy(false);
  }, [partnerId, stopInteraction]);

  const beginFreeTalk = useCallback(() => {
    const selection = chooseFreeTalkCharacter(loadLastFreeTalkCharacter());
    const nextPartnerId = selection.selectedCharacter;
    saveLastFreeTalkCharacter(nextPartnerId);
    tossaPerf("FLOW", "Free Talk character selection", {
      mode: "random",
      candidateCount: selection.candidates.length,
      previousCharacter: selection.previousCharacter,
      excludedCharacter: selection.excludedCharacter,
      selectedCharacter: nextPartnerId,
    });
    const memorySelection = selectConversationMemoryForUse(
      loadConversationMemories(),
      loadLastUsedFreeTalkMemoryId(),
    );
    saveLastUsedFreeTalkMemoryId(memorySelection.selectedMemory?.id ?? null);
    tossaPerf("MEMORY", "Free Talk memory selection", {
      memoryAvailableCount: memorySelection.availableCount,
      memoryUseSelected: Boolean(memorySelection.selectedMemory),
      memoryUseProbability: memorySelection.probability,
      memorySelectedId: memorySelection.selectedMemory?.id ?? null,
      memoryExcludedId: memorySelection.excludedId,
      memoryReason: memorySelection.reason,
      memoryInjectedToPrompt: Boolean(memorySelection.selectedMemory),
    });
    ++startTokenRef.current;
    requestBusyRef.current = false;
    lessonEndingRef.current = false;
    stopInteraction("conversation:free-talk-selected");
    unlockAppleTtsOnUserGesture("topic-fallback");
    setConversationMode("FREE_TALK");
    setFreeTalkSetup({ ...chooseFreeTalkSetup(), memory: memorySelection.selectedMemory });
    setTopic(null);
    setScene(null);
    setSceneComplication(null);
    setTopicAngle(null);
    setAvoidedTopicAngles([]);
    setShowIntro(false);
    setLessonStage("conversation");
    setPartnerId(nextPartnerId);
    setPartnerSelectionReady(false);
    partnerOpeningStartedRef.current = null;
    setMessages([]);
    setReview(null);
    setSpokenReview([]);
    setError(null);
    setInterimCaption("");
    setElapsedSeconds(0);
    setStartedAt(Date.now());
    setBusy(false);
  }, [stopInteraction]);

  const selectPartner = (id: CharacterId) => {
    if (!partnerSelectionReady || requestBusyRef.current) return;
    tossaPerf("FLOW", "Partner selected", { characterId: id });
    startTokenRef.current += 1;
    lessonEndingRef.current = false;
    stopInteraction("conversation:partner-selected");
    setRescueBusy(false);
    setRescueMessage("");
    if (topic && id !== "miyabi") {
      const selection = chooseTopicAngle(topic, id);
      setTopicAngle(selection.angle);
      setAvoidedTopicAngles(selection.avoidedAngles);
    } else if (topic) {
      const selection = chooseTopicAngle(topic);
      setTopicAngle(selection.angle);
      setAvoidedTopicAngles([]);
    }
    setPartnerId(id);
    setLessonStage("conversation");
    setPartnerSelectionReady(false);
    setMessages([]);
    setError(null);
    setStartedAt(Date.now());
    setElapsedSeconds(0);
  };

  const selectAnyone = () => {
    const randomIndex = Math.floor(Math.random() * ENGLISH_CONVERSATION_PARTNER_IDS.length);
    selectPartner(ENGLISH_CONVERSATION_PARTNER_IDS[randomIndex]);
  };

  const cancelPartnerSelection = useCallback((trigger: ConversationCancelTrigger = "user") => {
    if (!shouldCancelConversation(trigger, {
      lessonStage,
      phase,
      partnerSelectionReady,
      reviewActive: Boolean(review),
    })) {
      tossaPerf("FLOW", "return to top ignored", { trigger, lessonStage, phase, partnerSelectionReady, reviewActive: Boolean(review) });
      return;
    }
    startTokenRef.current += 1;
    requestBusyRef.current = false;
    lessonEndingRef.current = false;
    stopInteraction(`conversation:partner-selection-canceled:${trigger}`);
    setRescueBusy(false);
    setRescueMessage("");
    partnerOpeningStartedRef.current = null;
    setShowIntro(true);
    setLessonStage("partnerSelect");
    setTopic(null);
    setScene(null);
    setSceneComplication(null);
    setFreeTalkSetup(null);
    setPartnerId(null);
    setPartnerSelectionReady(false);
    setMessages([]);
    setReview(null);
    setSpokenReview([]);
    setInterimCaption("");
    setElapsedSeconds(0);
    setBusy(false);
    setError(null);
  }, [lessonStage, partnerSelectionReady, phase, review, stopInteraction]);

  returnToTopRef.current = cancelPartnerSelection;

  const finishIntroOpening = useCallback(() => {
    if (showIntro) setIntroOpeningComplete(true);
  }, [showIntro]);

  useEffect(() => {
    mountedRef.current = true;
    const stopEmmaPrewarm = prewarmEmmaVoice();
    void loadFreshTopics().then((topics) => {
      if (mountedRef.current) setFreshTopics(topics);
    });
    return () => {
      stopEmmaPrewarm();
      mountedRef.current = false;
      startTokenRef.current += 1;
      if (miyabiIgnoreReleaseTimerRef.current !== null) window.clearTimeout(miyabiIgnoreReleaseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showIntro) return;
    setIntroOpeningComplete(false);
  }, [showIntro]);

  useEffect(() => {
    if (displayedStageBackground === desiredStageBackground) return;
    const frame = window.requestAnimationFrame(() => {
      setDisplayedStageBackground(desiredStageBackground);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [desiredStageBackground, displayedStageBackground]);

  useEffect(() => {
    tossaPerf("FLOW", "Character/background committed", {
      characterId: stageCharacter.id,
      background: displayedStageBackground,
    });
  }, [displayedStageBackground, stageCharacter.id]);

  useEffect(() => {
    const announcement = pendingPartnerAnnouncementRef.current;
    if (showIntro || lessonStage !== "partnerSelect" || partnerSelectionReady || !announcement) return;
    pendingPartnerAnnouncementRef.current = null;
    const token = startTokenRef.current;
    const frame = window.requestAnimationFrame(() => {
      const target = partnerListEndRef.current ?? partnerCancelRef.current;
      const needsScroll = target ? target.getBoundingClientRect().bottom > window.innerHeight - 12 : false;
      tossaPerf("FLOW", "Partner list rendered / scroll checked", {
        needsScroll,
        sinceTalkClickMs: topicFlowStartedAtRef.current === null ? null : performance.now() - topicFlowStartedAtRef.current,
      });
      if (needsScroll) target?.scrollIntoView({ behavior: "smooth", block: "end" });
      tossaPerf("FLOW", "Emma guide TTS requested", {
        sinceTalkClickMs: topicFlowStartedAtRef.current === null ? null : performance.now() - topicFlowStartedAtRef.current,
      });
      announcePartnerSelection(announcement, token);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [announcePartnerSelection, lessonStage, partnerSelectionReady, showIntro]);

  useEffect(() => {
    if (showIntro || lessonStage !== "partnerSelect") return;
    loadedPartnerThumbnailsRef.current.clear();
    tossaPerf("IMAGE", "partner list mounted", { expected: ENGLISH_PARTNERS.length + (scene ? 1 : 2) });
  }, [lessonStage, scene, showIntro]);

  useEffect(() => {
    if (showIntro || lessonStage !== "sceneSelect") return;
    const timer = window.setTimeout(() => returnToTopRef.current("selection-inactivity"), SELECTION_INACTIVITY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [lessonStage, showIntro]);

  useEffect(() => {
    if (showIntro || lessonStage !== "partnerSelect" || !partnerSelectionReady) return;
    const timer = window.setTimeout(() => returnToTopRef.current("selection-inactivity"), SELECTION_INACTIVITY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [lessonStage, partnerSelectionReady, showIntro]);

  useEffect(() => {
    if (lessonStage !== "conversation" || (conversationMode !== "FREE_TALK" && !topic && !scene) || !partnerId || review) return;
    if (conversationMode === "FREE_TALK" && !freeTalkSetup) return;
    const openingKey = `${topic?.id ?? scene?.id ?? "free-talk"}:${partnerId}`;
    if (partnerOpeningStartedRef.current === openingKey) return;
    partnerOpeningStartedRef.current = openingKey;
    if (!topicChangeHistoryRef.current) clearConversationHistory();
    topicChangeStateRef.current = null;
    const token = ++startTokenRef.current;
    requestBusyRef.current = true;
    setPhase("thinking");
    setBusy(true);
    const topicHistory = topic ? getRecentTopicHistory(topic) : [];
    const sameCharacterHistory = topicHistory.filter((entry) => entry.characterId === partnerId);
    const variation = topic && partnerId !== "miyabi"
      ? buildOpeningVariationContext(topic, partnerId)
      : undefined;
    const openingDiagnostics = topic ? {
      topicId: topic.id,
      topicTitle: topic.title,
      normalizedTitle: normalizeTopicTitle(topic.title),
      topicSource: isFreshTalkTopic(topic) ? "fresh" : "fixed",
      characterId: partnerId,
      selectedAngle: topicAngle,
      recentSameTopicCount: topicHistory.length,
      recentSameTopicCharacterCount: sameCharacterHistory.length,
      avoidedAngles: avoidedTopicAngles,
    } : { characterId: partnerId, lessonType: conversationMode === "FREE_TALK" ? "free-talk" : "scene" };
    tossaPerf("FLOW", "Opening request start", openingDiagnostics);
    if (import.meta.env.DEV) {
      console.debug("[TossaSpeak]", {
        Lesson: topic?.title ?? (scene ? `${scene.sceneTitle}: ${scene.title}` : "Free Talk"),
        Angle: topic ? topicAngle ?? "default topic guidance" : scene ? "scene role-play" : "none",
        Character: CHARACTER_PROFILES[partnerId].displayName,
      });
    }
    const openingRequest = conversationMode === "FREE_TALK"
      ? startFreeTalk(CHARACTER_PROFILES[partnerId], freeTalkSetup!, { generation: token, characterId: partnerId, lessonType: "free-talk" })
      : scene
        ? startSceneRoleplay(scene, CHARACTER_PROFILES[partnerId], sceneComplication, { generation: token, characterId: partnerId, lessonType: "scene" })
        : startTutorConversation(topic!, CHARACTER_PROFILES[partnerId], topicAngle, { generation: token, characterId: partnerId, lessonType: "topic" }, variation);
    void openingRequest
      .then((opening) => {
        if (!mountedRef.current || startTokenRef.current !== token) return;
        if (topic) recordConversationTopicHistory(topic, partnerId, topicAngle, opening);
        tossaPerf("FLOW", "Opening response", { ...openingDiagnostics, length: opening.length, opening });
        setError(null);
        const topicChangeHistory = topicChangeHistoryRef.current;
        topicChangeHistoryRef.current = null;
        setMessages(topicChangeHistory
          ? [...topicChangeHistory, { role: "assistant", content: opening }]
          : [{ role: "assistant", content: opening }]);
        queueAssistantSpeech(opening, token);
      })
      .catch((cause) => {
        if (!mountedRef.current || startTokenRef.current !== token) return;
        setError(friendlyError(cause));
        setPhase("idle");
      })
      .finally(() => {
        if (!mountedRef.current || startTokenRef.current !== token) return;
        requestBusyRef.current = false;
        setBusy(false);
      });
  }, [avoidedTopicAngles, conversationMode, freeTalkSetup, lessonStage, partnerId, queueAssistantSpeech, review, scene, sceneComplication, topic, topicAngle]);

  useEffect(() => {
    if (!review || !spokenReview.length) {
      reviewLectureStartedRef.current = null;
      return;
    }
    if (reviewLectureStartedRef.current === review) return;
    reviewLectureStartedRef.current = review;
    const timer = window.setTimeout(() => playReviewLecture(spokenReview), 400);
    return () => window.clearTimeout(timer);
  }, [playReviewLecture, review, spokenReview]);

  useEffect(() => {
    if (!review) return;
    armReviewInactivityTimer();
    return () => {
      if (reviewInactivityTimerRef.current !== null) {
        window.clearTimeout(reviewInactivityTimerRef.current);
        reviewInactivityTimerRef.current = null;
      }
    };
  }, [armReviewInactivityTimer, review]);

  useEffect(() => {
    if (review || lessonStage !== "conversation") return;
    const timer = window.setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [lessonStage, review, startedAt]);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, rescueMessage]);

  const requestLessonReview = async (reviewMessages: ChatMessage[], token: number) => {
    setBusy(true);
    setPhase("thinking");
    try {
      const result = await reviewTutorConversation(
        reviewMessages,
        conversationLanguage,
        topic ?? undefined,
        scene ? { situation: scene, usefulPhrases: getSceneUsefulPhrases(scene) } : undefined,
        { generation: token, characterId: partnerId ?? undefined, lessonType: scene ? "scene-review" : `${conversationMode.toLowerCase()}-review` },
      );
      if (!mountedRef.current || startTokenRef.current !== token) return;
      const displayModel = buildReviewDisplayModel(result.sections, result.spokenReview, conversationLanguage);
      tossaPerf("FLOW", "Review response received", {
        goodPointsCount: result.sections.goodPoints.length,
        correctionsCount: result.sections.corrections.length,
        alternativesCount: result.sections.alternatives.length,
        todayPointsCount: result.sections.todayPoints.length,
        spokenReviewCount: result.spokenReview.length,
        visibleSectionCount: displayModel.visibleSectionCount,
        usedFallback: displayModel.usedFallback,
      });
      setSpokenReview(result.spokenReview);
      setReview(result.sections);
      setPhase("idle");
    } catch (cause) {
      if (!mountedRef.current || startTokenRef.current !== token) return;
      setError(friendlyError(cause));
      setPhase("idle");
    } finally {
      if (mountedRef.current && startTokenRef.current === token) {
        requestBusyRef.current = false;
        setBusy(false);
      }
    }
  };

  const saveEligibleMemory = (completedMessages: ChatMessage[], token: number) => {
    if (conversationMode === "SCENE" || scene) {
      tossaPerf("MEMORY", "memory ignored", { reason: "scene role-play" });
      return;
    }
    void extractAndSaveConversationMemory(completedMessages, { generation: token });
  };

  const processUserTurn = async (snapshot: UserTurnSnapshot) => {
    if (!mountedRef.current || (conversationMode !== "FREE_TALK" && !topic && !scene) || !partnerId || lessonStage !== "conversation" || requestBusyRef.current || review) return;
    if (processedSnapshotIdsRef.current.has(snapshot.id)) return;
    processedSnapshotIdsRef.current.add(snapshot.id);
    requestBusyRef.current = true;
    const token = ++startTokenRef.current;
    stopInteraction("conversation:user-turn-processing");
    setPhase("thinking");
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: snapshot.text, semanticConfidence: snapshot.semanticConfidence, likelyIntent: snapshot.likelyIntent }];
    setMessages(nextMessages);
    setInterimCaption("");
    setRescueMessage("");
    setAwaitingUserInput(false);
    setError(null);
    setBusy(true);
    speechDebug("Gemini send snapshot", { snapshotId: snapshot.id, generation: snapshot.generation, text: snapshot.text });
    recordConversationHistory({ kind: "gemini", text: snapshot.text, data: {
      direction: "input", snapshotId: snapshot.id, sent: true,
      recognitionConfidence: snapshot.recognitionConfidence,
      semanticConfidence: snapshot.semanticConfidence,
      likelyIntent: snapshot.likelyIntent,
      conversationStateBefore: { mode: conversationMode, topicId: topic?.id ?? null, sceneId: scene?.id ?? null, pendingTopicChange: topicChangeStateRef.current?.state ?? null },
    } });
    tossaPerf("SPEECH", "Gemini request start", { snapshotId: snapshot.id, generation: snapshot.generation, userTurnId: snapshot.id, text: snapshot.text });
    if (conversationLanguage === "en") {
      const rateIntent = detectSpeechRateIntent(snapshot.text);
      if (rateIntent) onSpeechSpeedChange(applySpeechRateIntent(speechSpeed, rateIntent));
    }
    try {
      const pendingTopicChange = topicChangeStateRef.current;
      if (conversationMode === "TOPIC" && topic && pendingTopicChange?.state === "waitingForUserChoice" && snapshot.semanticConfidence === "high") {
        const delegated = delegatesTopicChoice(snapshot.text);
        const requestedTopic = delegated ? null : resolveRequestedTopic(snapshot.text, [...TALK_TOPICS, ...freshTopics], topic.id);
        if (!delegated && !requestedTopic) {
          const clarification = "What would you like to talk about? You can name a topic, or say, ‘You choose.’";
          const waitingMessages: ChatMessage[] = [...nextMessages, { role: "assistant", content: clarification }];
          setMessages(waitingMessages);
          tossaPerf("FLOW", "Topic change user choice", { text: snapshot.text, resolvedTopicId: null, selectionMode: "waiting", characterId: snapshot.characterId });
          queueAssistantSpeech(clarification, token);
          return;
        }
        const nextTopic = requestedTopic ?? chooseTopic(freshTopics, Math.random, topic.id);
        const nextAngle = chooseTopicAngle(nextTopic, snapshot.characterId as CharacterId);
        const acknowledgement = requestedTopic
          ? `Sure, let's talk about ${nextTopic.title.toLowerCase()}.`
          : "Sure, I'll choose something new.";
        const completedMessages: ChatMessage[] = [...nextMessages, { role: "assistant", content: acknowledgement }];
        setMessages(completedMessages);
        topicChangeHistoryRef.current = completedMessages;
        topicChangeStateRef.current = null;
        tossaPerf("FLOW", "Topic change user choice", {
          text: snapshot.text,
          resolvedTopicId: nextTopic.id,
          selectionMode: requestedTopic ? "user-choice" : "random",
          characterId: snapshot.characterId,
        });
        queueAssistantSpeech(acknowledgement, token, () => {
          if (!mountedRef.current || startTokenRef.current !== token) return;
          partnerOpeningStartedRef.current = null;
          topicChangeStateRef.current = null;
          setTopic(nextTopic);
          setTopicAngle(nextAngle.angle);
          setAvoidedTopicAngles(nextAngle.avoidedAngles);
        });
      } else if (conversationMode === "FREE_TALK") {
        const response = await continueFreeTalk(nextMessages, CHARACTER_PROFILES[snapshot.characterId as CharacterId], freeTalkSetup!, elapsedSeconds, { generation: snapshot.generation, snapshotId: snapshot.id, characterId: snapshot.characterId, lessonType: "free-talk" });
        if (!mountedRef.current || startTokenRef.current !== token) return;
        recordConversationHistory({ kind: "gemini", text: response.reply, data: { direction: "output", action: response.action, conversationStateAfter: { mode: conversationMode, ending: response.action === "CLOSE" && snapshot.semanticConfidence === "high" } } });
        const completedMessages: ChatMessage[] = [...nextMessages, { role: "assistant", content: response.reply }];
        setMessages(completedMessages);
        if (response.action === "CLOSE" && snapshot.semanticConfidence === "high") {
          lessonEndingRef.current = true;
          saveEligibleMemory(completedMessages, token);
          queueAssistantSpeech(response.reply, token, () => returnToTopRef.current("user"));
        } else {
          queueAssistantSpeech(response.reply, token);
        }
      } else if (scene) {
        const roleContract = createSceneRoleContract(scene);
        const roleConflict = detectsSceneRoleConflict(snapshot.text);
        if (roleConflict) {
          const repair = sceneRoleRepairPrompt(roleContract);
          recordConversationHistory({ kind: "decision", text: snapshot.text, data: { roleConflict: true, userRole: roleContract.userRole, partnerRole: roleContract.partnerRole, decision: "repair-role-contract", sceneStateBefore: sceneProgressRef.current, sceneStateAfter: sceneProgressRef.current } });
          const repairedMessages: ChatMessage[] = [...nextMessages, { role: "assistant", content: repair }];
          setMessages(repairedMessages);
          queueAssistantSpeech(repair, token);
          return;
        }
        const proposedResponse = await continueSceneRoleplay(scene, nextMessages, CHARACTER_PROFILES[snapshot.characterId as CharacterId], sceneComplication, { generation: snapshot.generation, snapshotId: snapshot.id, characterId: snapshot.characterId, lessonType: "scene" });
        if (!mountedRef.current || startTokenRef.current !== token) return;
        const sceneStateBefore = sceneProgressRef.current;
        const progression = applySceneProgression(sceneStateBefore, proposedResponse, snapshot.semanticConfidence);
        sceneProgressRef.current = progression.state;
        const response = progression.turn;
        recordConversationHistory({ kind: "gemini", text: response.reply, data: { direction: "output", action: response.action, modelSceneStatus: proposedResponse.sceneStatus, localSceneStatus: response.sceneStatus, goalReached: progression.state.goalReached, shouldCloseInteraction: progression.state.shouldCloseInteraction, sceneStateAfter: progression.state } });
        recordConversationHistory({ kind: "decision", text: "scene progression", data: { sceneStatusBefore: sceneStateBefore.sceneStatus, sceneStatusAfter: progression.state.sceneStatus, goalReached: progression.state.goalReached, closingResponseGenerated: progression.state.closingResponseGenerated, closingTtsFinished: progression.state.closingTtsFinished, shouldCloseInteraction: progression.state.shouldCloseInteraction, sceneCompletionGateReason: progression.reasons } });
        tossaPerf("FLOW", "Scene completion decision", {
          sceneId: scene.id,
          sceneGoal: scene.goal,
          sceneStatus: response.sceneStatus,
          goalReached: response.goalReached,
          completionReason: response.completionReason,
          userTurn: snapshot.text,
        });
        const completedMessages: ChatMessage[] = [...nextMessages, { role: "assistant", content: response.reply }];
        setMessages(completedMessages);
        if (progression.goalAccepted) {
          lessonEndingRef.current = true;
          sceneProgressRef.current = beginSceneClosing(progression.state);
          recordConversationHistory({ kind: "decision", text: "scene closing", data: { sceneStatusBefore: "GOAL_REACHED", sceneStatusAfter: "CLOSING", goalReached: true, closingResponseGenerated: true, closingTtsFinished: false, shouldCloseInteraction: false } });
          queueAssistantSpeech(response.reply, token, () => {
            if (!mountedRef.current || startTokenRef.current !== token) return;
            sceneProgressRef.current = finishSceneClosing(sceneProgressRef.current);
            recordConversationHistory({ kind: "decision", text: "scene completed", data: { sceneStatusBefore: "CLOSING", sceneStatusAfter: sceneProgressRef.current.sceneStatus, goalReached: sceneProgressRef.current.goalReached, closingResponseGenerated: sceneProgressRef.current.closingResponseGenerated, closingTtsFinished: sceneProgressRef.current.closingTtsFinished, shouldCloseInteraction: sceneProgressRef.current.shouldCloseInteraction } });
            requestBusyRef.current = true;
            void requestLessonReview(completedMessages, token);
          });
        } else if (response.action === "CLOSE") {
          lessonEndingRef.current = true;
          queueAssistantSpeech(response.reply, token, () => {
            if (!mountedRef.current || startTokenRef.current !== token) return;
            returnToTopRef.current("user");
          });
        } else {
          queueAssistantSpeech(response.reply, token);
        }
      } else {
        const response = await continueTutorConversation(topic!, nextMessages, CHARACTER_PROFILES[snapshot.characterId as CharacterId], topicAngle, { generation: snapshot.generation, snapshotId: snapshot.id, characterId: snapshot.characterId, lessonType: "topic" });
        if (!mountedRef.current || startTokenRef.current !== token) return;
        const topicChangeDetected = snapshot.semanticConfidence === "high" && detectsTopicChangeIntent(snapshot.text);
        const action = snapshot.semanticConfidence !== "high" && (response.action === "CHANGE_TOPIC" || response.action === "CLOSE")
          ? "WAIT" : topicChangeDetected ? "CHANGE_TOPIC" : response.action;
        recordConversationHistory({ kind: "gemini", text: response.reply, data: { direction: "output", modelAction: response.action, gatedAction: action, conversationStateAfter: { mode: conversationMode, topicChange: action === "CHANGE_TOPIC", ending: action === "CLOSE" } } });
        const reply = action === "CHANGE_TOPIC" && response.action !== "CHANGE_TOPIC"
          ? conversationLanguage === "ja" ? "もちろん。別の話題にしよう。" : "Sure, let's talk about something else."
          : response.reply;
        const completedMessages: ChatMessage[] = [...nextMessages, { role: "assistant", content: reply }];
        setMessages(completedMessages);
        if (action === "CHANGE_TOPIC") {
          const delegated = delegatesTopicChoice(snapshot.text);
          if (delegated) {
            const nextTopic = chooseTopic(freshTopics, Math.random, topic!.id);
            const nextAngle = chooseTopicAngle(nextTopic, snapshot.characterId as CharacterId);
            const delegatedReply = conversationLanguage === "ja" ? "もちろん。別の話題を選ぶね。" : "Sure, I'll choose something new.";
            const delegatedMessages: ChatMessage[] = [...nextMessages, { role: "assistant", content: delegatedReply }];
            setMessages(delegatedMessages);
            topicChangeHistoryRef.current = delegatedMessages;
            topicChangeStateRef.current = null;
            tossaPerf("FLOW", "Topic change requested", { state: "delegated", fromTopicId: topic!.id, toTopicId: nextTopic.id, characterId: snapshot.characterId, modelAction: response.action });
            queueAssistantSpeech(delegatedReply, token, () => {
              if (!mountedRef.current || startTokenRef.current !== token) return;
              partnerOpeningStartedRef.current = null;
              topicChangeStateRef.current = null;
              setTopic(nextTopic);
              setTopicAngle(nextAngle.angle);
              setAvoidedTopicAngles(nextAngle.avoidedAngles);
            });
          } else {
            const waitingReply = conversationLanguage === "ja"
              ? "もちろん。次は何について話したい？"
              : "Sure, let's talk about something else. What would you like to talk about?";
            const waitingMessages: ChatMessage[] = [...nextMessages, { role: "assistant", content: waitingReply }];
            setMessages(waitingMessages);
            topicChangeStateRef.current = { state: "waitingForUserChoice", fromTopicId: topic!.id };
            tossaPerf("FLOW", "Topic change state", { state: "waitingForUserChoice", fromTopicId: topic!.id, characterId: snapshot.characterId });
            queueAssistantSpeech(waitingReply, token);
          }
        } else if (action === "CLOSE") {
          lessonEndingRef.current = true;
          saveEligibleMemory(completedMessages, token);
          queueAssistantSpeech(reply, token, () => {
            if (!mountedRef.current || startTokenRef.current !== token) return;
            requestBusyRef.current = true;
            void requestLessonReview(completedMessages, token);
          });
        } else {
          queueAssistantSpeech(reply, token);
        }
      }
    } catch (cause) {
      if (mountedRef.current && startTokenRef.current === token) {
        setError(friendlyError(cause));
        setPhase("idle");
      }
    } finally {
      if (mountedRef.current && startTokenRef.current === token) {
        requestBusyRef.current = false;
        setBusy(false);
      }
    }
  };

  const startMicrophone = (continuationToken?: number) => {
    const continuing = continuationToken !== undefined;
    if ((conversationMode !== "FREE_TALK" && !topic && !scene) || !partnerId || lessonStage !== "conversation" || review || lessonEndingRef.current || requestBusyRef.current || (!continuing && recognitionActive)) return;
    const token = continuationToken ?? ++startTokenRef.current;
    if (continuing) {
      if (startTokenRef.current !== token) return;
    } else {
      stopInteraction("conversation:microphone-manual-start");
      userTurnIdRef.current += 1;
      utteranceSentRef.current = false;
      interimFallbackRef.current = "";
      recognitionProgressRef.current = { previousTranscript: "", lastResultAt: null, lastGrowthAt: null, recentGrowth: [], latestIsFinal: false };
      utteranceEngineRef.current = createUtteranceEngineState();
      utteranceHoldRef.current = 0;
      shortAnswerGraceRef.current = null;
      lastUserSpeechEndAtRef.current = null;
      continuationHoldRef.current = null;
      softTimerExtendedRef.current = false;
      softTimeoutDecisionRef.current = classifyUserTurnSoftTimeout({
        transcript: "",
        language: conversationLanguage,
        lastResultIntervalMs: null,
        recentGrowthCount: 0,
      });
      setError(null);
      setMicrophoneFallback(false);
    }
    const userTurnId = userTurnIdRef.current;
    const deviceGroup = detectDeviceGroup();
    const finalizeUserTurn = (reason: "soft" | "hard") => {
      const guardState = {
        mounted: mountedRef.current,
        tokenMatched: startTokenRef.current === token,
        requestBusy: requestBusyRef.current,
        review: Boolean(review),
        utteranceSent: utteranceSentRef.current,
        miyabiInputIgnored: miyabiTtsInputIgnoredRef.current,
        bufferLength: utteranceBufferRef.current.length,
        fallbackLength: interimFallbackRef.current.length,
      };
      if (!guardState.mounted || !guardState.tokenMatched || guardState.requestBusy || guardState.review || guardState.utteranceSent || guardState.miyabiInputIgnored) {
        tossaPerf("SPEECH", "finalizeUserTurn blocked", { generation: token, userTurnId, reason, ...guardState });
        return;
      }
      const snapshotSelection = selectUserTurnSnapshotText(utteranceBufferRef.current, interimFallbackRef.current);
      const fallbackSnapshotUsed = snapshotSelection.snapshotSelectionReason === "interim-fallback";
      const snapshotText = snapshotSelection.selectedSnapshot;
      const turnDecision = decideUtteranceTurn(utteranceEngineRef.current, {
        candidate: snapshotText,
        previousAssistantText: [...messages].reverse().find((message) => message.role === "assistant")?.content,
        language: conversationLanguage,
        now: performance.now(),
        hardDeadline: reason === "hard",
        hasHeld: utteranceHoldRef.current > 0,
        holdCount: utteranceHoldRef.current,
        deviceTimingProfile: deviceGroup,
      });
      const activeGrace = shortAnswerGraceRef.current?.userTurnId === userTurnId ? shortAnswerGraceRef.current : null;
      recordConversationHistory({
        kind: "decision",
        text: snapshotText,
        data: {
          action: turnDecision.action,
          completion: turnDecision.completion,
          recognitionConfidence: turnDecision.recognitionConfidence,
          semanticConfidence: turnDecision.semanticConfidence,
          likelyIntent: turnDecision.likelyIntent,
          previousTurnExpectation: turnDecision.previousTurnExpectation,
          shortAnswerDetected: turnDecision.shortAnswerDetected,
          shortAnswerContinuationLikelihood: turnDecision.shortAnswerContinuationLikelihood,
          shortAnswerGraceStarted: turnDecision.shortAnswerGraceStarted,
          shortAnswerGraceMs: turnDecision.shortAnswerGraceMs,
          additionalFragmentReceived: activeGrace?.additionalFragmentReceived ?? false,
          turnMerged: (activeGrace?.mergeCount ?? 0) > 0,
          turnMergeCount: activeGrace?.mergeCount ?? 0,
          answerAdequacy: turnDecision.answerAdequacy,
          turnCompletionType: turnDecision.turnCompletionType,
          turnConfidence: turnDecision.turnConfidence,
          userSpeechEndToCommitMs: turnDecision.action === "commitUtterance" && lastUserSpeechEndAtRef.current !== null
            ? Math.max(0, performance.now() - lastUserSpeechEndAtRef.current) : null,
          clarificationLevel: turnDecision.clarificationLevel,
          holdCount: utteranceHoldRef.current,
          syntacticCompletion: turnDecision.syntacticCompletion,
          semanticLanding: turnDecision.semanticLanding,
          couldContinue: turnDecision.couldContinue,
          needsContinuation: turnDecision.needsContinuation,
          completionScore: turnDecision.completionScore,
          reasons: turnDecision.reasons,
          rawTranscript: utteranceEngineRef.current.rawTranscript,
        },
      });
      if (turnDecision.action === "continueListening") {
        utteranceHoldRef.current = Math.min(2, utteranceHoldRef.current + 1);
        if (turnDecision.shortAnswerGraceStarted) {
          shortAnswerGraceRef.current = { userTurnId, startedAt: performance.now(), initialText: snapshotText, additionalFragmentReceived: false, mergeCount: 0 };
        }
        speechDebug("Utterance Engine continues listening", { generation: token, userTurnId, ...turnDecision });
        tossaPerf("SPEECH", "utterance decision", { generation: token, userTurnId, ...turnDecision });
        softFinalizeTimerRef.current = window.setTimeout(() => finalizeUserTurn("hard"), turnDecision.retryAfterMs);
        return;
      }
      if (turnDecision.action === "ignoreNoise") return;
      if (turnDecision.action === "requestClarification") {
        utteranceSentRef.current = true;
        utteranceBufferRef.current = "";
        interimFallbackRef.current = "";
        utteranceEngineRef.current = createUtteranceEngineState();
        if (softFinalizeTimerRef.current !== null) window.clearTimeout(softFinalizeTimerRef.current);
        if (hardFinalizeTimerRef.current !== null) window.clearTimeout(hardFinalizeTimerRef.current);
        softFinalizeTimerRef.current = hardFinalizeTimerRef.current = null;
        cancelRecognition();
        stopListening();
        setAwaitingUserInput(false);
        const repeatedFullClarification = turnDecision.clarificationLevel === 3 && consecutiveFullClarificationsRef.current >= 1;
        const clarification = conversationLanguage === "ja"
          ? repeatedFullClarification ? "大事な言葉だけ、短く教えてもらえる？" : "ごめん、もう一度言ってもらえる？"
          : repeatedFullClarification ? "Could you tell me just the key words?" : turnDecision.clarificationPrompt ?? "Sorry, what was that?";
        if (turnDecision.clarificationLevel === 3) consecutiveFullClarificationsRef.current += 1;
        setMessages((current) => [...current, { role: "assistant", content: clarification }]);
        queueAssistantSpeech(clarification, token);
        return;
      }
      const snapshot = createUserTurnSnapshot({
        id: userTurnId,
        generation: token,
        text: snapshotText,
        language: conversationLanguage,
        characterId: partnerId,
        recognitionConfidence: turnDecision.recognitionConfidence,
        semanticConfidence: turnDecision.semanticConfidence,
        likelyIntent: turnDecision.likelyIntent,
      });
      if (!snapshot) {
        tossaPerf("SPEECH", "finalizeUserTurn blocked", { generation: token, userTurnId, reason, ...guardState, emptyBuffer: true });
        return;
      }
      utteranceSentRef.current = true;
      consecutiveFullClarificationsRef.current = 0;
      speechDebug("UserTurn finalized / Snapshot created", { generation: token, userTurnId, reason, snapshotId: snapshot.id, fallbackSnapshotUsed, ...snapshotSelection, text: snapshot.text });
      tossaPerf("SPEECH", "snapshot", { generation: token, userTurnId, reason, snapshotId: snapshot.id, fallbackSnapshotUsed, ...snapshotSelection, text: snapshot.text });
      utteranceBufferRef.current = "";
      recognitionProgressRef.current = { previousTranscript: "", lastResultAt: null, lastGrowthAt: null, recentGrowth: [], latestIsFinal: false };
      continuationHoldRef.current = null;
      shortAnswerGraceRef.current = null;
      softTimerExtendedRef.current = false;
      interimFallbackRef.current = "";
      utteranceEngineRef.current = createUtteranceEngineState();
      speechDebug("utterance buffer cleared", { generation: token, userTurnId, buffer: utteranceBufferRef.current });
      if (softFinalizeTimerRef.current !== null) window.clearTimeout(softFinalizeTimerRef.current);
      if (hardFinalizeTimerRef.current !== null) window.clearTimeout(hardFinalizeTimerRef.current);
      softFinalizeTimerRef.current = hardFinalizeTimerRef.current = null;
      cancelRecognition();
      stopListening();
      setAwaitingUserInput(false);
      void processUserTurn(snapshot);
    };
    const resetUserTurnTimers = (activity: string, decision = softTimeoutDecisionRef.current) => {
      lastActivityAtRef.current = performance.now();
      speechDebug("user turn activity", { generation: token, userTurnId, activity, lastActivityAt: lastActivityAtRef.current });
      if ((!utteranceBufferRef.current && !interimFallbackRef.current) || utteranceSentRef.current) return;
      if (softFinalizeTimerRef.current !== null) window.clearTimeout(softFinalizeTimerRef.current);
      if (hardFinalizeTimerRef.current !== null) window.clearTimeout(hardFinalizeTimerRef.current);
      const softTimeoutMs = decision.timeoutMs;
      speechDebug("utterance timers start/reset", { generation: token, userTurnId, activity, deviceGroup, softTimerKind: decision.kind, softMs: softTimeoutMs, hardMs: HARD_UTTERANCE_TIMEOUT_MS });
      const fireSoftTimer = (alreadyExtended: boolean) => {
        softFinalizeTimerRef.current = null;
        const now = performance.now();
        const progress = recognitionProgressRef.current;
        const recentGrowthCount = progress.recentGrowth.filter(Boolean).length;
        const lastGrowthAgeMs = progress.lastGrowthAt === null ? null : Math.max(0, now - progress.lastGrowthAt);
        const lastResultAgeMs = progress.lastResultAt === null ? null : Math.max(0, now - progress.lastResultAt);
        const holdState = continuationHoldRef.current;
        const continuationHold = holdState?.userTurnId === userTurnId
          && now - holdState.startedAt <= CONTINUATION_HOLD_MS;
        const fireDecision = decideSoftTimerFire({
          recentGrowthCount,
          lastGrowthAgeMs,
          lastResultAgeMs,
          continuationHold,
          latestIsFinal: progress.latestIsFinal,
          alreadyExtended,
        });
        speechDebug("soft timer fired", { generation: token, userTurnId, extended: fireDecision.extend, reason: fireDecision.reason });
        tossaPerf("SPEECH", "soft timer fire", {
          generation: token,
          userTurnId,
          timeoutMs: softTimeoutMs,
          softTimerKind: decision.kind,
          deviceGroup,
          recentGrowthCount,
          lastGrowthAgeMs,
          lastResultAgeMs,
          continuationHold,
          latestIsFinal: progress.latestIsFinal,
          extended: fireDecision.extend,
          extensionReason: fireDecision.reason,
        });
        if (fireDecision.extend) {
          softTimerExtendedRef.current = true;
          softFinalizeTimerRef.current = window.setTimeout(() => fireSoftTimer(true), fireDecision.extensionMs);
          return;
        }
        finalizeUserTurn("soft");
      };
      softFinalizeTimerRef.current = window.setTimeout(() => fireSoftTimer(softTimerExtendedRef.current), softTimeoutMs);
      // This remains as a safety ceiling. Because both timers reset together,
      // the soft timer normally finalizes the turn before this one can fire.
      hardFinalizeTimerRef.current = window.setTimeout(() => {
        hardFinalizeTimerRef.current = null;
        speechDebug("hard timer fired", { generation: token, userTurnId });
        finalizeUserTurn("hard");
      }, HARD_UTTERANCE_TIMEOUT_MS);
    };
    startRecognition({
      onStart: () => {
        if (startTokenRef.current !== token || lessonEndingRef.current) return;
        if (miyabiResumeFromSessionRef.current !== null) {
          tossaPerf("SPEECH", "Miyabi help recognition resumed", {
            generation: token,
            userTurnId,
            oldSessionId: miyabiResumeFromSessionRef.current,
            newSessionId: getRecognitionSessionId(),
          });
          miyabiResumeFromSessionRef.current = null;
        }
        speechDebug("recognition start", { generation: token, userTurnId, continuing });
        setPhase("recognizing");
        tossaPerf("SPEECH", "UI_STATE_LISTENING", { generation: token, userTurnId, continuing });
        setAwaitingUserInput(true);
        if (!continuing) {
          setHasRecognizedSpeech(false);
        }
        armSilenceTimer(false);
        startListening();
      },
      onActivity: (activity) => {
        if (startTokenRef.current !== token || utteranceSentRef.current) return;
        resetUserTurnTimers(activity);
      },
      onFinalTranscript: (text) => {
        if (startTokenRef.current !== token || utteranceSentRef.current) return;
        const before = utteranceBufferRef.current;
        utteranceBufferRef.current = mergeSpeechTranscript(before, text, conversationLanguage);
        const grace = shortAnswerGraceRef.current;
        if (grace?.userTurnId === userTurnId && text.trim() && utteranceBufferRef.current.trim() !== grace.initialText.trim()) {
          grace.additionalFragmentReceived = true;
          grace.mergeCount += 1;
          recordConversationHistory({ kind: "decision", text: utteranceBufferRef.current, data: { additionalFragmentReceived: true, turnMerged: true, turnMergeCount: grace.mergeCount, shortAnswerGraceMs: Math.max(0, performance.now() - grace.startedAt) } });
        }
        utteranceEngineRef.current = observeUtteranceRecognition(utteranceEngineRef.current, {
          transcript: text,
          isFinal: true,
          sessionId: recognitionSessionIdRef.current,
          timestamp: performance.now(),
        });
        recordConversationHistory({ kind: "stt", text, data: { final: true, sessionId: recognitionSessionIdRef.current } });
        interimFallbackRef.current = "";
        if (text.trim()) {
          setHasRecognizedSpeech(true);
          armConversationInactivityTimer();
          armSilenceTimer(true);
        }
        speechDebug("utterance buffer changed", { generation: token, userTurnId, before, after: utteranceBufferRef.current, final: text });
        tossaPerf("SPEECH", "final result", { generation: token, userTurnId, text });
        if (showConversationCaptions) setInterimCaption(utteranceBufferRef.current);
        resetUserTurnTimers("final result");
      },
      onSpeechStart: () => {
        if (startTokenRef.current !== token) return;
        speechDebug("speechstart", { generation: token, userTurnId, buffer: utteranceBufferRef.current });
      },
      onSpeechEnd: () => {
        if (startTokenRef.current === token) {
          lastUserSpeechEndAtRef.current = performance.now();
          speechDebug("speechend", { generation: token, userTurnId, buffer: utteranceBufferRef.current });
          tossaPerf("SPEECH", "onspeechend/onsoundend", { generation: token, userTurnId, buffer: utteranceBufferRef.current });
        }
      },
      onTranscript: (text, resultDetails) => {
        if (startTokenRef.current !== token || utteranceSentRef.current) return;
        speechDebug("transcript display", { generation: token, userTurnId, transcript: text, buffer: utteranceBufferRef.current });
        if (text.trim()) {
          const grace = shortAnswerGraceRef.current;
          const preview = mergeSpeechTranscript(utteranceBufferRef.current, text, conversationLanguage).trim();
          if (grace?.userTurnId === userTurnId && preview && preview !== grace.initialText.trim() && !grace.additionalFragmentReceived) {
            grace.additionalFragmentReceived = true;
            grace.mergeCount += 1;
            recordConversationHistory({ kind: "decision", text: preview, data: { additionalFragmentReceived: true, turnMerged: true, turnMergeCount: grace.mergeCount, shortAnswerGraceMs: Math.max(0, performance.now() - grace.startedAt) } });
          }
          utteranceEngineRef.current = observeUtteranceRecognition(utteranceEngineRef.current, {
            transcript: text,
            isFinal: resultDetails.hasFinal && !resultDetails.hasInterim,
            sessionId: recognitionSessionIdRef.current,
            timestamp: performance.now(),
          });
          recordConversationHistory({ kind: "stt", text, data: { final: resultDetails.hasFinal && !resultDetails.hasInterim, interim: resultDetails.hasInterim, sessionId: recognitionSessionIdRef.current } });
          interimFallbackRef.current = text.trim();
          setHasRecognizedSpeech(true);
          armConversationInactivityTimer();
          armSilenceTimer(true);
        }
        if (showConversationCaptions) {
          setInterimCaption(mergeSpeechTranscript(utteranceBufferRef.current, text, conversationLanguage));
        }
        if (text.trim()) {
          const now = performance.now();
          softTimerExtendedRef.current = false;
          const progress = recognitionProgressRef.current;
          const lastResultIntervalMs = progress.lastResultAt === null ? null : now - progress.lastResultAt;
          const grew = text.trim().length > progress.previousTranscript.trim().length;
          const recentGrowth = [...progress.recentGrowth, grew].slice(-3);
          const recentGrowthCount = recentGrowth.filter(Boolean).length;
          recognitionProgressRef.current = {
            previousTranscript: text,
            lastResultAt: now,
            lastGrowthAt: grew ? now : progress.lastGrowthAt,
            recentGrowth,
            latestIsFinal: resultDetails.hasFinal && !resultDetails.hasInterim,
          };
          const previousSoftTimerKind = softTimeoutDecisionRef.current.kind;
          const holdState = continuationHoldRef.current;
          const holdAgeMs = holdState?.userTurnId === userTurnId ? now - holdState.startedAt : null;
          const continuationHoldActive = holdAgeMs !== null && holdAgeMs <= CONTINUATION_HOLD_MS;
          if (holdState && !continuationHoldActive) continuationHoldRef.current = null;
          const decision = classifyUserTurnSoftTimeout({
            transcript: text,
            language: conversationLanguage,
            lastResultIntervalMs,
            recentGrowthCount,
            continuationHold: continuationHoldActive,
          });
          const organicallyContinuing = decision.kind === "likelyContinuing" && !decision.reasons.includes("continuation-hold");
          if (organicallyContinuing && decision.wordCount >= CONTINUATION_HOLD_MIN_WORDS) {
            continuationHoldRef.current = { userTurnId, startedAt: now };
          }
          softTimeoutDecisionRef.current = decision;
          tossaPerf("SPEECH", "soft timer decision", {
            softTimerKind: decision.kind,
            softTimeoutMs: decision.timeoutMs,
            transcriptLength: decision.transcriptLength,
            wordCount: decision.wordCount,
            lastWord: decision.lastWord,
            lastResultIntervalMs: decision.lastResultIntervalMs,
            recentGrowthCount: decision.recentGrowthCount,
            continuationHold: decision.continuationHold,
            previousSoftTimerKind,
            holdAgeMs,
            reasons: decision.reasons,
          });
          resetUserTurnTimers("transcript", decision);
        }
      },
      onDebug: (recognitionSessionId, event, details) => {
        recognitionSessionIdRef.current = recognitionSessionId;
        speechDebug(event, { generation: token, userTurnId, recognitionSessionId, ...details });
      },
      onEnd: (text, details) => {
        if (startTokenRef.current !== token || utteranceSentRef.current) return;
        const retainedInterim = !details.final.trim() && Boolean(details.interim.trim());
        if (retainedInterim) {
          interimFallbackRef.current = text.trim();
          resetUserTurnTimers("recognition onend interim fallback");
        }
        speechDebug("recognition onend", { generation: token, userTurnId, buffer: utteranceBufferRef.current, currentTranscript: text, final: details.final, interim: details.interim, retainedInterim });
        tossaPerf("SPEECH", "recognition continuation", { generation: token, userTurnId, currentTranscript: text, retainedInterim });
        stopListening();
        setPhase("idle");
        scheduleMicrophoneStart(token, 100, true);
      },
      onCancel: () => {
        if (startTokenRef.current !== token) return;
        stopListening();
        setPhase("idle");
      },
      onError: (reason) => {
        if (startTokenRef.current !== token) return;
        stopListening();
        setPhase("idle");
        if (reason === "aborted") return;
        if (reason === "no-speech" || (utteranceBufferRef.current && reason !== "not-allowed" && reason !== "service-not-allowed")) {
          scheduleMicrophoneStart(token, 100, true);
          return;
        }
        setMicrophoneFallback(true);
        setError(reason === "not-allowed" || reason === "service-not-allowed" ? "マイクの使用が許可されていません。ブラウザの設定を確認してください。"
          : reason === "unsupported" ? "このブラウザは音声認識に対応していません。テキストで入力できます。"
          : "音声認識を開始・継続できませんでした。もう一度お試しください。");
      },
    }, speechLocale);
  };
  startMicrophoneRef.current = startMicrophone;

  const requestRescue = async () => {
    if (conversationLanguage !== "en" || !awaitingUserInput || hasRecognizedSpeech || rescueBusy || requestBusyRef.current || !partnerId) return;
    const lastAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant")?.content;
    if (!lastAssistantMessage) return;
    const iosMiyabiTtsMode = detectDeviceGroup() === "ios";
    const recognitionSessionBefore = getRecognitionSessionId();
    const token = iosMiyabiTtsMode ? startTokenRef.current : ++startTokenRef.current;
    if (iosMiyabiTtsMode) {
      if (recognitionRestartTimerRef.current !== null) {
        window.clearTimeout(recognitionRestartTimerRef.current);
        recognitionRestartTimerRef.current = null;
      }
      if (softFinalizeTimerRef.current !== null) window.clearTimeout(softFinalizeTimerRef.current);
      if (hardFinalizeTimerRef.current !== null) window.clearTimeout(hardFinalizeTimerRef.current);
      softFinalizeTimerRef.current = hardFinalizeTimerRef.current = null;
      if (silenceTimerRef.current !== null) {
        window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      cancelRecognition();
      stopListening();
      miyabiTtsInputIgnoredRef.current = true;
      setIgnoreRecognitionDuringMiyabi(true);
      setAwaitingUserInput(false);
      tossaPerf("SPEECH", "Miyabi help recognition stop requested", {
        generation: token,
        userTurnId: userTurnIdRef.current,
        oldSessionId: recognitionSessionBefore,
      });
      tossaPerf("SPEECH", "Miyabi help watchdog cleared", {
        generation: token,
        userTurnId: userTurnIdRef.current,
        oldSessionId: recognitionSessionBefore,
      });
    } else {
      requestBusyRef.current = true;
      stopInteraction("conversation:miyabi-rescue-requested");
    }
    setRescueBusy(true);
    setRescueMessage("");
    setError(null);
    setBusy(true);
    setPhase("thinking");
    try {
      const explanation = await explainEnglishMessageInJapanese(lastAssistantMessage, CHARACTER_PROFILES[partnerId], { generation: token, characterId: partnerId, lessonType: `${conversationMode.toLowerCase()}-rescue` });
      if (!mountedRef.current || startTokenRef.current !== token) return;
      setRescueMessage(explanation);
      setBusy(false);
      setPhase("ttsPending");
      tossaPerf("SPEECH", "Miyabi TTS request", { generation: token, userTurnId: userTurnIdRef.current });
      speakMiyabiItems([{ lang: "ja-JP", text: explanation, characterId: "miyabi" }], {
        onItemStart: () => {
          if (startTokenRef.current === token) {
            setPhase("speaking");
            if (iosMiyabiTtsMode) {
              tossaPerf("SPEECH", "Miyabi TTS start", {
                generation: token,
                userTurnId: userTurnIdRef.current,
                recognitionSessionBefore,
                recognitionSessionAfter: getRecognitionSessionId(),
              });
            }
          }
        },
        onFinish: (reason) => {
          if (!mountedRef.current || startTokenRef.current !== token) return;
          if (iosMiyabiTtsMode) {
            tossaPerf("SPEECH", "Miyabi TTS end", {
              generation: token,
              userTurnId: userTurnIdRef.current,
              reason,
              recognitionSessionBefore,
              recognitionSessionAfter: getRecognitionSessionId(),
            });
            setIgnoreRecognitionDuringMiyabi(false);
            miyabiTtsInputIgnoredRef.current = false;
            setPhase("idle");
            setRescueBusy(false);
            setBusy(false);
            if (reason === "complete") {
              miyabiResumeFromSessionRef.current = recognitionSessionBefore;
              tossaPerf("SPEECH", "Miyabi help recognition resume requested", {
                generation: token,
                userTurnId: userTurnIdRef.current,
                oldSessionId: recognitionSessionBefore,
                delayMs: 750,
              });
              scheduleMicrophoneStart(token, 750, true);
            } else if (reason === "error") {
              setError("日本語の説明を再生できませんでした。音声入力を再開してください。");
              miyabiResumeFromSessionRef.current = recognitionSessionBefore;
              scheduleMicrophoneStart(token, 750, true);
            }
            return;
          }
          setPhase("idle");
          setRescueBusy(false);
          requestBusyRef.current = false;
          if (reason === "complete") scheduleMicrophoneStart(token, undefined, true);
          else if (reason === "error") setError("日本語の説明を再生できませんでした。音声入力を再開してください。");
        },
      }, "miyabi");
    } catch (cause) {
      if (!mountedRef.current || startTokenRef.current !== token) return;
      if (iosMiyabiTtsMode) {
        setIgnoreRecognitionDuringMiyabi(false);
        miyabiTtsInputIgnoredRef.current = false;
      }
      setError(friendlyError(cause));
      setBusy(false);
      setPhase("idle");
      setRescueBusy(false);
      if (iosMiyabiTtsMode) {
        miyabiResumeFromSessionRef.current = recognitionSessionBefore;
        scheduleMicrophoneStart(token, 750, true);
      } else {
        requestBusyRef.current = false;
        scheduleMicrophoneStart(token, undefined, true);
      }
    }
  };

  const endLesson = async () => {
    if ((conversationMode !== "FREE_TALK" && !topic && !scene) || !partnerId || lessonEndingRef.current || review) return;
    lessonEndingRef.current = true;
    const token = ++startTokenRef.current;
    requestBusyRef.current = true;
    stopInteraction("conversation:lesson-ended");
    setRescueBusy(false);
    setRescueMessage("");
    setAwaitingUserInput(false);
    setBusy(false);
    setMicrophoneFallback(false);
    setError(null);

    if (!hasUserResponse(messages)) {
      requestBusyRef.current = false;
      lessonEndingRef.current = false;
      partnerOpeningStartedRef.current = null;
      setShowIntro(true);
      setLessonStage("partnerSelect");
      setPartnerId(null);
      setPartnerSelectionReady(false);
      setMessages([]);
      setTopic(null);
      setScene(null);
      setSceneComplication(null);
      setFreeTalkSetup(null);
      setInterimCaption("");
      setElapsedSeconds(0);
      setBusy(false);
      return;
    }

    setBusy(true);
    setPhase("thinking");
    try {
      const farewell = await generateConversationFarewell(CHARACTER_PROFILES[partnerId], { generation: token, characterId: partnerId, lessonType: conversationMode.toLowerCase() });
      if (!mountedRef.current || startTokenRef.current !== token) return;
      const completedMessages: ChatMessage[] = [...messages, { role: "assistant", content: farewell }];
      setMessages(completedMessages);
      saveEligibleMemory(completedMessages, token);
      setBusy(false);
      requestBusyRef.current = false;
      queueAssistantSpeech(farewell, token, () => {
        if (!mountedRef.current || startTokenRef.current !== token) return;
        if (conversationMode === "FREE_TALK") {
          returnToTopRef.current("user");
          return;
        }
        requestBusyRef.current = true;
        void requestLessonReview(completedMessages, token);
      });
    } catch (cause) {
      if (!mountedRef.current || startTokenRef.current !== token) return;
      requestBusyRef.current = false;
      setBusy(false);
      setPhase("idle");
      setError(friendlyError(cause));
      lessonEndingRef.current = false;
    }
  };

  handleSilenceStageRef.current = () => {
    if (!mountedRef.current || lessonStage !== "conversation" || !partnerId || review || lessonEndingRef.current || requestBusyRef.current) return;
    const token = startTokenRef.current;
    const isJapanese = conversationLanguage === "ja";
    if (silenceStageRef.current === "NORMAL") {
      silenceStageRef.current = "CHECK";
      const text = isJapanese ? "ちょっと考え中？ ゆっくりで大丈夫だよ。" : "Still thinking? Take your time.";
      setMessages((current) => [...current, { role: "assistant", content: text }]);
      queueAssistantSpeech(text, token);
      return;
    }
    if (silenceStageRef.current === "CHECK") {
      silenceStageRef.current = "CONFIRM_END";
      const text = isJapanese ? "まだ続ける？ 今日はこのくらいにする？" : "Want to keep going, or stop here for today?";
      setMessages((current) => [...current, { role: "assistant", content: text }]);
      queueAssistantSpeech(text, token);
      return;
    }
    silenceStageRef.current = "AUTO_CLOSE";
    lessonEndingRef.current = true;
    const text = isJapanese ? "じゃあ今日はこのくらいにしよう。またね。" : "Okay, let's stop here for today. See you next time.";
    const completedMessages: ChatMessage[] = [...messages, { role: "assistant", content: text }];
    setMessages(completedMessages);
    saveEligibleMemory(completedMessages, token);
    queueAssistantSpeech(text, token, () => {
      if (!mountedRef.current || startTokenRef.current !== token) return;
      if (conversationMode === "FREE_TALK" || !hasUserResponse(completedMessages)) {
        returnToTopRef.current("user");
        return;
      }
      requestBusyRef.current = true;
      void requestLessonReview(completedMessages, token);
    });
  };

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");
  const fiveMinutesPassed = elapsedSeconds >= 300;
  const tenMinutesPassed = elapsedSeconds >= 600;
  const lessonTitle = conversationMode === "FREE_TALK"
    ? CHARACTER_PROFILES[partnerId ?? "emma"].displayName
    : topic?.title ?? (scene ? `${scene.sceneTitle}: ${scene.title}` : "Scene Role-play");
  const reviewDisplay = review
    ? buildReviewDisplayModel(review, spokenReview, conversationLanguage)
    : null;
  // Base this on the user-visible turn, not recognitionActive: Chrome briefly
  // stops and restarts recognition while the same answer-waiting turn continues.
  const showRescueButton = lessonStage === "conversation" && conversationLanguage === "en" &&
    awaitingUserInput && !hasRecognizedSpeech && !busy && !rescueBusy && !review &&
    !lessonEndingRef.current;
  const runButtonAction = (action: () => void) => {
    onButtonPress();
    action();
  };

  if (showIntro) {
    return (
      <section className="ai-conversation ai-intro" aria-label="AI英会話イントロ">
        <div className="ai-intro-portrait" style={{ backgroundImage: `url(${emmaRoom})` }}>
          <CharacterAvatar
            character={REVIEW_CHARACTER}
            expression="neutral"
            intro
            isListening={openingIdleActive && idleVisual.listening}
            listeningPose={idleVisual.pose}
            onIntroImageLoad={finishIntroOpening}
          />
        </div>
        <div className="ai-intro-content">
          <h2>Hi, I’m Emma!</h2>
          <p><span className="ai-intro-guide-line">トピック会話・場面英会話・フリートークから</span><br />選んで始めましょう。</p>
          <div className="ai-lesson-choices">
            <button className="ai-primary-button" onClick={() => runButtonAction(() => void beginLesson(chooseTopic(freshTopics)))}>
              トピック会話
            </button>
            <button className="ai-primary-button secondary" onClick={() => runButtonAction(beginSceneSelection)}>
              場面英会話
            </button>
            <button className="ai-primary-button secondary" onClick={() => runButtonAction(beginFreeTalk)}>
              フリートーク
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="ai-conversation" aria-label="AI英会話">
      <header className="ai-topic-header">
        <span>{conversationMode === "FREE_TALK" ? "Free Talk" : scene ? "Scene Role-play" : "Today's Topic"}</span>
        <strong>
          {lessonTitle}
          {topic && isFreshTalkTopic(topic) && <span className="fresh-topic-mark" aria-hidden="true">*</span>}
        </strong>
        {!review && lessonStage === "conversation" && <time>{minutes}:{seconds}</time>}
      </header>

      <div
        className={`character-stage ${isSpeaking ? "speaking" : ""} ${rescueBusy ? "help-rescue" : ""} with-scene-background`}
        style={{ backgroundImage: `url(${displayedStageBackground})` }}
      >
        <CharacterAvatar
          key={stageCharacter.id}
          character={stageCharacter}
          expression={review ? reviewExpression : phase === "thinking" || phase === "ttsPending" ? "thinking" : idleActive && idleVisual.expression !== "neutral" ? idleVisual.expression : partnerExpression}
          isListening={!review && (phase === "recognizing" || (idleActive && idleVisual.listening))}
          listeningPose={phase === "recognizing" ? listeningPose : idleActive ? idleVisual.pose : "neutral"}
          isSpeaking={isSpeaking}
          mouthOpenRef={activeMouthOpenRef}
        />
      </div>

      {review ? (
        <div className="ai-review" onPointerDown={armReviewInactivityTimer}>
          <h2>Lesson Review</h2>
          <ReviewSections sections={reviewDisplay?.sections ?? review} language={conversationLanguage} />
          <div className="ai-review-actions">
            <button
              className="ai-primary-button"
              onClick={() => runButtonAction(() => scene ? beginSceneSelection() : void beginLesson(chooseTopic(freshTopics)))}
              disabled={busy}
            >
              {scene ? "別のSceneを選ぶ" : "次のトピックへ"}
            </button>
            <button className="ai-end-button" type="button" onClick={() => runButtonAction(() => cancelPartnerSelection("user"))}>Cancel</button>
          </div>
        </div>
      ) : lessonStage === "sceneSelect" ? (
        <div className="scene-roleplay-select" aria-labelledby="scene-roleplay-heading">
          <h2 id="scene-roleplay-heading">Choose a Scene Role-play</h2>
          <p>練習したい場面を選んでください。表現の正解を当てるテストではありません。</p>
          <div className="scene-roleplay-groups">
            {SCENE_ROLEPLAYS.map((family) => (
              <button
                type="button"
                className="scene-roleplay-card"
                data-scene-id={family.id}
                key={family.id}
                style={{ "--scene-card-background": `url(${SCENE_THUMBNAILS[family.id]})` } as CSSProperties}
                onClick={() => runButtonAction(() => beginScene(family))}
              >
                <strong>{family.title}</strong>
                <span>{family.shortLabel}</span>
              </button>
            ))}
          </div>
          <button className="ai-end-button" type="button" onClick={() => runButtonAction(cancelSceneSelection)}>Cancel</button>
        </div>
      ) : lessonStage === "partnerSelect" ? (
        <div className="partner-select" aria-labelledby="partner-select-heading">
          <h2 id="partner-select-heading">{PARTNER_SELECTION_PROMPT}</h2>
          <p>{partnerSelectionReady ? "会話相手を選んでください。" : "Emmaがご案内します。"}</p>
          <div className="partner-grid">
            {ENGLISH_PARTNERS.map((partner) => (
              <button
                className="partner-card"
                type="button"
                key={partner.id}
                onClick={() => runButtonAction(() => selectPartner(partner.id))}
                disabled={!partnerSelectionReady}
              >
                <img src={PARTNER_THUMBNAILS[partner.id]} alt="" onLoad={() => {
                  const loaded = loadedPartnerThumbnailsRef.current;
                  if (loaded.has(partner.id)) return;
                  loaded.add(partner.id);
                  if (loaded.size === 1) tossaPerf("IMAGE", "first partner thumbnail loaded", { characterId: partner.id });
                  const expected = ENGLISH_PARTNERS.length + (scene ? 1 : 2);
                  if (loaded.size === expected) tossaPerf("IMAGE", "all partner thumbnails loaded", { count: loaded.size });
                }} />
                <span>{partner.name}</span>
              </button>
            ))}
            <button
              className="partner-card"
              type="button"
              onClick={() => runButtonAction(selectAnyone)}
              disabled={!partnerSelectionReady}
            >
              <img src={ANYONE_THUMBNAIL} alt="" onLoad={() => {
                const loaded = loadedPartnerThumbnailsRef.current;
                if (loaded.has("anyone")) return;
                loaded.add("anyone");
                if (loaded.size === 1) tossaPerf("IMAGE", "first partner thumbnail loaded", { characterId: "anyone" });
                const expected = ENGLISH_PARTNERS.length + (scene ? 1 : 2);
                if (loaded.size === expected) tossaPerf("IMAGE", "all partner thumbnails loaded", { count: loaded.size });
              }} />
              <span>Anyone</span>
            </button>
            {!scene && (
              <button
                className="partner-card"
                type="button"
                onClick={() => runButtonAction(() => selectPartner(MIYABI.id))}
                disabled={!partnerSelectionReady}
              >
                <img src={PARTNER_THUMBNAILS[MIYABI.id]} alt="" onLoad={() => {
                  const loaded = loadedPartnerThumbnailsRef.current;
                  if (loaded.has(MIYABI.id)) return;
                  loaded.add(MIYABI.id);
                  if (loaded.size === 1) tossaPerf("IMAGE", "first partner thumbnail loaded", { characterId: MIYABI.id });
                  const expected = ENGLISH_PARTNERS.length + 2;
                  if (loaded.size === expected) tossaPerf("IMAGE", "all partner thumbnails loaded", { count: loaded.size });
                }} />
                <span>{MIYABI.name}</span>
              </button>
            )}
          </div>
          {error && <p className="ai-error" role="alert">{error}</p>}
          <button ref={partnerCancelRef} className="ai-end-button" type="button" onClick={() => runButtonAction(() => cancelPartnerSelection("user"))}>Cancel</button>
          <div ref={partnerListEndRef} className="ai-partner-list-end" aria-hidden="true" />
        </div>
      ) : (
        <>
          {showConversationCaptions && (
            <div className="ai-history" aria-live="polite">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`ai-message ${message.role}`}>
                <span>{message.role === "assistant" ? character.name : "You"}</span>
                <p>{message.content}</p>
              </div>
            ))}
            {recognitionActive && interimCaption && (
              <div className="ai-message user interim"><span>You</span><p>{interimCaption}</p></div>
            )}
            <div ref={historyEndRef} />
            </div>
          )}
          {busy && <div className="ai-thinking ai-conversation-status">AI is thinking...</div>}
          {rescueMessage && <div className="ai-rescue-message" aria-live="polite">{rescueMessage}</div>}

          {tenMinutesPassed && <p className="ai-time-note">10分経過しました。自然な区切りで会話を終了できます。</p>}
          {!tenMinutesPassed && fiveMinutesPassed && <p className="ai-time-note">5分経過しました。好きなタイミングで会話を終了できます。</p>}
          {error && <p className="ai-error" role="alert">{error}</p>}

          {microphoneFallback && (
            <button className="ai-end-button" onClick={() => runButtonAction(() => startMicrophone())} disabled={busy || recognitionActive}>
              音声入力を再開
            </button>
          )}
          <div className="ai-listening-row">
            <p role="status" aria-live="polite">
              {awaitingUserInput
                ? conversationLanguage === "ja" ? "Listening... 日本語で話してください" : "Listening... 英語で話してください"
                : recognitionActive ? "マイクを開始しています…" : ""}
            </p>
            {showRescueButton && (
              <button className="ai-help-button" type="button" onClick={() => {
                if (detectDeviceGroup() === "ios") {
                  tossaPerf("SPEECH", "Miyabi Help click SE skipped on iOS", {
                    recognitionSessionBefore: getRecognitionSessionId(),
                  });
                  void requestRescue();
                  return;
                }
                runButtonAction(() => void requestRescue());
              }}>
                {uiLanguage === "en" ? "? Help" : "？ わからない"}
              </button>
            )}
          </div>
          <button
            className={`ai-end-button ${fiveMinutesPassed ? "ready" : ""}`}
            onClick={() => runButtonAction(() => void endLesson())}
          >
            End
          </button>
        </>
      )}
    </section>
  );
}
