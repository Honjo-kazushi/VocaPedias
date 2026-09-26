export type CharacterId =
  | "emma"
  | "mike"
  | "sophie"
  | "jamie"
  | "lily"
  | "grandma_rose"
  | "dr_dan"
  | "leo"
  | "miyabi";

export type ConversationLanguage = "en" | "ja";

export type VoicePreference = {
  preferredVoices?: { name: string; lang: string }[];
  preferredNames?: string[];
  preferredLangs?: string[];
  rate: number;
  pitch: number;
};

export type CharacterVoicePreferences = {
  desktop?: VoicePreference;
  android?: VoicePreference;
  ios?: VoicePreference;
  fallback: VoicePreference;
};

export type CharacterProfile = {
  voicePreferences: CharacterVoicePreferences;
  japaneseVoicePreferences?: CharacterVoicePreferences;
  brightJapaneseVoicePreferences?: CharacterVoicePreferences;
  id: CharacterId;
  displayName: string;
  conversationLanguage: ConversationLanguage;
  role: string;
  isTeacher: boolean;
  isConversationPartner: boolean;
  personality: string[];
  conversationStyle: string[];
  waitingPhrases: string[];
  voice: {
    gender: "male" | "female";
    ageStyle?: "child" | "young" | "adult" | "older";
    speed: "slow" | "slightly_slow" | "normal" | "slightly_fast";
    pitchStyle?: "low" | "normal" | "high";
    tone: string;
  };
  expressionBias: {
    smile: number;
    nod: number;
    listening: number;
    thinking: number;
    surprised: number;
  };
};

