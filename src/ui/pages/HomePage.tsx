// =====================================================
// imports / types
// =====================================================
import "../../styles/style.css";
import { useEffect, useState, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

import { InMemoryPhraseRepository } from "../../infra/InMemoryPhraseRepository";
import type { Phrase } from "../../app/ports/PhraseRepository";
import { playSe } from "../../sound/playSe";
import { speakEn } from "../../sound/speakEn";
import { PHRASES_SEED } from "../../data/phrases.seed";
import { getNextPhrase } from "../../app/usecases/getNextPhrase";

import type { Mode } from "../static/uiStatic";
import {
  UI_TEXT,
  MODE_LABELS,
  PRACTICE_CONFIG,
  TAG_EMOJI,
} from "../static/uiStatic";


export type PickLog = {
  time: number;                 // Date.now()
  order: number;                // 何問目か（0,1,2,...）
  phraseId: string;

  // 分類（tags[0]を代表として使う）
  primaryTag: string | null;    // 例: "否定" / "安心" / null

  // PickReason 由来
  rule: string;
  detail: string;

  // ユーザー行動
  revealed: boolean;            // 英語を見るを押したか
  revealAtSec: number | null;   // 押した秒数（押してないなら null）
  timeout: boolean;             // タイムアップで次へ行ったか

  // 時間
  elapsedTotal: number;         // （いまはタイムアップ時に 5 を入れる程度でOK）

  // 文脈
  tagOrder: number;             // このタグが「何回目」に出たか（1,2,3,...）
  consecutiveSameTag: number;   // 同じタグが連続何回目か
};

// =====================================================
// HomePage
// =====================================================
export default function HomePage() {

  // =====================================================
  // 1. 共通（設定・モード・共用 state）
  // =====================================================
  const [mode, setMode] = useState<Mode>("A");

  const [soundOn, setSoundOn] = useState<boolean>(() => readBool("soundOn", true));
  const [ttsOn, setTtsOn] = useState<boolean>(() => readBool("ttsOn", true));
  const [jpLearnMode, setJpLearnMode] = useState<boolean>(() => readBool("jpLearnMode", false));
  const [autoNext, setAutoNext] = useState<boolean>(() => readBool("autoNext", true));
  const [autoSpeakOnTimeout, setAutoSpeakOnTimeout] =
    useState<boolean>(() => readBool("autoSpeakOnTimeout", false));

  const [debugMode, setDebugMode] =
    useState<boolean>(() => readBool("debugMode", false));
  const debugHoldTimerRef = useRef<number | null>(null);

  const [showSettings, setShowSettings] = useState(false);

  const playClickSe = () => {
    if (soundOn) playSe();
  };

  function readBool(key: string, def: boolean) {
    const v = localStorage.getItem(key);
    if (v === null) return def;
    try {
      return JSON.parse(v);
    } catch {
      return def;
    }
  }

    // =====================================================
  // 2. 学習モード（TRAIN）
  // =====================================================

  // ---------- state ----------
  const [randomPhrase, setRandomPhrase] = useState<Phrase | null>(null);
  const [showEn, setShowEn] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [goNext, setGoNext] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const jpTimerRef = useRef<number | null>(null);
  const enTimerRef = useRef<number | null>(null);
  const speakGenRef = useRef(0);

  const repo = useMemo(
    () => new InMemoryPhraseRepository(PHRASES_SEED),
    []
  );

  const [pickLogs, setPickLogs] = useState<PickLog[]>([]);
  const [starState, setStarState] = useState<Set<string>>(() => new Set());
  const [, setOkStreak] = useState<Record<string, number>>({});

  // ===== Speech debug log =====
  type SpeechLog = {
    time: number;
    event: string;
  };

  const speechFailureRef = useRef<"NONE" | "NO_SPEECH" | "NO_FUNCTION" | "ERROR">("NONE");

  const [speechLogs, setSpeechLogs] = useState<SpeechLog[]>([]);
  const pushSpeechLog = (event: string) => {
    if (!debugMode) return;
    const MAX_SPEECH_LOGS = 7;

    setSpeechLogs((logs) => [
      ...logs.slice(-(MAX_SPEECH_LOGS - 1)),
      { time: Date.now(), event },
    ]);
  };


  // =====================================================
  // 3. 実践モード（PRACTICE）
  // =====================================================
  const [practiceStars, setPracticeStars] = useState<Set<string>>(() => new Set());
  const [practiceSub, setPracticeSub] = useState<string | null>(null);
  const [activeMeaningGroup, setActiveMeaningGroup] = useState<string | null>(null);
  const practiceListRef = useRef<HTMLDivElement | null>(null);

  const practiceMainJp =
    mode !== "TRAIN" ? PRACTICE_CONFIG.mainJp[mode] : null;

  const practiceMainPhrases = useMemo(() => {
    if (!practiceMainJp) return [];
    return PHRASES_SEED.filter(p => p.tags2?.main === practiceMainJp);
  }, [practiceMainJp]);

  const practiceSubStats = useMemo(() => {
    // sub -> count（出現順を維持）
    const map = new Map<string, number>();
    for (const p of practiceMainPhrases) {
      const sub = p.tags2?.sub?.trim();
      if (!sub) continue;
      map.set(sub, (map.get(sub) ?? 0) + 1);
    }
  const order = PRACTICE_CONFIG.subOrder[mode] ?? [];
  return order
    .filter(sub => map.has(sub))
    .map(sub => ({ sub, count: map.get(sub)! }));
  }, [practiceMainPhrases, mode]);

  // =====================================================
  // 4. UI 文言
  // =====================================================
  const UI = jpLearnMode ? UI_TEXT.en : UI_TEXT.jp;
  const MODE_LABELS_VIEW = jpLearnMode ? MODE_LABELS.en : MODE_LABELS.jp;

  // =====================================================
  // 5. JSX
  // =====================================================
  // Version表示
  const buildTimeJst = new Date(__BUILD_TIME__).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });


  const togglePracticeStar = (id: string) => {
    setPracticeStars(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const clearAllStars = () => {
    setPracticeStars(new Set());
    localStorage.removeItem("practiceStars");
  };

  const canAcceptInput = () => {
    if (isPaused) return false;
    if (isBusy) return false;
    // if (elapsed < 0.5) return false;
    if (!showEn && autoNext && elapsed >= 4.5) return false;
    return true;
  };

  // ===== Speech Recognition =====
  const recognitionRef = useRef<any>(null);
  const [speechState, setSpeechState] =
    useState<"IDLE" | "RECORDING" | "RECOGNIZED">("IDLE");
  const [spokenText, setSpokenText] = useState<string | null>(null);
  const speechTextStyle: React.CSSProperties = {
    fontSize: "0.85em",
    color: "#666",
    marginTop: 4,
    lineHeight: 1.3,
  };

  function initSpeechRecognition() {
  if (!ttsOn) return;
  if (recognitionRef.current) return;

    pushSpeechLog("initSpeechRecognition()"); // log1

  const SR =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  if (!SR) {
    console.warn("SpeechRecognition not supported");
    setSpokenText(UI.recogNoFunction);
    setSpeechState("IDLE");
    return;
    }

  const rec = new SR();
  rec.lang = jpLearnMode ? "ja-JP" : "en-US";
  rec.continuous = false;
  rec.interimResults = false;

  rec.onstart = () => {
  pushSpeechLog("onstart");               // log3
  // setSpokenText(null);
    setSpeechState("RECORDING");
  };

  rec.onresult = (e: any) => {
    pushSpeechLog("onresult");               // log4
    const text = e.results[0][0].transcript;
    setSpokenText(text);
  };

  rec.onend = () => {
    pushSpeechLog("onend");                  // log5
    const dur = Date.now() - recordStartedAtRef.current;
    const hasSpeech = !!(spokenText && spokenText.trim() !== "");

    // ★ 無音かつ早すぎ → 1回だけやり直す
    if (!hasSpeech && dur < MIN_NO_SPEECH_MS && noSpeechRetryRef.current < 1) {
      noSpeechRetryRef.current += 1;
      recordStartedAtRef.current = Date.now();

      try {
        recognitionRef.current?.start();
      } catch {}

      return; // ★ 認識完了扱いにしない
    }

    // ===== 認識完了 =====
    speechSynthesis.cancel();
    speakGenRef.current += 1;
    setSpeechState("RECOGNIZED");

    // ★ 無音・失敗時の補正（UI 文言をそのまま入れる）
  setSpokenText((prev) => {
    if (prev && prev.trim() !== "") return prev;

    if (speechFailureRef.current === "NO_SPEECH") {
      return UI.recogNoSpeech;
    }

    return prev; // 何もしない
  });

    recognitionRef.current = null;
    const gen = speakGenRef.current;

    // ★ 認識後は必ず「正解表示」
    setShowEn(true);

    // ★ 正解 TTS
    if (randomPhrase) {
      speakEn(
        jpLearnMode ? randomPhrase.jp : randomPhrase.en,
        () => {
          if (speakGenRef.current !== gen) return;
          if (autoNext && !isPaused) requestGoNext();
        },
        jpLearnMode ? "ja" : "en"
      );
    }
  };

  rec.onerror = (e: any) => {
    pushSpeechLog(`error:${e.error}`);          // log6
    console.warn("SpeechRecognition error", e);
    
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      speechFailureRef.current = "NO_FUNCTION";
      setSpokenText(UI.recogNoFunction);
    } else {
      speechFailureRef.current = "ERROR";
      setSpokenText(UI.recogError);
    }
        setSpeechState("IDLE");
        // ★ 保険：error時も必ず続行
        if (autoNext && !isPaused) {
          requestGoNext();
        }
    };

  recognitionRef.current = rec;
}

const MAX_RECORD_MS = 6000;
const recordStartedAtRef = useRef<number>(0);
const noSpeechRetryRef = useRef<number>(0);
const MIN_NO_SPEECH_MS = 1800; // ★ 1.8秒未満は「早すぎ」

function hasPracticeStar(logs: PickLog[], phraseId: string, copied: Set<string>) {
  if (!copied.has(phraseId)) return false;
  const r = logs.filter(l => l.phraseId === phraseId).slice(-3);
  return r.length === 3 && r.every(l => !l.timeout && !l.revealed);
}

function onFail(phraseId: string) {
  setStarState(prev => {
    if (!prev.has(phraseId)) return prev;
    const next = new Set(prev);
    next.delete(phraseId);
    return next;
  });
}

 function isSpeechRecognizedOK() {
   if (
     speechState !== "RECOGNIZED" ||
     !spokenText ||
     speechFailureRef.current !== "NONE" ||
     !randomPhrase
   ) {
     return false;
   }

  const answer = jpLearnMode
    ? randomPhrase.jp
    : randomPhrase.en;

  return isRoughlyMatched(spokenText, answer, jpLearnMode);
 }

 // ★ 意味を持たない語（最小セット）
/* const STOP_WORDS = new Set([
  "a", "an", "the",
  "to", "on", "in", "at", "for", "of",
  "is", "are", "was", "were",
  "be", "been", "being"
]);
 */
function normalizeEnglish(text: string): string[] {
  let t = text.toLowerCase();

  // ===== 口語・短縮形の正規化 =====
  const replacements: Record<string, string> = {
    "you're": "you are",
    "youre": "you are",
    "i'm": "i am",
    "it's": "it is",
    "he's": "he is",
    "she's": "she is",
    "they're": "they are",
    "we're": "we are",

    "gonna": "going to",
    "wanna": "want to",
    "gotta": "got to",
    "lemme": "let me",
    "kinda": "kind of",
    "sorta": "sort of",
    // ★ 追加：同義語吸収
    "ok": "okay",
    "alright": "okay",
    "all right": "okay",

  };

  for (const [k, v] of Object.entries(replacements)) {
    t = t.replace(new RegExp(`\\b${k}\\b`, "g"), v);
  }

  // ===== 記号除去 =====
  t = t.replace(/[^\w\s]/g, " ");

  // ===== 分割 =====
  return t
    .split(/\s+/)
    .map(w => w.trim())
    .filter(Boolean);
}

function normalizeJapanese(s: string): string[] {
  return s
    // ★ 絵文字・記号・英数字をすべて除去
    .replace(
      /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu,
      ""
    )
    .replace(/[A-Za-z0-9]/g, "")
    .replace(/[。、，．・：；！？!?「」『』（）()\[\]【】\s]/g, "")
    .split("")
    .filter(Boolean);
}

// ★ 数量・年齢などを含むか（簡易）
function extractNumbers(s: string): string[] {
  return (
    s
      .normalize("NFKC")
      .match(/[0-9一二三四五六七八九十百千万億]+/g)
      ?? []
  );
}

// ★ debug用：発話と正解を「判定を締める」
/* 判定ルール（英語）
1.一致率 ≥ 70%
2.一致語数 ≥ max(2, 正解主要語数 × 0.6)
3.正解フレーズの「最後の主要語」を含んでいること
判定ルール（日本語）
1. 一致率（文字）
2. 最低一致文字数
3. 数量・数詞がある場合は必須
*/
function isRoughlyMatched(
  spoken: string,
  answer: string,
  isJapanese: boolean
): boolean {
  if (!spoken || !answer) return false;

  // =====================================================
  // ★ 数字チェック（言語非依存・最優先）
  //   数字が含まれる場合は「完全一致」必須
  // =====================================================
  const numsA = extractNumbers(answer);
  const numsB = extractNumbers(spoken);

  if (numsA.length > 0 || numsB.length > 0) {
    if (numsA.join(",") !== numsB.join(",")) {
      return false; // ★ 数字が違えば即 NG
    }
  }

  // =====================================================
  // ★ 日本語判定
  // =====================================================
  if (isJapanese) {
    const a = normalizeJapanese(answer);
    const b = normalizeJapanese(spoken);

    if (a.length === 0 || b.length === 0) return false;

    let hit = 0;
    const bSet = new Set(b);
    for (const ch of a) {
      if (bSet.has(ch)) hit++;
    }

    const ratio = hit / a.length;

    // 最低条件（実用寄り・緩め）
    return ratio >= 0.5 && hit >= 3;
  }

  // =====================================================
  // ★ 英語判定（既存ロジック）
  // =====================================================
  const answerWords = normalizeEnglish(answer);
  const spokenWordsArr = normalizeEnglish(spoken);
  const spokenWords = new Set(spokenWordsArr);

  if (answerWords.length === 0) return false;

  // ★ 1単語フレーズは「その単語が言えているか」だけを見る
  if (answerWords.length === 1) {
    return spokenWords.has(answerWords[0]);
  }
  
  let hit = 0;
  for (const w of answerWords) {
    if (spokenWords.has(w)) hit++;
  }

  const ratio = hit / answerWords.length;
  const minHits = Math.max(2, Math.ceil(answerWords.length * 0.6));
  const lastKeyWord = answerWords[answerWords.length - 1];

  return (
    ratio >= 0.7 &&
    hit >= minHits &&
    spokenWords.has(lastKeyWord)
  );
}


function startSpeechFlow() {
  
pushSpeechLog("startSpeechFlow()");
if (!ttsOn) {
  pushSpeechLog("ttsOff");
  return;
}
if (speechState !== "IDLE") {
  pushSpeechLog("blocked:not IDLE");
  return;
}
if (!recognitionRef.current) {
  pushSpeechLog("no recognitionRef");
}
  
  
  
  if (!ttsOn) return;
  if (speechState !== "IDLE") return;
  
  // ★ 念のため毎回初期化
  if (!recognitionRef.current) {
    initSpeechRecognition();
  }
  if (!recognitionRef.current) {
    console.warn("SpeechRecognition not initialized");
    return;
  }
  setSpokenText(null);
  noSpeechRetryRef.current = 0;
  recordStartedAtRef.current = Date.now();

    try {
      pushSpeechLog("recognition.start()");
      recognitionRef.current.start();

      // ★ 最大6秒で強制終了
      window.setTimeout(() => {
        try {
          recognitionRef.current?.stop();
        } catch {}
      }, MAX_RECORD_MS);

    } catch {
      pushSpeechLog("start() threw");
      setSpokenText(UI.recogNoFunction);
      setSpeechState("RECOGNIZED");
      setShowEn(true);

      if (randomPhrase && ttsOn) {
        const gen = ++speakGenRef.current;
        speakEn(
          jpLearnMode ? randomPhrase.jp : randomPhrase.en,
          () => {
            if (speakGenRef.current !== gen) return;
            if (autoNext && !isPaused) requestGoNext();
          },
          jpLearnMode ? "ja" : "en"
        );
      } else {
        if (autoNext) scheduleGoNext2s();
      }
    }
  }



  
  const relatedPhrases = useMemo(() => {
    if (!activeMeaningGroup) return [];
    return PHRASES_SEED
      .filter((p) => p.meaningGroup === activeMeaningGroup)
      .slice()
      .sort((a, b) => a.jp.localeCompare(b.jp, "ja"));
  }, [activeMeaningGroup]);

  const sortByJapanese = (a: Phrase, b: Phrase) =>
    a.jp.localeCompare(b.jp, "ja");


const [speakingPhraseId, setSpeakingPhraseId] = useState<string | null>(null);
const speakPractice = (p: Phrase) => {
  // いま喋っている音声を止める
  speechSynthesis.cancel();

  setSpeakingPhraseId(p.id);

  speakEn(
    jpLearnMode ? p.jp : p.en,
    () => {
      setSpeakingPhraseId(null);
    },
    jpLearnMode ? "ja" : "en"
  );
};


const practicePhrases = useMemo(() => {
  const list = practiceSub
    ? practiceMainPhrases.filter(p => p.tags2?.sub === practiceSub)
    : practiceMainPhrases;

  return list.slice().sort(sortByJapanese);
}, [practiceMainPhrases, practiceSub]);


// ★ デバッグモード時、認識成功で自動的にスター付与
useEffect(() => {
  if (!debugMode) return;
  if (speechState !== "RECOGNIZED") return;
  if (!randomPhrase) return;

  const id = randomPhrase.id;
  const ok = isSpeechRecognizedOK();

  if (ok) {
    setOkStreak(prev => {
      const nextCount = (prev[id] ?? 0) + 1;

      // ===== ログ（連続成功）=====
      console.log("[LEARN OK]", {
        phraseId: id,
        streak: nextCount,
      });

      // ★ 3回連続で付与
      if (nextCount >= 3) {
        setStarState(starPrev => {
          if (starPrev.has(id)) return starPrev;
          const next = new Set(starPrev);
          next.add(id);

          console.log("[LEARN ★ SET]", {
            phraseId: id,
            jp: randomPhrase.jp,
            en: randomPhrase.en,
          });

          return next;
        });
      }

      return { ...prev, [id]: nextCount };
    });
  } else {
    // ===== 失敗：連続カウントリセット =====
    setOkStreak(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];

      console.log("[LEARN FAIL]", {
        phraseId: id,
        action: "streak reset",
      });

      return next;
    });
  }
}, [speechState]);


