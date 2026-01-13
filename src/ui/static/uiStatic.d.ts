export declare const MODES: readonly ["TRAIN", "A", "B", "C", "D", "E", "F", "STAR"];
export type Mode = typeof MODES[number];
export declare const MODE_DESCRIPTIONS: {
    readonly practice: {
        readonly jp: readonly ["そのときの気分や場面に合わせてフレーズを選べます", "★ ブックマークで、よく使う表現を集められます", "発音を聞いて、そのまま口に出せます"];
        readonly en: readonly ["Choose phrases based on how you feel or the situation", "Bookmark useful phrases with ★ for quick access", "Listen to the pronunciation and say it out loud"];
    };
    readonly train: {
        readonly jp: readonly ["自分の発音を録音し、正解と聞き比べて練習できます", "日本語で考える学習にも切り替えられます", "聞き流しでも、自然にフレーズが身につきます"];
        readonly en: readonly ["Record your voice and compare it with the correct pronunciation", "Switch to Japanese-based learning if you prefer", "Learn naturally by listening without active input"];
    };
};
export declare const UI_TEXT: {
    readonly jp: {
        readonly next: "▷ 次へ";
        readonly pause: "Ⅱ 停止";
        readonly speak: "🎤発声";
        readonly showAnswer: "English";
        readonly keyword: "キーワード（例: see / なるほど）";
        readonly ready: "考えた？";
        readonly recording: "録音中...";
        readonly recogNoSpeech: "音声が検出されませんでした";
        readonly recogError: "音声を認識できませんでした";
        readonly recogNoFunction: "音声認識はサポートされていません";
        readonly autoNext: "自動で次へ\n(自動で次のフレーズへ進みます)";
        readonly uiSounds: "操作音\n(ボタン操作時に効果音が鳴ります)";
        readonly tts: "英文録音＆読み上げ（TTS）\n(録音した英語を正解音声と聞き比べます)";
        readonly autoSpeak: "自動で英語を表示\n(時間切れになると英語を表示します)";
        readonly close: "閉じる";
        readonly settings: "設定";
        readonly related: "関連フレーズ";
        readonly practiceGuide: "太文字フレーズを押すと\n関連フレーズを見られます";
        readonly confirmClearStars: "★ をすべて消しますか？";
    };
    readonly en: {
        readonly next: "▷ Next";
        readonly pause: "Ⅱ Pause";
        readonly speak: "🎤 Speak";
        readonly showAnswer: "Japanese";
        readonly keyword: "Keyword (e.g. see / I see)";
        readonly ready: "Ready?";
        readonly recording: "Recording...";
        readonly recogNoSpeech: "No speech detected";
        readonly recogError: "Could not recognize speech";
        readonly recogNoFunction: "Speech recognition not supported";
        readonly autoNext: "Auto Next\n(Move to the next phrase automatically)";
        readonly uiSounds: "UI Sounds\n(Play sounds when tapping buttons)";
        readonly tts: "Record & Play English (TTS)\n(Compare your English with the correct audio)";
        readonly autoSpeak: "Auto-show English\n(Show English automatically when time runs out)";
        readonly close: "Close";
        readonly settings: "Settings";
        readonly related: "Related phrases";
        readonly practiceGuide: "Tap bold phrases\n to view related phrases";
        readonly confirmClearStars: "Remove all bookmarked phrases?";
    };
};
export declare const MODE_LABELS: {
    readonly jp: {
        readonly TRAIN: "学習する";
        readonly A: "話を受ける";
        readonly B: "感情を表す";
        readonly C: "今を伝える";
        readonly D: "動いてほしい";
        readonly E: "考えを伝える";
        readonly F: "柔らかく言う";
        readonly STAR: "★フレーズを見る";
    };
    readonly en: {
        readonly TRAIN: "Training";
        readonly A: "Respond";
        readonly B: "Express feelings";
        readonly C: "Describe the situation";
        readonly D: "Ask for action";
        readonly E: "Share judgement";
        readonly F: "Be considerate";
        readonly STAR: "★View bookmarked phrases";
    };
};
export declare const PRACTICE_CONFIG: {
    mainJp: Record<Mode, string | null>;
    subOrder: Record<Mode, string[]>;
};
export declare const TAG_EMOJI: Record<string, string>;