export const CHARACTER_PROFILES = {
  emma: {
    id: "emma",
    voicePreferences: {
      desktop: { preferredNames: ["Google US English"], preferredLangs: ["en-US"], rate: 0.95, pitch: 1 },
      android: { preferredLangs: ["en-GB"], rate: 0.95, pitch: 1 },
      ios: { preferredVoices: [{ name: "Samantha", lang: "en-US" }, { name: "Karen", lang: "en-AU" }, { name: "Tessa", lang: "en-ZA" }], preferredLangs: ["en-US", "en-AU", "en-ZA"], rate: 1, pitch: 0.98 },
      fallback: { preferredLangs: ["en-US"], rate: 0.95, pitch: 1 },
    },
    japaneseVoicePreferences: {
      desktop: { preferredNames: ["Microsoft Haruka", "Microsoft Haruka Desktop"], preferredLangs: ["ja-JP"], rate: 1.08, pitch: 1.02 },
      android: { preferredLangs: ["ja-JP"], rate: 1.08, pitch: 1.02 },
      fallback: { preferredLangs: ["ja-JP"], rate: 1.08, pitch: 1.02 },
    },
    brightJapaneseVoicePreferences: {
      desktop: { preferredNames: ["Microsoft Sayaka", "Microsoft Ayumi", "Microsoft Haruka", "Microsoft Haruka Desktop", "Google 日本語"], preferredLangs: ["ja-JP"], rate: 1.12, pitch: 1.24 },
      android: { preferredLangs: ["ja-JP"], rate: 1.12, pitch: 1.24 },
      fallback: { preferredLangs: ["ja-JP"], rate: 1.12, pitch: 1.24 },
    },
    displayName: "Emma",
    conversationLanguage: "en",
    role: "English teacher, lesson guide, and review teacher",
    isTeacher: true,
    isConversationPartner: false,
    personality: ["kind", "calm", "clear", "patient", "measured with praise"],
    conversationStyle: [
      "concise standard English",
      "clear questions for learners",
      "teacher-like explanations during reviews",
    ],
    waitingPhrases: ["Take your time.", "No hurry."],
    voice: { gender: "female", ageStyle: "adult", speed: "normal", pitchStyle: "normal", tone: "clear and neutral" },
    expressionBias: { smile: 0.5, nod: 0.5, listening: 0.9, thinking: 0.5, surprised: 0.15 },
  },
  mike: {
    id: "mike",
    voicePreferences: {
      desktop: { preferredNames: ["Google UK English Male"], preferredLangs: ["en-GB"], rate: 1.08, pitch: 1.08 },
      android: { preferredLangs: ["en-AU"], rate: 1.08, pitch: 0.95 },
      ios: { preferredVoices: [{ name: "Daniel", lang: "en-GB" }, { name: "Rocko", lang: "en-GB" }, { name: "Ralph", lang: "en-US" }], preferredLangs: ["en-GB", "en-US"], rate: 1.03, pitch: 0.98 },
      fallback: { preferredLangs: ["en-GB"], rate: 1.08, pitch: 1.08 },
    },
    displayName: "Mike",
    conversationLanguage: "en",
    role: "Easygoing friend",
    isTeacher: false,
    isConversationPartner: true,
    personality: ["friendly", "casual", "cheerful", "easygoing"],
    conversationStyle: ["short questions", "everyday conversation", "upbeat but patient pace", "simple vocabulary"],
    waitingPhrases: ["No rush.", "Still thinking?"],
    voice: { gender: "male", ageStyle: "adult", speed: "normal", pitchStyle: "normal", tone: "friendly and slightly upbeat" },
    expressionBias: { smile: 0.9, nod: 0.85, listening: 0.55, thinking: 0.2, surprised: 0.5 },
  },
  sophie: {
    id: "sophie",
    voicePreferences: {
      desktop: { preferredNames: ["Google US English"], preferredLangs: ["en-US"], rate: 1.05, pitch: 1.1 },
      android: { preferredLangs: ["en-AU"], rate: 1.05, pitch: 1.05 },
      ios: { preferredVoices: [{ name: "Flo", lang: "en-US" }, { name: "Karen", lang: "en-AU" }, { name: "Samantha", lang: "en-US" }], preferredLangs: ["en-US", "en-AU"], rate: 0.95, pitch: 1.06 },
      fallback: { preferredLangs: ["en-US"], rate: 1.05, pitch: 1.1 },
    },
    displayName: "Sophie",
    conversationLanguage: "en",
    role: "Bright and curious friend",
    isTeacher: false,
    isConversationPartner: true,
    personality: ["bright", "interested", "curious", "expressive"],
    conversationStyle: ["asks about hobbies and travel", "asks about food and preferences", "asks about enjoyable experiences"],
    waitingPhrases: ["Hmm... need a moment?", "Take your time."],
    voice: { gender: "female", ageStyle: "young", speed: "normal", pitchStyle: "normal", tone: "bright, friendly, and slightly lively" },
    expressionBias: { smile: 0.9, nod: 0.55, listening: 0.55, thinking: 0.2, surprised: 0.9 },
  },
  jamie: {
    id: "jamie",
    voicePreferences: {
      desktop: { preferredNames: ["Google UK English Male"], preferredLangs: ["en-GB"], rate: 0.92, pitch: 0.95 },
      android: { preferredLangs: ["en-US"], rate: 0.92, pitch: 0.92 },
      ios: { preferredVoices: [{ name: "Reed", lang: "en-US" }, { name: "Rishi", lang: "en-IN" }, { name: "Daniel", lang: "en-GB" }], preferredLangs: ["en-US", "en-IN", "en-GB"], rate: 0.96, pitch: 0.98 },
      fallback: { preferredLangs: ["en-GB"], rate: 0.92, pitch: 0.95 },
    },
    displayName: "Jamie",
    conversationLanguage: "en",
    role: "Young professional and approachable colleague",
    isTeacher: false,
    isConversationPartner: true,
    personality: ["calm", "practical", "approachable", "restrained in reactions"],
    conversationStyle: ["asks about work and daily life", "asks about plans and routines", "asks about experiences"],
    waitingPhrases: ["Still thinking?", "Take your time."],
    voice: { gender: "male", ageStyle: "young", speed: "normal", pitchStyle: "normal", tone: "calm and neutral" },
    expressionBias: { smile: 0.5, nod: 0.85, listening: 0.9, thinking: 0.5, surprised: 0.15 },
  },
  lily: {
    id: "lily",
    voicePreferences: {
      desktop: { preferredNames: ["Google UK English Female"], preferredLangs: ["en-GB"], rate: 0.95, pitch: 1.08 },
      android: { preferredLangs: ["en-US"], rate: 0.95, pitch: 1 },
      ios: { preferredVoices: [{ name: "Moira", lang: "en-IE" }, { name: "Karen", lang: "en-AU" }, { name: "Tessa", lang: "en-ZA" }], preferredLangs: ["en-IE", "en-AU", "en-ZA"], rate: 1.02, pitch: 1.06 },
      fallback: { preferredLangs: ["en-GB"], rate: 0.95, pitch: 1.08 },
    },
    displayName: "Lily",
    conversationLanguage: "en",
    role: "Warm and approachable friend",
    isTeacher: false,
    isConversationPartner: true,
    personality: ["gentle", "empathetic", "calm", "good listener"],
    conversationStyle: ["asks about daily life and family", "asks about feelings and preferences", "asks about recent events"],
    waitingPhrases: ["It's okay. Take your time.", "No hurry."],
    voice: { gender: "female", ageStyle: "adult", speed: "slightly_slow", pitchStyle: "normal", tone: "soft and warm" },
    expressionBias: { smile: 0.9, nod: 0.85, listening: 0.9, thinking: 0.2, surprised: 0.5 },
  },
  grandma_rose: {
    id: "grandma_rose",
    voicePreferences: {
      desktop: { preferredNames: ["Google UK English Female"], preferredLangs: ["en-GB"], rate: 0.82, pitch: 0.9 },
      android: { preferredLangs: ["en-NG", "en-IN"], rate: 0.85, pitch: 0.9 },
      ios: { preferredVoices: [{ name: "Grandma", lang: "en-GB" }, { name: "Shelley", lang: "en-GB" }, { name: "Moira", lang: "en-IE" }], preferredLangs: ["en-GB", "en-IE"], rate: 0.9, pitch: 0.96 },
      fallback: { preferredLangs: ["en-GB"], rate: 0.82, pitch: 0.9 },
    },
    displayName: "Grandma Rose",
    conversationLanguage: "en",
    role: "Kind older conversation partner",
    isTeacher: false,
    isConversationPartner: true,
    personality: ["very calm", "patient", "good listener", "draws out experiences"],
    conversationStyle: ["asks about family and memories", "asks about life experiences", "asks about travel and daily life"],
    waitingPhrases: ["There's no hurry.", "Take your time."],
    voice: { gender: "female", ageStyle: "older", speed: "slow", pitchStyle: "normal", tone: "warm and gentle" },
    expressionBias: { smile: 0.5, nod: 0.85, listening: 1, thinking: 0.5, surprised: 0.15 },
  },
  dr_dan: {
    id: "dr_dan",
    voicePreferences: {
      desktop: { preferredNames: ["Google UK English Male"], preferredLangs: ["en-GB"], rate: 0.85, pitch: 0.85 },
      android: { preferredLangs: ["en-GB"], rate: 0.85, pitch: 0.85 },
      ios: { preferredVoices: [{ name: "Grandpa", lang: "en-GB" }, { name: "Ralph", lang: "en-US" }, { name: "Daniel", lang: "en-GB" }], preferredLangs: ["en-GB", "en-US"], rate: 0.92, pitch: 0.96 },
      fallback: { preferredLangs: ["en-GB"], rate: 0.85, pitch: 0.85 },
    },
    displayName: "Dr. Dan",
    conversationLanguage: "en",
    role: "Thoughtful and calm adult",
    isTeacher: false,
    isConversationPartner: true,
    personality: ["calm", "thoughtful", "reason-oriented", "patient"],
    conversationStyle: ["sometimes asks why", "asks how the learner felt", "asks for reasons without overdoing follow-ups"],
    waitingPhrases: ["Need a little more time?", "Take your time."],
    voice: { gender: "male", ageStyle: "older", speed: "slightly_slow", pitchStyle: "low", tone: "low and calm" },
    expressionBias: { smile: 0.2, nod: 0.55, listening: 0.9, thinking: 0.9, surprised: 0.15 },
  },
  leo: {
    id: "leo",
    voicePreferences: {
      desktop: { preferredNames: ["Google US English"], preferredLangs: ["en-US"], rate: 1.1, pitch: 0.92 },
      android: { preferredLangs: ["en-AU"], rate: 1.1, pitch: 0.92 },
      ios: { preferredVoices: [{ name: "Junior", lang: "en-US" }, { name: "Eddy", lang: "en-US" }, { name: "Reed", lang: "en-US" }], preferredLangs: ["en-US"], rate: 1, pitch: 1.1 },
      fallback: { preferredLangs: ["en-US"], rate: 1.1, pitch: 0.92 },
    },
    displayName: "Leo",
    conversationLanguage: "en",
    role: "Curious boy",
    isTeacher: false,
    isConversationPartner: true,
    personality: ["straightforward", "energetic", "curious", "uses simple words"],
    conversationStyle: ["short clear questions", "simple natural vocabulary", "asks what happened next"],
    waitingPhrases: ["Hmm? Is it hard?", "Need more time?"],
    voice: { gender: "male", ageStyle: "child", speed: "normal", pitchStyle: "high", tone: "bright and natural" },
    expressionBias: { smile: 0.9, nod: 0.55, listening: 0.55, thinking: 0.2, surprised: 1 },
  },
  miyabi: {
    id: "miyabi",
    voicePreferences: {
      desktop: { preferredNames: ["Microsoft Nanami Online (Natural) - Japanese (Japan)", "Microsoft Ayumi", "Google 日本語"], preferredLangs: ["ja-JP"], rate: 1.1, pitch: 1.06 },
      android: { preferredLangs: ["ja-JP"], rate: 1.1, pitch: 1.06 },
      ios: { preferredVoices: [{ name: "Kyoko", lang: "ja-JP" }], preferredLangs: ["ja-JP"], rate: 1.1, pitch: 1.02 },
      fallback: { preferredLangs: ["ja-JP"], rate: 1.1, pitch: 1.06 },
    },
    displayName: "Miyabi",
    conversationLanguage: "ja",
    role: "Friendly Japanese university student and casual conversation partner",
    isTeacher: false,
    isConversationPartner: true,
    personality: ["calm", "cheerful", "curious", "friendly", "natural and mature"],
    conversationStyle: [
      "speaks natural modern Japanese",
      "is neither overly formal nor overly casual",
      "reacts naturally and asks one simple follow-up question",
      "does not teach, correct, score, or use exaggerated anime-style speech",
    ],
    waitingPhrases: ["ゆっくりで大丈夫ですよ。", "何か思いつきました？"],
    voice: { gender: "female", ageStyle: "young", speed: "normal", pitchStyle: "normal", tone: "bright, soft, calm, and natural" },
    expressionBias: { smile: 0.85, nod: 0.8, listening: 0.9, thinking: 0.45, surprised: 0.5 },
  },
} satisfies Record<CharacterId, CharacterProfile>;

export const CONVERSATION_PARTNER_IDS = (Object.keys(CHARACTER_PROFILES) as CharacterId[])
  .filter((id) => CHARACTER_PROFILES[id].isConversationPartner);

export const ENGLISH_CONVERSATION_PARTNER_IDS = CONVERSATION_PARTNER_IDS
  .filter((id) => CHARACTER_PROFILES[id].conversationLanguage === "en");