useEffect(() => {
  if (mode !== "TRAIN") {
    setPracticeStars(new Set(starState));
  }
}, [mode, starState]);


useEffect(() => {
  if (mode === "TRAIN") return;

  // Practiceに入ったら、ポップアップは閉じる
  setActiveMeaningGroup(null);

  // subを先頭に自動選択（出現順の先頭）
  const first = practiceSubStats[0]?.sub ?? null;
  setPracticeSub(first);
}, [mode, practiceSubStats]);

useEffect(() => {
  localStorage.setItem("debugMode", JSON.stringify(debugMode));
}, [debugMode]);



  function RecentLogs({ logs }: { logs: PickLog[] }) {
    const recent = logs.slice(-5).reverse();

    return (
      <div
        style={{
          marginTop: 12,
          padding: 8,
          fontSize: "0.8em",
          color: "#555",
          borderTop: "1px dashed #ccc",
        }}
      >
        {recent.map((l) => (
          <div key={l.order}>
            #{l.order}{" "}
            [{l.primaryTag ?? "-"}] {l.phraseId}{" "}
            / tag#{l.tagOrder}{" "}
            / 連続{l.consecutiveSameTag}
            {" / "}
            {l.revealed
              ? `見た:${l.revealAtSec}s`
              : l.timeout
              ? "タイムアップ(5s)"
              : "未判定"}
          </div>
        ))}
      </div>
    );
  }



  const resetTrainingState = () => {
    // JP タイマー
    if (jpTimerRef.current !== null) {
      clearInterval(jpTimerRef.current);
      jpTimerRef.current = null;
    }

    // EN タイマー
    if (enTimerRef.current !== null) {
      clearTimeout(enTimerRef.current);
      enTimerRef.current = null;
    }

    // TTS 停止
    speechSynthesis.cancel();

    // 発声世代を進めて、古い callback を無効化
    speakGenRef.current += 1;

    // 学習用 state を初期化
    setIsPaused(false);
    setIsBusy(false);
    setGoNext(false);
    setShowEn(false);
    setElapsed(0);
  };

  
  const requestGoNext = () => {
    setGoNext(true);
  };

  const startQuestion = async () => {
    if (isBusy) return;

    // ===== 既存：EN/TTS/タイマーの後始末 =====
    clearEnTriggers();

    // ===== ★ 音声入力は「問題単位」なので必ず最初にリセット =====
    setSpokenText(null);
    setSpeechState("IDLE");
    noSpeechRetryRef.current = 0;

    // ★ すでに停止中なら「準備だけして開始しない」
    if (isPaused) {
      const result = await getNextPhrase(
        repo,
        randomPhrase?.id,
        pickLogs,
        starState        // ★渡す
      );

      setRandomPhrase(result.phrase);
      setShowEn(false);
      setElapsed(0);
      return; // ← 開始しない
    }

    setIsBusy(true);

    try {
      const result = await getNextPhrase(
        repo,
        randomPhrase?.id,
        pickLogs,
        starState        // ★渡す
      );

      // ===== 新しい問題をセット =====
      setRandomPhrase(result.phrase);
      setShowEn(false);
      setElapsed(0);

      // ===== PickLog 更新（既存そのまま）=====
      setPickLogs((logs) => {
        const primaryTag =
          result.phrase.tags && result.phrase.tags.length > 0
            ? result.phrase.tags[0]
            : null;

        const sameTagCount = logs.filter(
          (l) => l.primaryTag === primaryTag
        ).length;

        const prev = logs[logs.length - 1];
        const consecutiveSameTag =
          prev && prev.primaryTag === primaryTag
            ? prev.consecutiveSameTag + 1
            : 1;

        return [
          ...logs,
          {
            time: Date.now(),
            order: logs.length,
            phraseId: result.phrase.id,

            primaryTag,
            rule: result.reason.rule,
            detail: result.reason.detail,

            revealed: false,
            revealAtSec: null,
            timeout: false,

            elapsedTotal: 0,

            tagOrder: sameTagCount + 1,
            consecutiveSameTag,
          },
        ];
      });
    } finally {
      setIsBusy(false);
    }
  };


  const clearEnTriggers = () => {
  if (enTimerRef.current !== null) {
    clearTimeout(enTimerRef.current);
    enTimerRef.current = null;
  }
  speakGenRef.current += 1;      // 以後、古いTTS callbackは無効
  speechSynthesis.cancel();      // 発声自体も止める
};

  const scheduleGoNext2s = () => {
  // 2秒タイマーは常に1本
  if (enTimerRef.current !== null) {
    clearTimeout(enTimerRef.current);
    enTimerRef.current = null;
  }
  enTimerRef.current = window.setTimeout(() => {
    enTimerRef.current = null;
    requestGoNext();
  }, 2000);
};

