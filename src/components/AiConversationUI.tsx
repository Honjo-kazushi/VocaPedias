import { useCallback, useEffect, useRef, useState } from "react";
import { hasUserResponse, mergeSpeechTranscript, type ChatMessage, type SpokenReviewPart } from "../ai/conversationTypes";
import {
  continueTutorConversation,
  continueSceneRoleplay,
  reviewTutorConversation,
  explainEnglishMessageInJapanese,
  startSceneRoleplay,
  startTutorConversation,
} from "../ai/chatWithTutor";
import { buildSpokenReviewLecture } from "../ai/buildReviewLecture";
import { createUserTurnSnapshot, type UserTurnSnapshot } from "../ai/userTurnSnapshot";
import { applySpeechRateIntent, detectSpeechRateIntent, isConversationEndIntent } from "../ai/conversationControls";
import { TALK_TOPICS, type TalkTopic } from "../data/talkTopics.seed";
import { getTopicBackground } from "../data/topicBackgrounds";
import { chooseTopicAngle } from "../data/topicAngles";
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
import { useIdleExpression } from "../hooks/useIdleExpression";
import { getCharacter, type CharacterExpression } from "../data/characters";
import { CHARACTER_PROFILES, ENGLISH_CONVERSATION_PARTNER_IDS, type CharacterId, type ConversationLanguage } from "../characters/characterProfiles";
import anyoneNeutralClosed from "../assets/characters/anyone/anyone_neutral_closed.png";
import emmaRoom from "../assets/backgrounds/emma_room.png";
import hotelBackground from "../assets/backgrounds/hotel.png";
import airportBackground from "../assets/backgrounds/airport.png";
import streetBackground from "../assets/backgrounds/street.png";
import restaurantBackground from "../assets/backgrounds/restaurant.png";
import marketBackground from "../assets/backgrounds/market.png";
import stationBackground from "../assets/backgrounds/station.png";
import hospitalBackground from "../assets/backgrounds/hospital.png";
import { CharacterAvatar } from "./CharacterAvatar";

type ConversationPhase = "idle" | "recognizing" | "thinking" | "ttsPending" | "speaking";
type LessonStage = "sceneSelect" | "partnerSelect" | "conversation";

export const SOFT_UTTERANCE_TIMEOUT_MS = 2500;
export const HARD_UTTERANCE_TIMEOUT_MS = 7000;

let previousTopicId: string | null = null;
let previousTopicWasFresh = false;
const REVIEW_CHARACTER = getCharacter("emma");
const ENGLISH_PARTNERS = ENGLISH_CONVERSATION_PARTNER_IDS.map((id) => getCharacter(id));
const MIYABI = getCharacter("miyabi");
const PARTNER_SELECTION_PROMPT = "Who would you like to talk with today?";
const SCENE_SELECTION_PROMPT = "Choose a scene you would like to practice.";
const SCENE_BACKGROUNDS = {
  hotel: hotelBackground,
  airport: airportBackground,
  street: streetBackground,
  restaurant: restaurantBackground,
  shopping: marketBackground,
  transportation: stationBackground,
  hospital: hospitalBackground,
} as const;

function chooseTopic(freshTopics: readonly FreshTalkTopic[] = [], random: () => number = Math.random): TalkTopic {
  const requestedTitle = new URLSearchParams(window.location.search).get("topic");
  const requestedTopic = [...TALK_TOPICS, ...freshTopics].find(
    (topic) => topic.title.toLowerCase() === requestedTitle?.toLowerCase()
  );
  if (requestedTopic) {
    previousTopicId = requestedTopic.id;
    previousTopicWasFresh = isFreshTalkTopic(requestedTopic);
    return requestedTopic;
  }

  const useFresh = freshTopics.length > 0 && !previousTopicWasFresh && random() < FRESH_TOPIC_MIX_RATIO;
  const source = useFresh ? freshTopics : TALK_TOPICS;
  const choices = source.filter(
    (topic) => source.length === 1 || topic.id !== previousTopicId
  );
  const topic = choices[Math.floor(random() * choices.length)];
  previousTopicId = topic.id;
  previousTopicWasFresh = isFreshTalkTopic(topic);
  return topic;
}

