// uiStatic.ts
// UIで使う「完全に固定の定義」だけを集約する
export const MODES = ["TRAIN", "A", "B", "C", "D", "E", "F"] as const;
export type Mode = typeof MODES[number];

/* ===============================
   UI 文言
   =============================== */
export const UI_TEXT = {
  jp: {
    next: "▷ 次へ",
    pause: "Ⅱ 停止",
    speak: "🎤発声",
    showAnswer: "English",
    keyword: "キーワード（例: see / なるほど）",
    ready: "考えた？",
    recording: "録音中...",
    recogNoSpeech: "音声が検出されませんでした",
    recogError: "音声を認識できませんでした",
    recogNoFunction: "音声認識はサポートされていません",
    autoNext: "自動で次へ",
    uiSounds: "操作音(SE）",
    tts: "英語の音声（TTS）",
    autoSpeak: "タイムアップ時に自動で英語を表す",
    close: "閉じる",
    settings: "設定",
    related: "関連フレーズ",
    practiceGuide:
      "太文字フレーズを押すと関連フレーズを見れます",
  },
  en: {
    next: "▷ Next",
    pause: "Ⅱ Pause",
    speak: "🎤Speak",
    showAnswer: "Japanese",
    keyword: "Keyword (e.g. see / I see)",
    ready: "Ready?",
    recording: "Recording...",
    recogNoSpeech: "No speech detected",
    recogError: "Could not recognize speech",
    recogNoFunction: "Speech recognition not supported",
    autoNext: "Auto Next",
    uiSounds: "UI Sounds",
    tts: "Voice (TTS)",
    autoSpeak: "Show Answer on Timeout",
    close: "Close",
    settings: "Settings",
    related: "Related phrases",
    practiceGuide:
      "Tap the bold phrases to view related phrases.",
  },
} as const;

/* ===============================
   MODE 表示名
   =============================== */
export const MODE_LABELS = {
  jp: {
    TRAIN: "学習する",
    A: "話を受ける",
    B: "感情を表す",
    C: "今を伝える",
    D: "動いてほしい",
    E: "考えを伝える",
    F: "柔らかく言う",
  },
  en: {
    TRAIN: "Training",
    A: "Respond",
    B: "Express feelings",
    C: "Describe the situation",
    D: "Ask for action",
    E: "Share judgement",
    F: "Be considerate",
  },
} as const;

/* ===============================
   Practice モード固定定義
   =============================== */
export const PRACTICE_CONFIG: {
  mainJp: Record<Mode, string | null>;
  subOrder: Record<Mode, string[]>;
} = {
  mainJp: {
    TRAIN: null,
    A: "会話",
    B: "感情",
    C: "状態",
    D: "行動",
    E: "判断",
    F: "配慮",
  },
  subOrder: {
    TRAIN: [],
    A: ["質問", "確認", "促し", "応答", "挨拶"],
    B: ["喜び", "怒り", "悲哀", "驚き", "共感"],
    C: ["体調", "状況", "進行", "環境", "能力"],
    D: ["依頼", "提案", "指示", "制止", "拒否"],
    E: ["同意", "否定", "保留", "許可", "期待"],
    F: ["前置", "安心", "配慮", "教訓", "雑談"],
  },
};

/* ===============================
   TAG → EMOJI
   =============================== */
export const TAG_EMOJI: Record<string, string> = {
  出発: "🚶",
  到着: "📍",
  終了: "🏁",
  促し: "👉",
  指示: "📣",
  依頼: "🙏",
  確認: "❓",
  質問: "❔",

  許可: "👍",
  保留: "⏸️",
  拒否: "✋",
  強調: "❗",
  評価: "⭐",
  一致: "🎯",
  変化: "🔄",

  感情: "❤️",
  安心: "😌",
  心配: "🤔",
  非難: "😠",
  配慮: "🤝",
  期待: "🤞",
  助言: "💡",
  任せて: "🙋",
  思考: "🧠",
  状態: "🔍",
  快諾: "✅",
  謝罪: "🙏",

  注意: "⚠️",
  トラブル: "🚨",
  予防: "🛡️",

  挨拶: "👋",
  応答: "💬",
  近況: "🗣️",
  理由: "🧠",

  支払い: "💰",
  接客: "🙇",
  天気: "🌧️",

  提案: "💡",
  喜び: "😊",
  怒り: "😠",
  悲哀: "😢",
  驚き: "😲",
  共感: "🤝",
  残念: "😞",

  体調: "🤒",
  状況: "📍",
  進行: "🔄",
  環境: "🌍",
  能力: "💪",

  制止: "✋",
  同意: "👍",
  否定: "❌",
  前置: "☝️",
  教訓: "📘",
  雑談: "💬",
};