useEffect(() => {
  // === TRAIN / PRACTICE 切替時の完全リセット ===
  resetTrainingState();

  if (mode === "TRAIN") {
    // 学習モードは毎回新規スタート
    setRandomPhrase(null);
    setPickLogs([]);
  } else {
    // 実践モードでは学習系の表示物を消す
    setActiveMeaningGroup(null);
  }
}, [mode]);

  useEffect(() => {
    if (!debugMode) return;
    console.table(pickLogs);
  }, [pickLogs, debugMode]);


  useEffect(() => {
    localStorage.setItem("soundOn", JSON.stringify(soundOn));
  }, [soundOn]);

  useEffect(() => {
    localStorage.setItem("ttsOn", JSON.stringify(ttsOn));
  }, [ttsOn]);

  useEffect(() => {
    localStorage.setItem("autoNext", JSON.stringify(autoNext));
  }, [autoNext]);

  useEffect(() => {
    localStorage.setItem(
      "autoSpeakOnTimeout",
      JSON.stringify(autoSpeakOnTimeout)
    );
  }, [autoSpeakOnTimeout]);

  useEffect(() => {
    localStorage.setItem("jpLearnMode", JSON.stringify(jpLearnMode));
  }, [jpLearnMode]);

  useEffect(() => {
    if (!ttsOn) {
      speechSynthesis.cancel();
    }
  }, [ttsOn]);

  useEffect(() => {
    if (!goNext) return;
  
    setGoNext(false);
    startQuestion();
  }, [goNext]);


  useEffect(() => {
    if (mode !== "TRAIN") return;   // ★最重要
    if (isPaused) return;
    if (!randomPhrase) return;
    if (showEn) return;

    // ★ 既存JPタイマーがあれば必ず止める
    if (jpTimerRef.current !== null) {
      clearInterval(jpTimerRef.current);
      jpTimerRef.current = null;
    }

    jpTimerRef.current = window.setInterval(() => {
      setElapsed((e) => {
        const next = e + 1;

        if (next >= 5 && !showEn && !isPaused) {

          setPickLogs((logs) => {
            if (logs.length === 0) return logs;
            const last = logs[logs.length - 1];
            // ★ 失敗確定（timeout）
            onFail(last.phraseId);

            return [
              ...logs.slice(0, -1),
              {
                ...last,
                timeout: true,
                elapsedTotal: next,
              },
            ];
          });

          // ★ JP → EN 遷移点（ここで必ず①を止める）
          if (jpTimerRef.current !== null) {
            clearInterval(jpTimerRef.current);
            jpTimerRef.current = null;
          }

          // ★ 自動発声（ぼーっとモード）
          if (autoSpeakOnTimeout && randomPhrase) {
            setShowEn(true);

            if (ttsOn) {
              const gen = speakGenRef.current;
              speakEn(
                jpLearnMode ? randomPhrase.jp : randomPhrase.en,
                () => {
                  if (speakGenRef.current !== gen) return;
                  if (autoNext) requestGoNext();   // ★ autoNext ガード
                },
                jpLearnMode ? "ja" : "en"
              );
            } else {
              // TTSなし：英語は出すが
              if (autoNext) {
                scheduleGoNext2s();               // ★ autoNext ガード
              }
            }
          }

        // autoSpeakOnTimeout === OFF の場合
        // → 何もしない（止まる）
          return 0;
        }

        return next;
      });
    }, 1000);

    return () => {
      if (jpTimerRef.current !== null) {
        clearInterval(jpTimerRef.current);
        jpTimerRef.current = null;
      }
    };
  }, [mode,randomPhrase, showEn, autoNext, isPaused]);