function friendlyError(error: unknown): string {
  console.error("[AI conversation]", error);
  return "AIに接続できませんでした。通信状態を確認して、もう一度お試しください。";
}

function speechDebug(event: string, details: Record<string, unknown>) {
  if (import.meta.env.DEV) console.debug("[TossaSpeak speech]", event, details);
}

const REVIEW_HEADINGS = [
  "今日よく使えた英語",
  "ここを直そう",
  "こんな言い方もできる",
] as const;

function ReviewSections({ review, language }: { review: string; language: ConversationLanguage }) {
  const headings = language === "ja" ? ["今日のポイント"] : REVIEW_HEADINGS;
  const sections = headings.map((heading, index) => {
    const startMarker = `## ${heading}`;
    const start = review.indexOf(startMarker);
    const nextHeading = headings[index + 1];
    const end = nextHeading ? review.indexOf(`## ${nextHeading}`, start + startMarker.length) : review.length;
    return {
      heading,
      content: start >= 0 ? review.slice(start + startMarker.length, end >= 0 ? end : review.length).trim() : "",
    };
  });

  return (
    <div className="ai-review-sections">
      {sections.map(({ heading, content }) => (
        <section className="ai-review-section" key={heading}>
          <h3>{heading}</h3>
          <div>{content || "該当なし"}</div>
        </section>
      ))}
    </div>
  );
}

type AiConversationUIProps = {
  showConversationCaptions: boolean;
  uiLanguage?: "ja" | "en";
};

