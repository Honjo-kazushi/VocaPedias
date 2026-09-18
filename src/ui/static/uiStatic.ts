// uiStatic.ts
// UIで使う「完全に固定の定義」だけを集約する
export const MODES = ["TRAIN", "A", "B", "C", "D", "E", "F", "STAR", "AI"] as const;
export type Mode = typeof MODES[number];
// ★ Scene で使う Mode（TRAIN / STAR を除外）
export type SceneMode = Exclude<Mode, "TRAIN" | "STAR" | "AI">;
export type MainMode = "AI" | "DAILY" | "SCENE" | "TRAIN";

export const MAIN_MODE_LABELS = {
  jp: {
    AI: "AIと会話",
    DAILY: "日常フレーズ",
    SCENE: "場面フレーズ",
    TRAIN: "フレーズ学習",
  },
  en: {
    AI: "AI Conversation",
    DAILY: "Daily Phrases",
    SCENE: "Scene Phrases",
    TRAIN: "Learn Phrases",
  },
} as const;

export const MAIN_MODE_NAV_LABELS = {
  jp: "メイン機能",
  en: "Main features",
} as const;

/* ===============================
   UI 文言
   =============================== */
export const MODE_DESCRIPTIONS = {
  practice: {
    jp: [
      "そのときの気分や場面に合わせてフレーズを選べます",
      "★ ブックマークで、よく使う表現を集められます",
      "発音を聞いて、そのまま口に出せます",
    ],
    en: [
      "Choose phrases based on how you feel or the situation",
      "Bookmark useful phrases with ★ for quick access",
      "Listen to the pronunciation and say it out loud",
    ],
  },

  
  train: {
    jp: [
      "自分の発音を録音し、正解と聞き比べて練習できます",
      "日本語で考える学習にも切り替えられます",
      "聞き流しでも、自然にフレーズが身につきます",
    ],
    en: [
      "Record your voice and compare it with the correct pronunciation",
      "Switch to Japanese-based learning if you prefer",
      "Learn naturally by listening without active input",
    ],
  },

  scene: {
    jp: [
      "いろいろな場面別の定型フレーズを確認できます",
      "必要な表現だけを素早く見つけて使えます",
      "海外でそのまま見せても使えるシンプルな一覧です",
    ],
    en: [
      "Browse fixed phrases organized by specific situations",
      "Quickly find exactly what you need in each scene",
      "A simple list you can even show directly while traveling",
    ],
  },

  ai: {
    jp: [
      "AIキャラクターと英語で自然な会話を楽しめます",
      "今日の話題に合わせて、好きな会話相手を選んでください",
      "会話中は細かく訂正せず、最後にEmmaがまとめて振り返ります",
    ],
    en: [
      "Enjoy natural English conversations with AI characters",
      "Choose your favorite conversation partner for today's topic",
      "Emma will review your English after the conversation",
    ],
  },

} as const;

// uiStatic.ts