return (
  <div className="app-viewport">
    <div className="app-shell">
      <div style={{ position: "relative" }}>
        {/* 設定ボタン：センター箱の外・固定 */}
        <button
          className="btn-settings"        
          aria-label="settings"
          onClick={() => {
            if (soundOn) playSe();
            setShowSettings(true);
          }}
        >
          ⚙️
        </button>
      
        <img
          src="/images/tossa.png"
          alt="tossa"
          className="app-logo"
        />

<div className="app-description">
  {!jpLearnMode ? (
    <>
      <div>
        「<strong>学習する</strong>」を選んだ状態で「<strong>次へ</strong>」を押す：学習スタート
      </div>
      <div style={{ marginTop: 4 }}>
        「学習する」以外を選ぶ：フレーズ集の閲覧
      </div>
    </>
  ) : (
    <>
      <div>
        Select <strong>Training</strong> and press <strong>Next</strong> to start learning.
      </div>
      <div style={{ marginTop: 4 }}>
        Select any other mode to browse the phrase list.
      </div>
    </>
  )}
</div>

        <div className="mode-select-wrap">
          <select
            className="mode-select"
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
          >
            <option value="TRAIN">{MODE_LABELS_VIEW.TRAIN}</option>
            <option value="A">{MODE_LABELS_VIEW.A}</option>
            <option value="B">{MODE_LABELS_VIEW.B}</option>
            <option value="C">{MODE_LABELS_VIEW.C}</option>
            <option value="D">{MODE_LABELS_VIEW.D}</option>
            <option value="E">{MODE_LABELS_VIEW.E}</option>
            <option value="F">{MODE_LABELS_VIEW.F}</option>
          </select>
        </div>

        {/* ===== メインUI：センター1列 ===== */}
        <div className="app-main">

          {/* 出題エリア */}
          {mode === "TRAIN" && randomPhrase && (() => {
            const promptText = jpLearnMode ? randomPhrase.en : randomPhrase.jp;
            const answerText = jpLearnMode ? randomPhrase.jp : randomPhrase.en;
            return (
              <div className="train-question"> 
                <div className="prompt-text">

                  {/* ★ 認識成功マーク（debug時のみ） */}
                  {debugMode && isSpeechRecognizedOK() && (
                    <span
                      style={{
                        marginRight: 6,
                        color: "#2ecc71",
                        fontWeight: "bold",
                      }}
                      title="Speech recognized OK"
                    >
                      〇
                    </span>
                  )}

                  <span style={{ marginRight: 8 }}>
                    {TAG_EMOJI[randomPhrase.tags?.[0] ?? ""] ?? ""}
                  </span>
                  {promptText}
                </div>


                {/* 0–3秒：カウント / 3秒：考えた？ 認識結果*/}
                <div className="count-text">
                  {isPaused ? null : (
                    speechState === "RECORDING" ? (
                      <>
                        <div>{UI.recording}</div>
                        {spokenText && (
                          <div style={speechTextStyle}>
                            {spokenText}
                          </div>
                        )}
                      </>
                    ) : speechState === "RECOGNIZED" && spokenText ? (
                      // ★ showEn 中でも表示される
                      <div style={speechTextStyle}>
                        {spokenText}
                      </div>
                    ) : !showEn ? (
                      // ★ カウント表示だけ showEn に依存
                      elapsed === 0 ? null
                      : elapsed === 1 ? "3"
                      : elapsed === 2 ? "2"
                      : elapsed === 3 ? "1"
                      : UI.ready
                    ) : null
                  )}
                </div>

                {/* 英語表示 */}
                {showEn && (
                  <div className="answer-text">
                    {answerText}
                  </div>
                )}
              </div>
            );
        })()}
      </div>



{/* ===== PRACTICE（仕上げ） ===== */}
{mode !== "TRAIN" && (
  <>
    {/* ===== サブタグ：コンボ直下・固定 ===== */}
    <div className="practice-subtabs-fixed">
      {practiceSubStats.map(({ sub, count }) => {
        const selected = sub === practiceSub;
        return (
          <button
            key={sub}
            className={`practice-subtab ${selected ? "active" : ""}`}
            onClick={() => {
              playClickSe();
              setActiveMeaningGroup(null);
              setPracticeSub(sub);
              // ★ スクロールを先頭へ
              requestAnimationFrame(() => {
                practiceListRef.current?.scrollTo({ top: 0 });
              });
            }}
          >
            <span className="practice-subtab-emoji">
              {TAG_EMOJI[sub] ?? "🔖"}
            </span>
            <span className="practice-subtab-label">
              {sub} {count}
            </span>
          </button>
        );
      })}

        <button
          className="practice-subtab debug-clear"
          onClick={() => {
            clearAllStars();
          }}
          title="Clear all stars"
        >
          <span className="practice-subtab-emoji">★</span>
          <span className="practice-subtab-label">Clear</span>
        </button>
     
    </div>

    {/* ===== リスト枠（可変高） ===== */}
    <div className="practice-list-wrap">
      {/* 表題：サブタグ + 件数 */}
      <div className="practice-title">
        {(practiceSub ?? "—")} {practicePhrases.length}
      </div>
      {/* ===== PRACTICE ガイダンス（固定） ===== */}
      <div className="practice-guide">
        {UI.practiceGuide}
      </div>
      {/* ===== 実際にスクロールする部分 ===== */}
      <div className="practice-list" ref={practiceListRef}>
        {practicePhrases.map((p) => (
        
          <div
            key={p.id}
            className={`practice-item ${
              p.meaningGroup ? "clickable" : "disabled"
            }`}
            onClick={() => {
              if (!p.meaningGroup) return;
              playClickSe();
              setActiveMeaningGroup(p.meaningGroup);
            }}
          >
            <div className="practice-item-jp" style={{ position: "relative" }}>
              {jpLearnMode ? p.en : p.jp}

{/* ★ 実践用スター（学習★コピー + 直近3連続成功） */}
  {hasPracticeStar(pickLogs, p.id, practiceStars) && (
    <span
      style={{
        position: "absolute",
        left: -20,
        top: 0,
        color: "#f5b301",
        fontSize: "1.1em",
      }}
      title="Learned recently"
    >
      ★
    </span>
  )}
              {(debugMode || ttsOn) && (
                <span
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    minWidth: 72,              // ★ 常に確保
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: 6,
                    fontSize: "0.75em",
                    color: "#999",
                  }}
                  onClick={(e) => e.stopPropagation()} // 親クリック防止
                >
                  {/* ID（debug時のみ） */}
                  {debugMode && (
                    <span
                      style={{
                        fontSize: "0.7em",
                        color: "#999",
                        marginRight: 4,
                      }}
                    >
                      {p.id}
                    </span>
                  )}

                  {/* ★（ユーザー用：常時表示） */}
                  <span
                    className={`practice-star ${practiceStars.has(p.id) ? "on" : ""}`}
                    style={{
                      cursor: "pointer",
                      color: practiceStars.has(p.id) ? "#f5b301" : "#ccc",
                      fontSize: "1.2em",
                      transform: "scale(1.4)",
                      transformOrigin: "right top",
                      lineHeight: 1,
                    }}
                    title="Bookmark"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPracticeStars(prev => {
                        const next = new Set(prev);
                        next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                        return next;
                      });
                    }}
                  >
                    ★
                  </span>

                  {/* 🔊（TTSオン時） */}
                  {ttsOn && (
                    <span
                      style={{
                        cursor: "pointer",
                        fontSize: "1.2em",
                        opacity: speakingPhraseId === p.id ? 0.5 : 1,
                        transform: "scale(1.4)",
                        transformOrigin: "right top",
                        lineHeight: 1,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        speakPractice(p);
                      }}
                    >
                      🔊
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="practice-item-en">
              {jpLearnMode ? p.jp : p.en}
            </div>
          </div>
        ))}
      </div>
    </div>
  </>
)}

{activeMeaningGroup && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.4)",
      zIndex: 9999,
    }}
    onClick={() => setActiveMeaningGroup(null)}
  >
    <div
      style={{
        background: "#fff",
        margin: "20% auto",
        padding: 16,
        width: "90%",
        maxWidth: 400,
        borderRadius: 8,
      }}
      onClick={() => {
        playClickSe();
        setActiveMeaningGroup(null);
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: 8 }}>
        {UI.related}
      </div>

        {relatedPhrases.map((p) => (
          <div
            key={p.id}
            style={{
              marginBottom: 2,
              position: "relative",
            }}
          >
            {/* 上段（主表示） */}
            <div style={{ position: "relative" }}>
              {jpLearnMode ? p.en : p.jp}

            <span>
              {/* tags2 表示は debug のまま */}
              {debugMode && p.tags2?.main && p.tags2?.sub && (
                <span style={{ color: "#777" }}>
                  （{p.tags2.main}−{p.tags2.sub}）
                </span>
              )}

              {/* ID は debug のまま */}
              {debugMode && <span>{p.id}</span>}

              {/* ★ は常に表示 */}
              <span
                style={{
                  position: "absolute",
                  right: 6,
                  top: 2,

                  cursor: "pointer",
                  opacity: practiceStars.has(p.id) ? 1 : 0.3,
                  color: practiceStars.has(p.id) ? "#f5b301" : undefined,
                  fontSize: "1.2em",
                  transform: "scale(1.4)",
                  transformOrigin: "right top",
                  lineHeight: 1,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  togglePracticeStar(p.id);
                }}
                title="お気に入り"
              >
                ★
              </span>
            </span>
          </div>

            {/* 下段（補助表示） */}
            <div style={{ fontSize: "0.9em", color: "#555" }}>
              {jpLearnMode ? p.jp : p.en}
            </div>
          </div>
        ))}

      <button
        style={{ marginTop: 12 }}
        onClick={() => setActiveMeaningGroup(null)}
      >
        {UI.close}
      </button>
    </div>
  </div>
)}

        {/* 上部の余白（将来：アプリイラスト／ガイド） */}
      <div className={`spacer-top ${mode === "TRAIN" ? "train" : ""}`} />
    
      {mode === "TRAIN" && (

        <div className="player-controls">
          <button className="btn btn-stop"
            disabled={isBusy || isPaused}
            onClick={() => {
              if (showEn) return;
              if (isBusy) return;
              if (isPaused) return;
              if (soundOn) playSe();
              setIsPaused(true);

              // ★ 状態を完全リセット
              setElapsed(0);
              setShowEn(false);
              setSpeechState("IDLE");
              setSpokenText(null);

              // タイマー停止
              if (jpTimerRef.current !== null) {
                clearInterval(jpTimerRef.current);
                jpTimerRef.current = null;
              }
              if (enTimerRef.current !== null) {
                clearTimeout(enTimerRef.current);
                enTimerRef.current = null;
              }
              // 音声停止
              speechSynthesis.cancel();
              // requestGoNext();
            }}
            >
            {UI.pause}
          </button>

          {/* 次へ */}
          <button className="btn btn-next"
            onClick={() => {
              if (soundOn) playSe();
              if (isBusy) return;
              setIsPaused(false);
              if (!canAcceptInput()) return;
              requestGoNext();
            }}
          >
            {UI.next}
          </button>

          {/* 認識実行／英語を見る（必要なときだけ） */}
          <button
            className="btn btn-en"
            disabled={isBusy || isPaused}
            onClick={() => {
              if (isBusy) return;
              if (!canAcceptInput()) return;
              if (!randomPhrase) return;
              
              if (debugMode && ttsOn){
                pushSpeechLog("🎤 clicked");
              }
              // 停止中なら解除（既存仕様）
              if (isPaused) {
                speechSynthesis.cancel();
                setIsPaused(false);
              }

              // ★ ログ更新（既存そのまま）
              setPickLogs((logs) => {
                if (logs.length === 0) return logs;
                const last = logs[logs.length - 1];
                // ★ 失敗確定（英語を見た）
                onFail(last.phraseId);

                return [
                  ...logs.slice(0, -1),
                  {
                    ...last,
                    revealed: true,
                    revealAtSec: elapsed,
                  },
                ];
              });

              // ============================
              // TTS OFF：従来仕様（英文の早出し）
              // ============================
              if (!ttsOn) {
                setShowEn(true);
                if (soundOn) playSe();
                if (autoNext) scheduleGoNext2s();
                return;
              }

              // ============================
              // TTS ON：音声入力学習（追加仕様）
              // ============================
              // タイマー停止（表示ロジックは既存に任せる）
              if (jpTimerRef.current !== null) {
                clearInterval(jpTimerRef.current);
                jpTimerRef.current = null;
              }

              // 録音初期化 → 録音開始
              initSpeechRecognition();
              startSpeechFlow();   // ★ ここで録音が始まる

              // 進行は音声側に任せる
            }}
          >
            {ttsOn ? UI.speak : UI.showAnswer}          </button>
              {/* )} */}
        </div>
      )}

    

    {showSettings &&
      createPortal(
        <div
          style={{
            position: "fixed",
            top: 44,
            right: 8,
            zIndex: 9999,

            padding: 12,
            border: "1px solid #ddd",
            background: "#fafafa",
            width: 260,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {mode === "TRAIN" && (
            <label style={{ display: "block", marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={autoNext}
                onChange={(e) => setAutoNext(e.target.checked)}
              />
              {UI.autoNext}
            </label>
          )}

          <label style={{ display: "block", marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={soundOn}
              onChange={(e) => setSoundOn(e.target.checked)}
            />
            {UI.uiSounds}
          </label>

          <label style={{ display: "block" }}>
            <input
              type="checkbox"
              checked={ttsOn}
              onChange={(e) => setTtsOn(e.target.checked)}
            />
            {UI.tts}
          </label>

          {mode === "TRAIN" && (
            <label style={{ display: "block", marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={autoSpeakOnTimeout}
                onChange={(e) => setAutoSpeakOnTimeout(e.target.checked)}
              />
              {UI.autoSpeak}
            </label>
          )}

          <label style={{ display: "block", marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={jpLearnMode}
              onChange={(e) => setJpLearnMode(e.target.checked)}
            />
            Japanese Learning Mode
          </label>

          <label
            style={{
              display: "block",
              marginTop: 8,
              color: "#bbb",
              fontSize: "0.85em",
              userSelect: "none",
            }}
            onPointerDown={() => {
              debugHoldTimerRef.current = window.setTimeout(() => {
                const next = !debugMode;
                setDebugMode(next);
                localStorage.setItem("debugMode", JSON.stringify(next));
                console.log("[DEBUG MODE]", next ? "ON" : "OFF");
              }, 900); // ★ 長押し 900ms
            }}
            onPointerUp={() => {
              if (debugHoldTimerRef.current !== null) {
                clearTimeout(debugHoldTimerRef.current);
                debugHoldTimerRef.current = null;
              }
            }}
            onPointerLeave={() => {
              if (debugHoldTimerRef.current !== null) {
                clearTimeout(debugHoldTimerRef.current);
                debugHoldTimerRef.current = null;
              }
            }}
          >
            <input
              type="checkbox"
              checked={debugMode}
              readOnly
              style={{ pointerEvents: "none" }}
            />
            開発者モード
          </label>

<div style={{ fontSize: "0.75em", color: "#666" }}>
  Build: {buildTimeJst}
</div>
          <button
            className="btn btn-close"
            onClick={() => {
              if (soundOn) playSe();
              setShowSettings(false);
            }}
            
          >
            {UI.close}
          </button>

        </div>,
        document.body
      )
    }
    
      {mode === "TRAIN" && debugMode && (
        <RecentLogs logs={pickLogs} />
      )}


      {mode === "TRAIN" && debugMode && (
        <div
          style={{
            marginTop: 12,
            padding: 8,
            fontSize: "0.8em",
            color: "#555",
            borderTop: "1px dashed #ccc",
          }}
        >
          {speechLogs.map((l, i) => (
            <div key={i}>
              {new Date(l.time).toLocaleTimeString()} : {l.event}
            </div>
          ))}
        </div>
      )}

      </div>
    </div>
  </div>
  );
}

