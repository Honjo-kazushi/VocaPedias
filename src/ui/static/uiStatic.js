// uiStatic.ts
// UIで使う「完全に固定の定義」だけを集約する
export const MODES = ["TRAIN", "A", "B", "C", "D", "E", "F", "STAR"];
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
};
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
        related: "関連フレーズ",
        practiceGuide: "太文字フレーズを押すと\n関連フレーズを見られます",
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
        related: "Related phrases",
        practiceGuide: "Tap bold phrases\n to view related phrases",
        confirmClearStars: "Remove all bookmarked phrases?",
    },
};
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
        STAR: "★フレーズを見る",
    },
    en: {
        TRAIN: "Training",
        A: "Respond",
        B: "Express feelings",
        C: "Describe the situation",
        D: "Ask for action",
        E: "Share judgement",
        F: "Be considerate",
        STAR: "★View bookmarked phrases",
    },
};
/* ===============================
   Practice モード固定定義
   =============================== */
export const PRACTICE_CONFIG = {
    mainJp: {
        TRAIN: null,
        A: "会話",
        B: "感情",
        C: "状態",
        D: "行動",
        E: "判断",
        F: "配慮",
        STAR: "★",
    },
    subOrder: {
        TRAIN: [],
        A: ["質問", "確認", "促し", "応答", "挨拶"],
        B: ["喜び", "怒り", "悲哀", "驚き", "共感"],
        C: ["体調", "状況", "進行", "環境", "能力"],
        D: ["依頼", "提案", "指示", "制止", "拒否"],
        E: ["同意", "否定", "保留", "許可", "期待"],
        F: ["前置", "安心", "配慮", "教訓", "雑談"],
        STAR: [],
    },
};
/* ===============================
   TAG → EMOJI
   =============================== */
export const TAG_EMOJI = {
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