export const MODE_SWITCH_TEXT = {
  jp: {
    toPractice: "“フレーズを使う”に切替え",
    toLearn: "“フレーズを学習する”に切替え",
    toScene: "“場面で使うフレーズ”に切替え",
  },
  en: {
    toPractice: "Switch to “Use phrases in context”",
    toLearn: "Switch to “Learn phrases”",
    toScene: "Switch to “Phrases for scenes”",
  },
} as const;

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

    autoNext: "自動で次へ\n(自動で次のフレーズへ進みます)",
    uiSounds: "操作音\n(ボタン操作時に効果音が鳴ります)",
    tts: "英文録音＆読み上げ（TTS）\n(録音した英語を正解音声と聞き比べます)",
    autoSpeak: "自動で英語を表示\n(時間切れになると英語を表示します)",

    close: "閉じる",
    settings: "設定",
    basicSettings: "基本設定",
    learningModeSettings: "学習モード",
    aiConversationSettings: "AIアバターとの会話",
    developerSettings: "開発用",
    uiSoundsLabel: "操作音",
    uiSoundsDescription: "ボタン操作時に効果音が鳴ります",
    ttsLabel: "英文録音＆読み上げ（TTS）",
    ttsDescription: "録音した英語を正解音声と聞き比べます",
    japaneseLearningMode: "Japanese Learning Mode",
    japaneseLearningModeDescription: "English → Japanese practice",
    developerMode: "開発者モード",
    autoNextLabel: "自動で次へ",
    autoNextDescription: "自動で次のフレーズへ進みます",
    showConversationCaptions: "会話字幕を表示",
    showConversationCaptionsDescription: "相手と自分の会話を文字で表示します。",
    related: "関連フレーズ",

    practiceGuide:
      "太文字フレーズを押すと\n関連フレーズを見られます",

    confirmClearStars: "★ をすべて消しますか？",
  },

  en: {
    next: "▷ Next",
    pause: "Ⅱ Pause",
    speak: "🎤 Speak",
    showAnswer: "Japanese",
    keyword: "Keyword (e.g. see / I see)",
    ready: "Ready?",
    recording: "Recording...",
    recogNoSpeech: "No speech detected",
    recogError: "Could not recognize speech",
    recogNoFunction: "Speech recognition not supported",

    autoNext: "Auto Next\n(Move to the next phrase automatically)",
    uiSounds: "UI Sounds\n(Play sounds when tapping buttons)",
    tts: "Record & Play English (TTS)\n(Compare your English with the correct audio)",
    autoSpeak: "Auto-show English\n(Show English automatically when time runs out)",

    close: "Close",
    settings: "Settings",
    basicSettings: "Basic Settings",
    learningModeSettings: "Learning Mode",
    aiConversationSettings: "AI Avatar Conversation",
    developerSettings: "Developer",
    uiSoundsLabel: "UI Sounds",
    uiSoundsDescription: "Play sounds when tapping buttons",
    ttsLabel: "Record & Play English (TTS)",
    ttsDescription: "Compare your English with the correct audio",
    japaneseLearningMode: "Japanese Learning Mode",
    japaneseLearningModeDescription: "English → Japanese practice",
    developerMode: "Developer Mode",
    autoNextLabel: "Auto Next",
    autoNextDescription: "Move to the next phrase automatically",
    showConversationCaptions: "Show conversation captions",
    showConversationCaptionsDescription: "Display your conversation with the AI as text.",
    related: "Related phrases",

    practiceGuide:
      "Tap bold phrases\n to view related phrases",

    confirmClearStars: "Remove all bookmarked phrases?",
  },
} as const;

/* ===============================
   MODE 表示名
   =============================== */
export const MODE_LABELS = {
  jp: {
    TRAIN: "学習する",

    // ===== 実践モード（既存） =====
    A: "話を受ける",
    B: "感情を表す",
    C: "今を伝える",
    D: "動いてほしい",
    E: "考えを伝える",
    F: "柔らかく言う",

    STAR: "★フレーズを見る",
    AI: "AI英会話",
  },

  en: {
    TRAIN: "Training",

    // ===== Practice =====
    A: "Respond",
    B: "Express feelings",
    C: "Describe the situation",
    D: "Ask for action",
    E: "Share judgement",
    F: "Be considerate",

    STAR: "★View bookmarked phrases",
    AI: "AI Conversation",
  },

  /* ★ 追加：場面モード用ラベル */
  scene: {
    jp: {
      A: "ホテルで",
      B: "移動で",
      C: "レストランで",
      D: "買い物で",
      E: "会議で",
      F: "病院で",
    },
    en: {
      A: "At a hotel",
      B: "While traveling",
      C: "At a restaurant",
      D: "Shopping",
      E: "In a meeting",
      F: "At a hospital",
    },
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
    STAR: "★",
    AI: null,
  },
  subOrder: {
    TRAIN: [],
    A: ["質問", "確認", "促し", "応答", "挨拶"],
    B: ["喜び", "怒り", "悲哀", "驚き", "共感"],
    C: ["体調", "状況", "進行", "環境", "能力"],
    D: ["依頼", "提案", "指示", "制止", "拒否"],
    E: ["同意", "否定", "保留", "許可", "期待"],
    F: ["前置", "安心", "配慮", "教訓", "雑談"],
    STAR:   [],
    AI: [],
  },
};