export default function AiConversationUI({ showConversationCaptions, uiLanguage = "ja" }: AiConversationUIProps) {
  const [topic, setTopic] = useState<TalkTopic | null>(null);
  const [freshTopics, setFreshTopics] = useState<FreshTalkTopic[]>([]);
  const [scene, setScene] = useState<SceneSituation | null>(null);
  const [sceneComplication, setSceneComplication] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [interimCaption, setInterimCaption] = useState("");
  const [review, setReview] = useState<string | null>(null);
  const [spokenReview, setSpokenReview] = useState<SpokenReviewPart[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<ConversationPhase>("idle");
  const [lessonStage, setLessonStage] = useState<LessonStage>("partnerSelect");
  const [partnerId, setPartnerId] = useState<CharacterId | null>(null);
  const [topicAngle, setTopicAngle] = useState<string | null>(null);
  const [partnerSelectionReady, setPartnerSelectionReady] = useState(false);
  const [introOpeningComplete, setIntroOpeningComplete] = useState(false);
  const [partnerExpression, setPartnerExpression] = useState<CharacterExpression>("neutral");
  const [reviewExpression, setReviewExpression] = useState<CharacterExpression>("neutral");
  const [microphoneFallback, setMicrophoneFallback] = useState(false);
  const [rescueBusy, setRescueBusy] = useState(false);
  const [rescueMessage, setRescueMessage] = useState("");
  const [awaitingUserInput, setAwaitingUserInput] = useState(false);
  const requestBusyRef = useRef(false);
  const lessonEndingRef = useRef(false);
  const { pose: listeningPose, start: startListening, stop: stopListening } = useCharacterListening();
  const { active: recognitionActive, start: startRecognition, cancel: cancelRecognition } = useUserSpeechRecognition();
  const character = partnerId ? getCharacter(partnerId) : REVIEW_CHARACTER;
  const visibleCharacter = rescueBusy ? getCharacter("miyabi") : character;
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
  const isSpeaking = review ? reviewIsSpeaking : partnerIsSpeaking;
  const activeMouthOpenRef = review ? reviewMouthOpenRef : partnerMouthOpenRef;
  const idleProfile = partnerId ? CHARACTER_PROFILES[partnerId] : CHARACTER_PROFILES.emma;
  const openingIdleActive = showIntro && introOpeningComplete;
  const idleActive = !review && !busy && phase === "idle" && !partnerIsSpeaking && (
    openingIdleActive || (!showIntro && (lessonStage !== "partnerSelect" || partnerSelectionReady))
  );
  const idleVisual = useIdleExpression(idleActive, idleProfile, character.listening?.blink);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTokenRef = useRef(0);
  const mountedRef = useRef(false);
  const historyEndRef = useRef<HTMLDivElement | null>(null);
  const reviewLectureStartedRef = useRef<string | null>(null);
  const partnerOpeningStartedRef = useRef<string | null>(null);
  const recognitionRestartTimerRef = useRef<number | null>(null);
  const softFinalizeTimerRef = useRef<number | null>(null);
  const hardFinalizeTimerRef = useRef<number | null>(null);
  const utteranceBufferRef = useRef("");
  const utteranceSentRef = useRef(false);
  const userTurnIdRef = useRef(0);
  const processedSnapshotIdsRef = useRef(new Set<number>());
  const lastActivityAtRef = useRef(0);
  const startMicrophoneRef = useRef<(continuationToken?: number) => void>(() => {});
  const speechRateMultiplierRef = useRef(1);
  const partnerCancelRef = useRef<HTMLButtonElement | null>(null);
  const partnerListEndRef = useRef<HTMLDivElement | null>(null);

  const stopInteraction = useCallback(() => {
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
    utteranceBufferRef.current = "";
    utteranceSentRef.current = false;
    cancelRecognition();
    stopListening();
    stopAssistantSpeech();
    stopReviewSpeech();
    setPartnerExpression("neutral");
    setAwaitingUserInput(false);
    setPhase("idle");
  }, [cancelRecognition, stopListening, stopAssistantSpeech, stopReviewSpeech]);

  const scheduleMicrophoneStart = useCallback((token: number, delay = 250, continuation = false) => {
    if (lessonEndingRef.current) return;
    if (recognitionRestartTimerRef.current !== null) window.clearTimeout(recognitionRestartTimerRef.current);
    speechDebug("recognition restart scheduled", { generation: token, userTurnId: userTurnIdRef.current, delay, continuation });
    recognitionRestartTimerRef.current = window.setTimeout(() => {
      recognitionRestartTimerRef.current = null;
      if (!mountedRef.current || startTokenRef.current !== token || requestBusyRef.current || lessonEndingRef.current) return;
      speechDebug("recognition restart executed", { generation: token, userTurnId: userTurnIdRef.current, continuation });
      startMicrophoneRef.current(continuation ? token : undefined);
    }, delay);
  }, []);

  const queueAssistantSpeech = useCallback((text: string, token: number) => {
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
          setPartnerExpression("neutral");
          setPhase("idle");
          if (reason === "complete" && !lessonEndingRef.current) scheduleMicrophoneStart(token);
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
    }));
    stopAssistantSpeech();
    speakReviewItems(items, {
      onItemStart: () => setReviewExpression("neutral"),
      onFinish: () => setReviewExpression("neutral"),
    }, REVIEW_CHARACTER.id);
  }, [conversationLanguage, partnerId, speakReviewItems, stopAssistantSpeech]);

  const announcePartnerSelection = useCallback((lessonAnnouncement: string, token: number) => {
    setPhase("ttsPending");
    window.requestAnimationFrame(() => {
      if (!mountedRef.current || startTokenRef.current !== token) return;
      speakCharacterItems([
        { lang: "en-US", text: lessonAnnouncement },
        { lang: "en-US", text: PARTNER_SELECTION_PROMPT },
      ], {
        onItemStart: () => {
          if (startTokenRef.current === token) {
            setPartnerExpression("neutral");
            setPhase("speaking");
          }
        },
        onFinish: (reason) => {
          if (startTokenRef.current !== token) return;
          setPartnerExpression("neutral");
          setPhase("idle");
          if (reason !== "cancel") setPartnerSelectionReady(true);
          if (reason === "error") setError("音声を再生できませんでした。会話相手を選んで続けられます。");
        },
      }, REVIEW_CHARACTER.id);
    });
  }, [speakCharacterItems]);

  const beginLesson = useCallback((nextTopic: TalkTopic) => {
    const token = ++startTokenRef.current;
    requestBusyRef.current = false;
    lessonEndingRef.current = false;
    stopInteraction();
    speechRateMultiplierRef.current = 1;
    setRescueBusy(false);
    setRescueMessage("");
    setTopic(nextTopic);
    setScene(null);
    setSceneComplication(null);
    setTopicAngle(chooseTopicAngle(nextTopic));
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
    announcePartnerSelection(`Today's topic is ${nextTopic.title}.`, token);
  }, [announcePartnerSelection, stopInteraction]);

  const beginSceneSelection = useCallback(() => {
    const token = ++startTokenRef.current;
    requestBusyRef.current = false;
    lessonEndingRef.current = false;
    stopInteraction();
    speechRateMultiplierRef.current = 1;
    setRescueBusy(false);
    setRescueMessage("");
    setTopic(null);
    setScene(null);
    setSceneComplication(null);
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
      speakCharacterItems([{ lang: "en-US", text: SCENE_SELECTION_PROMPT }], {
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
    stopInteraction();
    setShowIntro(true);
    setLessonStage("partnerSelect");
    setTopic(null);
    setScene(null);
    setSceneComplication(null);
    setPartnerId(null);
    setMessages([]);
    setError(null);
  }, [stopInteraction]);

  const beginScene = useCallback((sceneFamily: SceneRoleplay) => {
    ++startTokenRef.current;
    const nextScene = chooseSceneSituation(sceneFamily);
    const nextPartnerId = chooseScenePartner(nextScene, partnerId);
    requestBusyRef.current = false;
    lessonEndingRef.current = false;
    stopInteraction();
    speechRateMultiplierRef.current = 1;
    setRescueBusy(false);
    setRescueMessage("");
    setTopic(null);
    setScene(nextScene);
    setSceneComplication(chooseSceneComplication(nextScene));
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

  const selectPartner = (id: CharacterId) => {
    if (!partnerSelectionReady || requestBusyRef.current) return;
    startTokenRef.current += 1;
    lessonEndingRef.current = false;
    stopInteraction();
    speechRateMultiplierRef.current = 1;
    setRescueBusy(false);
    setRescueMessage("");
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

  const cancelPartnerSelection = () => {
    startTokenRef.current += 1;
    requestBusyRef.current = false;
    lessonEndingRef.current = false;
    stopInteraction();
    speechRateMultiplierRef.current = 1;
    setRescueBusy(false);
    setRescueMessage("");
    partnerOpeningStartedRef.current = null;
    setShowIntro(true);
    setLessonStage("partnerSelect");
    setTopic(null);
    setScene(null);
    setSceneComplication(null);
    setPartnerId(null);
    setPartnerSelectionReady(false);
    setMessages([]);
    setReview(null);
    setSpokenReview([]);
    setInterimCaption("");
    setElapsedSeconds(0);
    setBusy(false);
    setError(null);
  };

  const finishIntroOpening = useCallback(() => {
    if (showIntro) setIntroOpeningComplete(true);
  }, [showIntro]);

  useEffect(() => {
    mountedRef.current = true;
    void loadFreshTopics().then((topics) => {
      if (mountedRef.current) setFreshTopics(topics);
    });
    return () => {
      mountedRef.current = false;
      startTokenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!showIntro) return;
    setIntroOpeningComplete(false);
  }, [showIntro]);

  useEffect(() => {
    if (lessonStage !== "partnerSelect" || !partnerSelectionReady) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const target = partnerListEndRef.current ?? partnerCancelRef.current;
        if (!target) return;
        const bounds = target.getBoundingClientRect();
        if (bounds.bottom > window.innerHeight - 12 || bounds.top < 0) {
          target.scrollIntoView({ behavior: "smooth", block: "end" });
        }
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [lessonStage, partnerSelectionReady]);

  useEffect(() => {
    if (lessonStage !== "conversation" || (!topic && !scene) || !partnerId || review) return;
    const openingKey = `${topic?.id ?? scene?.id}:${partnerId}`;
    if (partnerOpeningStartedRef.current === openingKey) return;
    partnerOpeningStartedRef.current = openingKey;
    const token = ++startTokenRef.current;
    requestBusyRef.current = true;
    setPhase("thinking");
    setBusy(true);
    if (import.meta.env.DEV) {
      console.debug("[TossaSpeak]", {
        Lesson: topic?.title ?? `${scene?.sceneTitle}: ${scene?.title}`,
        Angle: topic ? topicAngle ?? "default topic guidance" : "scene role-play",
        Character: CHARACTER_PROFILES[partnerId].displayName,
      });
    }
    const openingRequest = scene
      ? startSceneRoleplay(scene, CHARACTER_PROFILES[partnerId], sceneComplication)
      : startTutorConversation(topic!, CHARACTER_PROFILES[partnerId], topicAngle);
    void openingRequest
      .then((opening) => {
        if (!mountedRef.current || startTokenRef.current !== token) return;
        setMessages([{ role: "assistant", content: opening }]);
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
  }, [lessonStage, partnerId, queueAssistantSpeech, review, scene, sceneComplication, topic, topicAngle]);

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
      );
      if (!mountedRef.current || startTokenRef.current !== token) return;
      setSpokenReview(result.spokenReview);
      setReview(result.detailedReview);
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

  const processUserTurn = async (snapshot: UserTurnSnapshot) => {
    if (!mountedRef.current || (!topic && !scene) || !partnerId || lessonStage !== "conversation" || requestBusyRef.current || review) return;
    if (processedSnapshotIdsRef.current.has(snapshot.id)) return;
    processedSnapshotIdsRef.current.add(snapshot.id);
    requestBusyRef.current = true;
    const token = ++startTokenRef.current;
    stopInteraction();
    setPhase("thinking");
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: snapshot.text }];
    setMessages(nextMessages);
    setInterimCaption("");
    setRescueMessage("");
    setAwaitingUserInput(false);
    setError(null);
    setBusy(true);
    speechDebug("Gemini send snapshot", { snapshotId: snapshot.id, generation: snapshot.generation, text: snapshot.text });
    if (conversationLanguage === "en") {
      const rateIntent = detectSpeechRateIntent(snapshot.text);
      speechRateMultiplierRef.current = applySpeechRateIntent(speechRateMultiplierRef.current, rateIntent);
    }
    if (isConversationEndIntent(snapshot.text, conversationLanguage)) {
      // Reuse the same Review path as End Lesson. The user's farewell is the
      // closing, so do not add another partner response or TTS delay.
      lessonEndingRef.current = true;
      void requestLessonReview(nextMessages, token);
      return;
    }
    try {
      const response = scene
        ? await continueSceneRoleplay(scene, nextMessages, CHARACTER_PROFILES[snapshot.characterId as CharacterId], sceneComplication)
        : await continueTutorConversation(topic!, nextMessages, CHARACTER_PROFILES[snapshot.characterId as CharacterId]);
      if (mountedRef.current && startTokenRef.current === token) {
        setMessages([...nextMessages, { role: "assistant", content: response }]);
        queueAssistantSpeech(response, token);
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
    if ((!topic && !scene) || !partnerId || lessonStage !== "conversation" || review || lessonEndingRef.current || requestBusyRef.current || (!continuing && recognitionActive)) return;
    const token = continuationToken ?? ++startTokenRef.current;
    if (continuing) {
      if (startTokenRef.current !== token) return;
    } else {
      stopInteraction();
      userTurnIdRef.current += 1;
      utteranceSentRef.current = false;
      setError(null);
      setMicrophoneFallback(false);
    }
    const userTurnId = userTurnIdRef.current;
    const finalizeUserTurn = (reason: "soft" | "hard") => {
      if (!mountedRef.current || startTokenRef.current !== token || requestBusyRef.current || review || utteranceSentRef.current) return;
      const snapshot = createUserTurnSnapshot({
        id: userTurnId,
        generation: token,
        text: utteranceBufferRef.current,
        language: conversationLanguage,
        characterId: partnerId,
      });
      if (!snapshot) return;
      utteranceSentRef.current = true;
      speechDebug("UserTurn finalized / Snapshot created", { generation: token, userTurnId, reason, snapshotId: snapshot.id, text: snapshot.text });
      utteranceBufferRef.current = "";
      speechDebug("utterance buffer cleared", { generation: token, userTurnId, buffer: utteranceBufferRef.current });
      if (softFinalizeTimerRef.current !== null) window.clearTimeout(softFinalizeTimerRef.current);
      if (hardFinalizeTimerRef.current !== null) window.clearTimeout(hardFinalizeTimerRef.current);
      softFinalizeTimerRef.current = hardFinalizeTimerRef.current = null;
      cancelRecognition();
      stopListening();
      setAwaitingUserInput(false);
      void processUserTurn(snapshot);
    };
    const resetUserTurnTimers = (activity: string) => {
      lastActivityAtRef.current = performance.now();
      speechDebug("user turn activity", { generation: token, userTurnId, activity, lastActivityAt: lastActivityAtRef.current });
      if (!utteranceBufferRef.current || utteranceSentRef.current) return;
      if (softFinalizeTimerRef.current !== null) window.clearTimeout(softFinalizeTimerRef.current);
      if (hardFinalizeTimerRef.current !== null) window.clearTimeout(hardFinalizeTimerRef.current);
      speechDebug("utterance timers start/reset", { generation: token, userTurnId, activity, softMs: SOFT_UTTERANCE_TIMEOUT_MS, hardMs: HARD_UTTERANCE_TIMEOUT_MS });
      softFinalizeTimerRef.current = window.setTimeout(() => {
        softFinalizeTimerRef.current = null;
        speechDebug("soft timer fired", { generation: token, userTurnId });
        finalizeUserTurn("soft");
      }, SOFT_UTTERANCE_TIMEOUT_MS);
      hardFinalizeTimerRef.current = window.setTimeout(() => {
        hardFinalizeTimerRef.current = null;
        speechDebug("hard timer fired", { generation: token, userTurnId });
        finalizeUserTurn("hard");
      }, HARD_UTTERANCE_TIMEOUT_MS);
    };
    startRecognition({
      onStart: () => {
        if (startTokenRef.current !== token || lessonEndingRef.current) return;
        speechDebug("recognition start", { generation: token, userTurnId, continuing });
        setPhase("recognizing");
        setAwaitingUserInput(true);
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
        speechDebug("utterance buffer changed", { generation: token, userTurnId, before, after: utteranceBufferRef.current, final: text });
        if (showConversationCaptions) setInterimCaption(utteranceBufferRef.current);
        resetUserTurnTimers("final result");
        if (isConversationEndIntent(utteranceBufferRef.current, conversationLanguage)) finalizeUserTurn("soft");
      },
      onSpeechStart: () => {
        if (startTokenRef.current === token) speechDebug("speechstart", { generation: token, userTurnId, buffer: utteranceBufferRef.current });
      },
      onSpeechEnd: () => {
        if (startTokenRef.current === token) speechDebug("speechend", { generation: token, userTurnId, buffer: utteranceBufferRef.current });
      },
      onTranscript: (text) => {
        if (startTokenRef.current !== token || utteranceSentRef.current) return;
        speechDebug("transcript display", { generation: token, userTurnId, transcript: text, buffer: utteranceBufferRef.current });
        if (showConversationCaptions) {
          setInterimCaption(mergeSpeechTranscript(utteranceBufferRef.current, text, conversationLanguage));
        }
      },
      onDebug: (recognitionSessionId, event, details) => {
        speechDebug(event, { generation: token, userTurnId, recognitionSessionId, ...details });
      },
      onEnd: () => {
        if (startTokenRef.current !== token || utteranceSentRef.current) return;
        speechDebug("recognition onend", { generation: token, userTurnId, buffer: utteranceBufferRef.current });
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
    if (conversationLanguage !== "en" || phase !== "recognizing" || !recognitionActive || rescueBusy || requestBusyRef.current || !partnerId) return;
    const lastAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant")?.content;
    if (!lastAssistantMessage) return;
    const token = ++startTokenRef.current;
    requestBusyRef.current = true;
    stopInteraction();
    setAwaitingUserInput(false);
    setRescueBusy(true);
    setRescueMessage("");
    setInterimCaption("");
    setError(null);
    setBusy(true);
    setPhase("thinking");
    try {
      const explanation = await explainEnglishMessageInJapanese(lastAssistantMessage, CHARACTER_PROFILES[partnerId]);
      if (!mountedRef.current || startTokenRef.current !== token) return;
      setRescueMessage(explanation);
      setBusy(false);
      setPhase("ttsPending");
      speakCharacterItems([{ lang: "ja-JP", text: explanation, characterId: "miyabi" }], {
        onItemStart: () => {
          if (startTokenRef.current === token) setPhase("speaking");
        },
        onFinish: (reason) => {
          if (!mountedRef.current || startTokenRef.current !== token) return;
          setPhase("idle");
          setRescueBusy(false);
          requestBusyRef.current = false;
          if (reason === "complete") scheduleMicrophoneStart(token, 250, true);
          else if (reason === "error") setError("日本語の説明を再生できませんでした。音声入力を再開してください。");
        },
      }, "miyabi");
    } catch (cause) {
      if (!mountedRef.current || startTokenRef.current !== token) return;
      setError(friendlyError(cause));
      setBusy(false);
      setPhase("idle");
      setRescueBusy(false);
      requestBusyRef.current = false;
      scheduleMicrophoneStart(token, 250, true);
    }
  };

  const endLesson = async () => {
    if ((!topic && !scene) || lessonEndingRef.current || review) return;
    lessonEndingRef.current = true;
    const token = ++startTokenRef.current;
    requestBusyRef.current = true;
    stopInteraction();
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
      setInterimCaption("");
      setElapsedSeconds(0);
      setBusy(false);
      return;
    }

    await requestLessonReview(messages, token);
  };

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");
  const fiveMinutesPassed = elapsedSeconds >= 300;
  const tenMinutesPassed = elapsedSeconds >= 600;
  const showTopicBackground = lessonStage === "conversation" && !review;
  const lessonTitle = topic?.title ?? (scene ? `${scene.sceneTitle}: ${scene.title}` : "Scene Role-play");
  const showRescueButton = lessonStage === "conversation" && conversationLanguage === "en" &&
    awaitingUserInput && !busy && !rescueBusy && !review;

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
          <p>自由なトピック会話か、場面英会話を選んで始めましょう。</p>
          <div className="ai-lesson-choices">
            <button className="ai-primary-button" onClick={() => void beginLesson(chooseTopic(freshTopics))}>
              Talk Topic
            </button>
            <button className="ai-primary-button secondary" onClick={beginSceneSelection}>
              Scene Role-play
            </button>
          </div>
        </div>
      </section>
    );
  }

  const stageBackground = showTopicBackground
    ? scene
      ? SCENE_BACKGROUNDS[scene.sceneId]
      : topic
        ? getTopicBackground(topic.id)
        : emmaRoom
    : emmaRoom;

  return (
    <section className="ai-conversation" aria-label="AI英会話">
      <header className="ai-topic-header">
        <span>{scene ? "Scene Role-play" : topic && isFreshTalkTopic(topic) ? "Today's Topic · Fresh" : "Today's Topic"}</span>
        <strong>{lessonTitle}</strong>
        {!review && lessonStage === "conversation" && <time>{minutes}:{seconds}</time>}
      </header>

      <div
        className={`character-stage ${isSpeaking ? "speaking" : ""} ${rescueBusy ? "help-rescue" : ""} with-scene-background`}
        style={{ backgroundImage: `url(${stageBackground})` }}
      >
        <CharacterAvatar
          character={review ? REVIEW_CHARACTER : visibleCharacter}
          expression={review ? reviewExpression : phase === "thinking" || phase === "ttsPending" ? "thinking" : idleActive && idleVisual.expression !== "neutral" ? idleVisual.expression : partnerExpression}
          isListening={!review && (phase === "recognizing" || (idleActive && idleVisual.listening))}
          listeningPose={phase === "recognizing" ? listeningPose : idleActive ? idleVisual.pose : "neutral"}
          isSpeaking={isSpeaking}
          mouthOpenRef={activeMouthOpenRef}
        />
      </div>

      {review ? (
        <div className="ai-review">
          <h2>Lesson Review</h2>
          <ReviewSections review={review} language={conversationLanguage} />
          <button
            className="ai-primary-button"
            onClick={() => scene ? beginSceneSelection() : void beginLesson(chooseTopic(freshTopics))}
            disabled={busy}
          >
            {scene ? "別のSceneを選ぶ" : "次のトピックへ"}
          </button>
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
                key={family.id}
                onClick={() => beginScene(family)}
              >
                <strong>{family.title}</strong>
                <span>{family.shortLabel}</span>
              </button>
            ))}
          </div>
          <button className="ai-end-button" type="button" onClick={cancelSceneSelection}>Cancel</button>
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
                onClick={() => selectPartner(partner.id)}
                disabled={!partnerSelectionReady}
              >
                <img src={partner.expressions.neutral.closed} alt="" />
                <span>{partner.name}</span>
              </button>
            ))}
            <button
              className="partner-card"
              type="button"
              onClick={selectAnyone}
              disabled={!partnerSelectionReady}
            >
              <img src={anyoneNeutralClosed} alt="" />
              <span>Anyone</span>
            </button>
            {!scene && (
              <button
                className="partner-card"
                type="button"
                onClick={() => selectPartner(MIYABI.id)}
                disabled={!partnerSelectionReady}
              >
                <img src={MIYABI.expressions.neutral.closed} alt="" />
                <span>{MIYABI.name}</span>
              </button>
            )}
          </div>
          {error && <p className="ai-error" role="alert">{error}</p>}
          <button ref={partnerCancelRef} className="ai-end-button" type="button" onClick={cancelPartnerSelection}>Cancel</button>
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

          {tenMinutesPassed && <p className="ai-time-note">10分経過しました。会話をまとめてReviewへ進めます。</p>}
          {!tenMinutesPassed && fiveMinutesPassed && <p className="ai-time-note">5分経過しました。好きなタイミングでレッスンを終了できます。</p>}
          {error && <p className="ai-error" role="alert">{error}</p>}

          {microphoneFallback && (
            <button className="ai-end-button" onClick={() => startMicrophone()} disabled={busy || recognitionActive}>
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
              <button className="ai-help-button" type="button" onClick={() => void requestRescue()} disabled={!recognitionActive}>
                {uiLanguage === "en" ? "? Help" : "？ わからない"}
              </button>
            )}
          </div>
          <button
            className={`ai-end-button ${fiveMinutesPassed ? "ready" : ""}`}
            onClick={() => void endLesson()}
          >
            End Lesson
          </button>
        </>
      )}
    </section>
  );
}