export const SCENE_CONFIG: {
  mainJp: Record<SceneMode, string>;
  subOrder: Record<string, string[]>;
} = {
  mainJp: {
    A: "ホテル",
    B: "移動",
    C: "レストラン",
    D: "買い物",
    E: "会議",
    F: "病院",
  },

  subOrder: {
    ホテル: ["予約", "料金", "部屋", "トラブル", "サービス"],
    移動: ["行先", "時間", "料金", "乗換", "トラブル"],
    レストラン: ["入店", "注文", "料理", "会計", "トラブル"],
    買い物: ["商品", "サイズ", "価格", "支払", "トラブル"],
    会議: ["開始", "確認", "提案", "調整", "締め"],
    病院: ["受付", "症状", "診察", "薬", "トラブル"],
  },
};

export const SUB_LABELS_EN: Record<string, string> = {
  質問: "Questions", 確認: "Confirm", 促し: "Prompts", 応答: "Responses", 挨拶: "Greetings",
  喜び: "Joy", 怒り: "Anger", 悲哀: "Sadness", 驚き: "Surprise", 共感: "Empathy",
  体調: "Health", 状況: "Situation", 進行: "Progress", 環境: "Environment", 能力: "Ability",
  依頼: "Requests", 提案: "Suggestions", 指示: "Instructions", 制止: "Stopping", 拒否: "Refusals",
  同意: "Agreement", 否定: "Disagreement", 保留: "Pending", 許可: "Permission", 期待: "Expectations",
  前置: "Openers", 安心: "Reassurance", 配慮: "Consideration", 教訓: "Lessons", 雑談: "Small Talk",
  予約: "Reservations", 料金: "Rates", 部屋: "Rooms", トラブル: "Problems", サービス: "Services",
  行先: "Destinations", 時間: "Times", 乗換: "Transfers",
  入店: "Arrival", 注文: "Ordering", 料理: "Food", 会計: "Payment",
  商品: "Products", サイズ: "Sizes", 価格: "Prices", 支払: "Payment",
  開始: "Opening", 調整: "Coordination", 締め: "Closing",
  受付: "Reception", 症状: "Symptoms", 診察: "Examination", 薬: "Medicine",
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

  会話: "💬",
  聞き返し: "❓",
  話題転換: "💬",
  前置き: "☝️",
  説明: "🧠",

  案内: "📣",
  順序: "🔄",
  開始: "🔄",
  完了: "🏁",
  移動: "🚶",

  時間: "🔄",
  予定: "🔄",
  頻度: "🔄",
  習慣: "🌍",

  不満: "😠",
  悲しみ: "😢",
  落胆: "😢",
  困惑: "🤔",
  違和感: "🤔",
  励まし: "🤝",
  称賛: "⭐",
  自信: "💪",

  結論: "🎯",
  決断: "🎯",
  覚悟: "🎯",
  不確実: "⏸️",

  警告: "🚨",

  買い物: "💰",
  交渉: "💰",
  場所: "📍",
  仕事: "🧠",

  注意喚起: "⚠️",
  指摘: "☝️",
  疑問: "❓",
  納得: "🙂",
  曖昧: "🤔",
  断り: "✋",

  喪失: "😢",
  後悔: "😔",
  応援: "📣",
  感謝: "🙏",

  予想: "🔮",
  予測: "🔮",
  記憶: "🧠",

  日常: "🏠",
  順番: "🔢",

  味: "👅",
  食事: "🍽️",
  感覚: "🖐️",
  合意: "🤝",
  判断: "⚖️",
  注文: "📝",
  諦め: "😮‍💨",
  医療: "🩺",
  映画: "🎬",
  道案内: "🧭",
  強気: "🔥",
  突然: "⚡",
  引受: "📦",
  事実: "📌",
  量: "📏",
  申し出: "🙋",
  制度: "🏛️",
  反応: "😮", 

  // ホテル
  予約: "📅",
  料金: "💳",
  部屋: "🛏️",
  サービス: "🛎️",

  // 移動
  行先: "📍",
  乗換: "🔁",

  // レストラン
  入店: "🚪",
  料理: "🍲",
  会計: "💰",

  // 買い物
  商品: "📦",
  サイズ: "📐",
  価格: "🏷️",
  支払: "💳",

  // 会議
  調整: "⚙️",
  締め: "🏁",

  // 病院
  受付: "🧾",
  症状: "🤒",
  診察: "🩺",
  薬: "💊",

};
