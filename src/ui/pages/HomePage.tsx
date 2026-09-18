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
import { PHRASES_SCENE } from "../../data/phrases.scene";
import AiConversationUI from "../../components/AiConversationUI";

import { getNextPhrase } from "../../app/usecases/getNextPhrase";

import type { MainMode, Mode } from "../static/uiStatic";
import { MODE_DESCRIPTIONS } from "../static/uiStatic";

import { doc, getDoc, setDoc, updateDoc, increment } from "firebase/firestore";
import { db } from "../../firebase";

import {
  UI_TEXT,
  MODE_LABELS,
  MAIN_MODE_LABELS,
  MAIN_MODE_NAV_LABELS,
  PRACTICE_CONFIG,
  SCENE_CONFIG,
  SUB_LABELS_EN,
  TAG_EMOJI,
} from "../static/uiStatic";

export type PickLog = {
  time: number; // Date.now()
  order: number; // 何問目か（0,1,2,...）
  phraseId: string;

  // 分類（tags[0]を代表として使う）
  primaryTag: string | null; // 例: "否定" / "安心" / null

  // PickReason 由来
  rule: string;
  detail: string;

  // ユーザー行動
  revealed: boolean; // 英語を見るを押したか
  revealAtSec: number | null; // 押した秒数（押してないなら null）
  timeout: boolean; // タイムアップで次へ行ったか

  // 時間
  elapsedTotal: number; // （いまはタイムアップ時に 5 を入れる程度でOK）

  // 文脈
  tagOrder: number; // このタグが「何回目」に出たか（1,2,3,...）
  consecutiveSameTag: number; // 同じタグが連続何回目か
};

// =====================================================
// HomePage
// =====================================================
export default function HomePage() {
  // =====================================================
  // 1. 共通（設定・モード・共用 state）
  // =====================================================
  const [mainMode, setMainMode] = useState<MainMode>("AI");
  const [mode, setMode] = useState<Mode>("AI");
  const [sceneMode, setSceneMode] = useState<boolean>(false);

  const [soundOn, setSoundOn] = useState<boolean>(() =>
    readBool("soundOn", true)
  );
  const [ttsOn, setTtsOn] = useState<boolean>(() => readBool("ttsOn", true));
  const [jpLearnMode, setJpLearnMode] = useState<boolean>(() =>
    readBool("jpLearnMode", false)
  );
  const [autoNext, setAutoNext] = useState<boolean>(() =>
    readBool("autoNext", true)
  );
  const [showConversationCaptions, setShowConversationCaptions] = useState<boolean>(() =>
    readBool("showConversationCaptions", false)
  );

  const [debugMode, setDebugMode] = useState<boolean>(() =>
    readBool("debugMode", false)
  );
  const debugHoldTimerRef = useRef<number | null>(null);

  const [showSettings, setShowSettings] = useState(false);

  const playClickSe = () => {
    if (soundOn) playSe();
  };

  const selectMainMode = (nextMainMode: MainMode) => {
    playClickSe();
    setMainMode(nextMainMode);
    setSceneMode(nextMainMode === "SCENE");
    setMode(nextMainMode === "DAILY" || nextMainMode === "SCENE" ? "A" : nextMainMode);
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
  type TrainPhase = "QUESTION" | "ANSWER_SHOWN" | "RECORDING";
  const [trainPhase, setTrainPhase] = useState<TrainPhase>("QUESTION");
  const [randomPhrase, setRandomPhrase] = useState<Phrase | null>(null);
  const [showEn, setShowEn] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [goNext, setGoNext] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const jpTimerRef = useRef<number | null>(null);
  const enTimerRef = useRef<number | null>(null);
  const speakGenRef = useRef(0);

  const repo = useMemo(() => new InMemoryPhraseRepository(PHRASES_SEED), []);

  const [pickLogs, setPickLogs] = useState<PickLog[]>([]);
  const [starState, setStarState] = useState<Set<string>>(() => new Set());
  const [, setOkStreak] = useState<Record<string, number>>({});

  // ===== Speech debug log =====
  type SpeechLog = {
    time: number;
    event: string;
  };

  const speechFailureRef = useRef<
    "NONE" | "NO_SPEECH" | "NO_FUNCTION" | "ERROR"
  >("NONE");

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
  const [practiceStars, setPracticeStars] = useState<Set<string>>(() => {
    const raw = localStorage.getItem("practiceStars");
    if (!raw) return new Set();
    try {
      return new Set(JSON.parse(raw));
    } catch {
      return new Set();
    }
  });

  const [practiceSub, setPracticeSub] = useState<string | null>(null);
  const [activeMeaningGroup, setActiveMeaningGroup] = useState<string | null>(
    null
  );
  const practiceListRef = useRef<HTMLDivElement | null>(null);

  const practiceMainJp =
    mode !== "TRAIN" && mode !== "STAR" && mode !== "AI"
      ? PRACTICE_CONFIG.mainJp[mode]
      : null;
  const sortByJapanese = (a: Phrase, b: Phrase) =>
    a.jp.localeCompare(b.jp, "ja");

  // ★ 場面モード用：A〜F → 「ホテル/移動/…」へ変換
  const sceneMainJp =
    sceneMode && mode !== "TRAIN" && mode !== "STAR" && mode !== "AI"
      ? SCENE_CONFIG.mainJp[mode]
      : null;

  const practiceMainPhrases = useMemo(() => {
    if (!sceneMode && mode === "STAR") {
      return PHRASES_SEED.filter((p) => practiceStars.has(p.id));
    }

    // ★ 場面モード
    if (sceneMode) {
      if (!sceneMainJp) return [];

      // sub の順序は main（ホテル等）で引く
      const subs = SCENE_CONFIG.subOrder[sceneMainJp] ?? [];

      return PHRASES_SCENE.filter((p) => {
        if (!p.tags2) return false;
        if (p.tags2.main !== sceneMainJp) return false;

        // subs が空なら「mainだけ一致」を通す（保険）
        if (subs.length === 0) return true;

        return subs.includes(p.tags2.sub);
      });
    }

    // ★ 実践モード（元のまま）
    if (!practiceMainJp) return [];
    const list = PHRASES_SEED.filter((p) => p.tags2?.main === practiceMainJp);
    return list.sort(sortByJapanese);
  }, [sceneMode, mode, practiceMainJp, practiceStars, sceneMainJp]);

  const practiceSubStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of practiceMainPhrases) {
      const sub = p.tags2?.sub?.trim();
      if (!sub) continue;
      map.set(sub, (map.get(sub) ?? 0) + 1);
    }

    const order = sceneMode
      ? sceneMainJp
        ? (SCENE_CONFIG.subOrder[sceneMainJp] ?? [])
        : []
      : (PRACTICE_CONFIG.subOrder[mode] ?? []);

    return order.map((sub) => ({ sub, count: map.get(sub) ?? 0 }));
  }, [practiceMainPhrases, mode, sceneMode, sceneMainJp]);

  // =====================================================
  // 4. UI 文言
  // =====================================================
  const UI = jpLearnMode ? UI_TEXT.en : UI_TEXT.jp;
  const MODE_LABELS_VIEW = sceneMode
    ? jpLearnMode
      ? MODE_LABELS.scene.en
      : MODE_LABELS.scene.jp
    : jpLearnMode
      ? MODE_LABELS.en
      : MODE_LABELS.jp;
  const MODE_LABELS_STAR =
    mode !== "TRAIN" && !sceneMode
      ? jpLearnMode
        ? MODE_LABELS.en.STAR
        : MODE_LABELS.jp.STAR
      : MODE_LABELS.jp.STAR;

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

  const [accessCount, setAccessCount] = useState<number | null>(null);
  function formatCount(n: number, digits = 4) {
    return n.toString().padStart(digits, "0");
  }

  useEffect(() => {
    const countUp = async () => {
      const ref = doc(db, "counters", "vocapedias");

      try {
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          // 初回
          await setDoc(ref, { count: 1 });
          setAccessCount(1);
        } else {
          await updateDoc(ref, { count: increment(1) });

          const current = snap.data().count ?? 0;
          setAccessCount(current + 1);
        }
      } catch (e) {
        console.warn("access counter failed", e);
      }
    };

    countUp();
  }, []);

  const togglePracticeStar = (id: string) => {
    setPracticeStars((prev) => {
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
    const ok = window.confirm(UI.confirmClearStars);
    if (!ok) return;
    playClickSe();
    setPracticeStars(new Set());
    localStorage.removeItem("practiceStars");
  };

  // ===== Speech Recognition =====
  const recognitionRef = useRef<AppSpeechRecognition | null>(null);
  // ★ 録音開始時点の「問題」を固定する（TTSズレ防止）
  const recordingPhraseRef = useRef<Phrase | null>(null);
  const [speechState, setSpeechState] = useState<
    "IDLE" | "RECORDING" | "RECOGNIZED"
  >("IDLE");
  const canUseSpeak =
    mode === "TRAIN" &&
    !isBusy &&
    !isPaused &&
    randomPhrase !== null &&
    (ttsOn
      ? // TTS ON：IDLE かつ QUESTION、または復習(ANSWER_SHOWN)は autoNext OFF のときだけ
        speechState === "IDLE" &&
        (trainPhase === "QUESTION" ||
          (trainPhase === "ANSWER_SHOWN" && !autoNext))
      : // TTS OFF：QUESTION のときだけ（待機中に青で押せる問題を潰す）
        trainPhase === "QUESTION");
  const [spokenText, setSpokenText] = useState<string | null>(null);
  const speechTextStyle: React.CSSProperties = {
    fontSize: "0.85em",
    color: "#666",
    marginTop: 4,
    lineHeight: 1.3,
  };

  const canUseNext =
    mode === "TRAIN" &&
    !isBusy &&
    speechState === "IDLE" &&
    (trainPhase === "QUESTION" || trainPhase === "ANSWER_SHOWN");

  const canUseStop =
    mode === "TRAIN" &&
    !isPaused &&
    randomPhrase !== null &&
    (trainPhase === "QUESTION" ||
      trainPhase === "RECORDING" ||
      trainPhase === "ANSWER_SHOWN");

  function speakEnSafe(
    text: string,
    onEnd: () => void,
    lang: "en" | "ja",
    opts?: { timeoutMs?: number }
  ) {
    const timeoutMs = opts?.timeoutMs ?? 3000;

    let finished = false;

    const finishOnce = () => {
      if (finished) return;
      finished = true;
      onEnd();
    };

    // safety timeout（TTSが死んだ時の保険）
    const safetyTimer = window.setTimeout(() => {
      speechSynthesis.cancel();
      finishOnce();
    }, timeoutMs);

    // 元の speakEn をそのまま使う
    speakEn(
      text,
      () => {
        clearTimeout(safetyTimer);
        finishOnce();
      },
      lang
    );
  }

  function hardStopToIdle() {
    // =========================
    // ★ 録音中なら即中断（最優先）
    // =========================
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      } catch { /* Ignore errors from starting or stopping recognition. */ }
      recognitionRef.current = null;
    }

    // =========================
    // タイマー全停止
    // =========================
    if (jpTimerRef.current !== null) {
      clearInterval(jpTimerRef.current);
      jpTimerRef.current = null;
    }
    if (enTimerRef.current !== null) {
      clearTimeout(enTimerRef.current);
      enTimerRef.current = null;
    }

    // =========================
    // 音声すべて停止
    // =========================
    speechSynthesis.cancel();
    speakGenRef.current += 1; // callback 無効化

    // =========================
    // 状態を「待機」に固定
    // =========================
    setSpeechState("IDLE");
    setRandomPhrase(null);
    setTrainPhase("QUESTION");
    setShowEn(false);
    setSpokenText(null);
    setElapsed(0);

    setIsBusy(false);
    setIsPaused(true); // 停止状態
  }

  function initSpeechRecognition() {
    if (!ttsOn) return;
    if (recognitionRef.current) return;

    pushSpeechLog("initSpeechRecognition()"); // log1

    const SR =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

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
      pushSpeechLog("onstart"); // log3
      // setSpokenText(null);
      setSpeechState("RECORDING");
    };

    rec.onresult = (e) => {
      pushSpeechLog("onresult"); // log4
      const text = e.results[0][0].transcript;
      setSpokenText(text);
    };

    rec.onend = () => {
      pushSpeechLog("onend"); // log5

      const dur = Date.now() - recordStartedAtRef.current;
      const hasSpeech = !!(spokenText && spokenText.trim() !== "");

      // ★ 無音かつ早すぎ → 1回だけやり直す
      if (
        !hasSpeech &&
        dur < MIN_NO_SPEECH_MS &&
        noSpeechRetryRef.current < 1
      ) {
        noSpeechRetryRef.current += 1;
        recordStartedAtRef.current = Date.now();

        try {
          recognitionRef.current?.start();
        } catch { /* Ignore errors from starting or stopping recognition. */ }

        return; // ★ 認識完了扱いにしない
      }

      // ===== 認識完了 =====
      speechSynthesis.cancel();
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

      // ★ 認識後は必ず「正解表示」
      setShowEn(true);
      setTrainPhase("ANSWER_SHOWN");

      // ★ 正解TTSは「録音開始時点の問題」を読む（ズレ防止）
      const phrase = recordingPhraseRef.current;
      if (phrase) {
        // ★ ここで世代を固定（callback持ち越し防止）
        const gen = ++speakGenRef.current;

        speakEnSafe(
          jpLearnMode ? phrase.jp : phrase.en,
          () => {
            if (speakGenRef.current !== gen) return;

            // autoNext ON のときだけ次へ（OFFならここで止まる）
            if (autoNext && !isPaused) {
              // requestGoNext() 直呼びより安全に 2秒遅延へ
              scheduleGoNext2s();
            } else {
              setSpeechState("IDLE");
            }
          },
          jpLearnMode ? "ja" : "en"
        );
      }
    };

    rec.onerror = (e) => {
      pushSpeechLog(`error:${e.error}`); // log6
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

  function hasPracticeStar(
    logs: PickLog[],
    phraseId: string,
    copied: Set<string>
  ) {
    if (!copied.has(phraseId)) return false;
    const r = logs.filter((l) => l.phraseId === phraseId).slice(-3);
    return r.length === 3 && r.every((l) => !l.timeout && !l.revealed);
  }

  function onFail(phraseId: string) {
    setStarState((prev) => {
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

    const answer = jpLearnMode ? randomPhrase.jp : randomPhrase.en;

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
      youre: "you are",
      "i'm": "i am",
      "it's": "it is",
      "he's": "he is",
      "she's": "she is",
      "they're": "they are",
      "we're": "we are",

      gonna: "going to",
      wanna: "want to",
      gotta: "got to",
      lemme: "let me",
      kinda: "kind of",
      sorta: "sort of",
      // ★ 追加：同義語吸収
      ok: "okay",
      alright: "okay",
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
      .map((w) => w.trim())
      .filter(Boolean);
  }

  function normalizeJapanese(s: string): string[] {
    return (
      s
        // ★ 絵文字・記号・英数字をすべて除去
        .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
        .replace(/[A-Za-z0-9]/g, "")
        .replace(/[。、，．・：；！？!?「」『』（）()[\]【】\s]/g, "")
        .split("")
        .filter(Boolean)
    );
  }

  // ★ 数量・年齢などを含むか（簡易）
  function extractNumbers(s: string): string[] {
    return (
      s.normalize("NFKC").match(/[0-9一二三四五六七八九十百千万億]+/g) ?? []
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

    return ratio >= 0.7 && hit >= minHits && spokenWords.has(lastKeyWord);
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
    // ★ 録音対象の問題を固定（ここが最重要）
    recordingPhraseRef.current = randomPhrase;
    if (!recordingPhraseRef.current) {
      pushSpeechLog("no phrase to record");
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
        } catch { /* Ignore errors from starting or stopping recognition. */ }
      }, MAX_RECORD_MS);
    } catch {
      pushSpeechLog("start() threw");
      setSpokenText(UI.recogNoFunction);
      setSpeechState("RECOGNIZED");
      setShowEn(true);

      const phrase = recordingPhraseRef.current;
      if (phrase && ttsOn) {
        const gen = ++speakGenRef.current;
        speakEnSafe(
          jpLearnMode ? phrase.jp : phrase.en,
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
    return PHRASES_SEED.filter((p) => p.meaningGroup === activeMeaningGroup)
      .slice()
      .sort((a, b) => a.jp.localeCompare(b.jp, "ja"));
  }, [activeMeaningGroup]);

  const [speakingPhraseId, setSpeakingPhraseId] = useState<string | null>(null);
  const speakPractice = (p: Phrase) => {
    // いま喋っている音声を止める
    speechSynthesis.cancel();

    setSpeakingPhraseId(p.id);

    speakEnSafe(
      jpLearnMode ? p.jp : p.en,
      () => {
        setSpeakingPhraseId(null);
      },
      jpLearnMode ? "ja" : "en"
    );
  };

  useEffect(() => {
    localStorage.setItem(
      "practiceStars",
      JSON.stringify(Array.from(practiceStars))
    );
  }, [practiceStars]);

  // ★ デバッグモード時、認識成功で自動的にスター付与
  useEffect(() => {
    if (!debugMode) return;
    if (speechState !== "RECOGNIZED") return;
    if (!randomPhrase) return;

    const id = randomPhrase.id;
    const ok = isSpeechRecognizedOK();

    if (ok) {
      setOkStreak((prev) => {
        const nextCount = (prev[id] ?? 0) + 1;

        // ===== ログ（連続成功）=====
        console.log("[LEARN OK]", {
          phraseId: id,
          streak: nextCount,
        });

        // ★ 3回連続で付与
        if (nextCount >= 3) {
          setStarState((starPrev) => {
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
      setOkStreak((prev) => {
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
    if (mode === "TRAIN") return;
    hardStopToIdle();
    // Practiceに入ったら、ポップアップは閉じる
    setActiveMeaningGroup(null);

    if (mode === "STAR") return; // ★追加：サブ選択はしない

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
            #{l.order} [{l.primaryTag ?? "-"}] {l.phraseId} / tag#{l.tagOrder} /
            連続{l.consecutiveSameTag}
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
    setTrainPhase("QUESTION");
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
        starState // ★渡す
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
        starState // ★渡す
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
    speakGenRef.current += 1; // 以後、古いTTS callbackは無効
    speechSynthesis.cancel(); // 発声自体も止める
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
    localStorage.setItem("jpLearnMode", JSON.stringify(jpLearnMode));
  }, [jpLearnMode]);

  useEffect(() => {
    localStorage.setItem("showConversationCaptions", JSON.stringify(showConversationCaptions));
  }, [showConversationCaptions]);

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
    if (mode !== "TRAIN") return; // ★最重要
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
          // ===== timeout ログ =====
          setPickLogs((logs) => {
            if (logs.length === 0) return logs;
            const last = logs[logs.length - 1];

            // ★ 失敗確定
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

          // ★ JPタイマー停止（最重要）
          if (jpTimerRef.current !== null) {
            clearInterval(jpTimerRef.current);
            jpTimerRef.current = null;
          }

          // ===== ANSWER_SHOWN に遷移 =====
          setTrainPhase("ANSWER_SHOWN");
          setShowEn(true);

          const phrase = randomPhrase; // ★ 固定

          if (ttsOn && phrase) {
            const gen = ++speakGenRef.current;
            speakEnSafe(
              jpLearnMode ? phrase.jp : phrase.en,
              () => {
                if (speakGenRef.current !== gen) return;
                if (autoNext) scheduleGoNext2s();
              },
              jpLearnMode ? "ja" : "en"
            );
          } else {
            if (autoNext) scheduleGoNext2s();
          }

          return 0; // ★ ここで確実に打ち切る
        }

        return next;
      });
    }, 1000);

    // ===== cleanup（useEffectのreturn）=====
    return () => {
      if (jpTimerRef.current !== null) {
        clearInterval(jpTimerRef.current);
        jpTimerRef.current = null;
      }
    };
  }, [mode, randomPhrase, showEn, autoNext, isPaused]);

  //=====================================================
  //      UI 表示
  //===================================================== */
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

          <img src="/images/tossa.png" alt="tossa" className="app-logo" />

          {/* =====================================================
              使い方説明 表示
              ===================================================== */}
          <div className="mode-description">
            <div className="mode-text">
              {(mainMode === "SCENE"
                ? jpLearnMode
                  ? MODE_DESCRIPTIONS.scene.en
                  : MODE_DESCRIPTIONS.scene.jp
                : mainMode === "AI"
                  ? jpLearnMode
                    ? MODE_DESCRIPTIONS.ai.en
                    : MODE_DESCRIPTIONS.ai.jp
                  : mainMode === "TRAIN"
                  ? jpLearnMode
                    ? MODE_DESCRIPTIONS.train.en
                    : MODE_DESCRIPTIONS.train.jp
                  : jpLearnMode
                    ? MODE_DESCRIPTIONS.practice.en
                    : MODE_DESCRIPTIONS.practice.jp
              ).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>

          </div>

          <nav
            className="main-mode-tabs"
            aria-label={jpLearnMode ? MAIN_MODE_NAV_LABELS.en : MAIN_MODE_NAV_LABELS.jp}
          >
            {(["AI", "DAILY", "SCENE", "TRAIN"] as const).map((item) => (
              <button
                key={item}
                className={mainMode === item ? "active" : ""}
                aria-current={mainMode === item ? "page" : undefined}
                onClick={() => selectMainMode(item)}
              >
                {(jpLearnMode ? MAIN_MODE_LABELS.en : MAIN_MODE_LABELS.jp)[item]}
              </button>
            ))}
          </nav>

          {/* =====================================================
              コンボボックス 表示
              ===================================================== */}
          {(mainMode === "DAILY" || mainMode === "SCENE") && (
            <div className="mode-select-wrap">
              <select
                className="mode-select"
                value={mode}
                onChange={(e) => {
                  playClickSe();
                  setMode(e.target.value as Mode);
                }}
              >
                <option value="A">{MODE_LABELS_VIEW.A}</option>
                <option value="B">{MODE_LABELS_VIEW.B}</option>
                <option value="C">{MODE_LABELS_VIEW.C}</option>
                <option value="D">{MODE_LABELS_VIEW.D}</option>
                <option value="E">{MODE_LABELS_VIEW.E}</option>
                <option value="F">{MODE_LABELS_VIEW.F}</option>
                {!sceneMode && <option value="STAR">{MODE_LABELS_STAR}</option>}
              </select>
            </div>
          )}
          {/* =====================================================
                  学習モード 表示
              ===================================================== */}

          {/* ===== メインUI：センター1列 ===== */}
          <div className="app-main">
            {/* 出題エリア */}
            {mode === "TRAIN" &&
              (() => {
                const promptText = randomPhrase
                  ? jpLearnMode
                    ? randomPhrase.en
                    : randomPhrase.jp
                  : "";
                const answerText = randomPhrase
                  ? jpLearnMode
                    ? randomPhrase.jp
                    : randomPhrase.en
                  : "";
                return (
                  <div className="train-box">
                    {randomPhrase ? (
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
                          {isPaused ? null : speechState === "RECORDING" ? (
                            <>
                              <div>{UI.recording}</div>
                              {spokenText && (
                                <div style={speechTextStyle}>{spokenText}</div>
                              )}
                            </>
                          ) : speechState === "RECOGNIZED" && spokenText ? (
                            // ★ showEn 中でも表示される
                            <div style={speechTextStyle}>{spokenText}</div>
                          ) : !showEn ? (
                            // ★ カウント表示だけ showEn に依存
                            elapsed === 0 ? null : elapsed === 1 ? (
                              "3"
                            ) : elapsed === 2 ? (
                              "2"
                            ) : elapsed === 3 ? (
                              "1"
                            ) : (
                              UI.ready
                            )
                          ) : null}
                        </div>

                        {/* 英語表示 */}
                        {showEn && (
                          <div className="answer-text">{answerText}</div>
                        )}
                      </div>
                    ) : (
                      <div className="train-hint">
                        {jpLearnMode
                          ? "Press 「Next」 to start learning."
                          : "「次へ」を押して学習を始めてください"}
                      </div>
                    )}
                  </div>
                );
              })()}
          </div>

          {/* =====================================================
                  実践モード 表示
          ===================================================== */}
          {mode !== "TRAIN" && mode !== "AI" && (
            <>
              {/* ===== STAR モード ===== */}
              {mode === "STAR" && !sceneMode && practiceStars.size > 0 && (
                <div className="practice-subtabs-fixed star-only">
                  <button
                    className="practice-subtab debug-clear"
                    onClick={clearAllStars}
                    title="Clear all stars"
                  >
                    <span className="practice-subtab-emoji">★</span>
                    <span className="practice-subtab-label">All Clear</span>
                  </button>
                </div>
              )}

              {/* ===== PRACTICE / SCENE 共通（STAR以外） ===== */}
              {mode !== "STAR" && (
                <>
                  {/* ===== サブタグボタン ===== */}
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
                            requestAnimationFrame(() => {
                              practiceListRef.current?.scrollTo({ top: 0 });
                            });
                          }}
                        >
                          <span className="practice-subtab-emoji">
                            {TAG_EMOJI[sub] ?? "🔖"}
                          </span>
                          <span className="practice-subtab-label">
                            {jpLearnMode ? (SUB_LABELS_EN[sub] ?? sub) : sub} {count}
                          </span>
                        </button>
                      );
                    })}

                    {/* ★ All Clear（sceneMode では出さない） */}
                    {!sceneMode && practiceStars.size > 0 && (
                      <button
                        className="practice-subtab debug-clear"
                        onClick={clearAllStars}
                        title="Clear all stars"
                      >
                        <span className="practice-subtab-emoji">★</span>
                        <span className="practice-subtab-label">All Clear</span>
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* ===== リスト枠 ===== */}
              <div className="practice-list-wrap">
                {/* 表題 */}
                <div className="practice-title">
                  {mode === "STAR"
                    ? `${jpLearnMode ? "★ Bookmarked phrases" : "★ フレーズ"} ${
                        practiceMainPhrases.length
                      }`
                    : `${practiceSub ? (jpLearnMode ? (SUB_LABELS_EN[practiceSub] ?? practiceSub) : practiceSub) : "—"} ${
                        practiceSubStats.find((s) => s.sub === practiceSub)
                          ?.count ?? 0
                      }`}
                </div>

                {/* ガイド（sceneModeでは出さない） */}
                {!sceneMode && (
                  <div className="practice-guide">
                    {jpLearnMode
                      ? UI_TEXT.en.practiceGuide
                      : UI_TEXT.jp.practiceGuide}
                  </div>
                )}

                {/* ===== リスト ===== */}
                <div className="practice-list" ref={practiceListRef}>
                  {mode === "STAR" && practiceMainPhrases.length === 0 ? (
                    <div className="practice-empty">
                      {jpLearnMode
                        ? "★ No bookmarked phrases yet"
                        : "★ フレーズはまだありません"}
                    </div>
                  ) : (
                    (mode === "STAR"
                      ? [...practiceMainPhrases].sort((a, b) =>
                          a.jp.localeCompare(b.jp, "ja")
                        )
                      : practiceMainPhrases.filter(
                          (p) => !practiceSub || p.tags2?.sub === practiceSub
                        )
                    ).map((p) => (
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
                        <div
                          className="practice-item-jp"
                          style={{ position: "relative" }}
                        >
                          {jpLearnMode ? p.en : p.jp}

                          {hasPracticeStar(pickLogs, p.id, practiceStars) && (
                            <span
                              style={{
                                position: "absolute",
                                left: -20,
                                top: 0,
                                color: "#f5b301",
                                fontSize: "1.1em",
                              }}
                            >
                              ★
                            </span>
                          )}

                          {(debugMode || ttsOn) && (
                            <span
                              className="practice-action-icons"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {debugMode && (
                                <span
                                  style={{ fontSize: "0.7em", marginRight: 4 }}
                                >
                                  {p.id}
                                </span>
                              )}

                              {/* ★ ブックマーク（sceneModeでは出さない） */}
                              {!sceneMode && (
                                <span
                                  className={`practice-star ${
                                    practiceStars.has(p.id) ? "on" : ""
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    playClickSe();
                                    togglePracticeStar(p.id);
                                  }}
                                >
                                  ★
                                </span>
                              )}

                              {ttsOn && (
                                <span
                                  className={`practice-speaker ${
                                    speakingPhraseId === p.id ? "speaking" : ""
                                  }`}
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
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          {mainMode === "AI" && <AiConversationUI showConversationCaptions={showConversationCaptions} />}

          {/* =====================================================
              関連フレーズ（Overlay）
          ===================================================== */}
          {activeMeaningGroup && (
            <div
              className="related-overlay"
              onClick={() => setActiveMeaningGroup(null)}
            >
              <div
                className="related-modal"
                onClick={(e) => {
                  e.stopPropagation();
                  playClickSe();
                }}
              >
                <div className="related-title">{UI.related}</div>

                {relatedPhrases.map((p) => (
                  <div key={p.id} className="related-item">
                    {/* 上段 */}
                    <div className="related-main">
                      {/* 左：本文 */}
                      <span className="related-text">
                        {jpLearnMode ? p.en : p.jp}
                      </span>

                      {/* 右：メタ + ID + ★ を1塊で右に固める */}
                      <span className="related-right">
                        {debugMode && p.tags2?.main && p.tags2?.sub && (
                          <span className="related-meta">
                            （{p.tags2.main}−{p.tags2.sub}）
                          </span>
                        )}

                        {debugMode && (
                          <span className="related-id">{p.id}</span>
                        )}

                        <span
                          className={`practice-star ${practiceStars.has(p.id) ? "on" : ""}`}
                          title="お気に入り"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (soundOn) playClickSe();
                            togglePracticeStar(p.id);
                          }}
                        >
                          ★
                        </span>
                      </span>
                    </div>

                    {/* 下段 */}
                    <div className="related-sub">
                      {jpLearnMode ? p.jp : p.en}
                    </div>
                  </div>
                ))}

                <button
                  className="btn btn-close"
                  onClick={() => setActiveMeaningGroup(null)}
                >
                  {UI.close}
                </button>
              </div>
            </div>
          )}

          {/* =====================================================
                  学習モード 出題・回答 表示
              ===================================================== */}

          {/* 上部の余白（将来：アプリイラスト／ガイド） */}
          {mode === "TRAIN" && <div className="spacer-top.train" />}

          {mode === "TRAIN" && (
            <div className="player-controls">
              <button
                className={`btn btn-stop ${canUseStop ? "btn-text-active" : "btn-text-disabled"}`}
                disabled={!canUseStop}
                style={{
                  color: canUseStop ? "#444" : "#aaa",
                }}
                onClick={() => {
                  if (soundOn) playSe();
                  hardStopToIdle();
                }}
              >
                {UI.pause}
              </button>

              {/* 次へ */}
              <button
                className="btn btn-next"
                disabled={!canUseNext}
                style={{
                  color: canUseNext ? "#2563eb" : "#9ca3af",
                }}
                onClick={() => {
                  if (!canUseNext) return;
                  if (soundOn) playSe();
                  if (isBusy) return;
                  setIsPaused(false);
                  requestGoNext();
                }}
              >
                {UI.next}
              </button>

              {/* 認識実行／英語を見る（必要なときだけ） */}
              <button
                className="btn btn-en"
                disabled={!canUseSpeak}
                style={{
                  color: canUseSpeak ? "#eb6425" : "#9ca3af",
                }}
                onClick={() => {
                  if (!canUseSpeak) return;
                  if (isBusy) return;
                  if (!randomPhrase) return;

                  if (debugMode && ttsOn) {
                    const isReviewAfterAnswer = showEn;
                    if (!isReviewAfterAnswer) {
                      pushSpeechLog("🎤 clicked");
                    } else {
                      // ★ 復習録音：ログは触らない（任意で別ログを出すならここ）
                      pushSpeechLog("review speak");
                    }
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
                  // TTS OFF：英文の早出し（スキップ）
                  // ============================
                  if (!ttsOn) {
                    // ★ カウントダウン中なら必ず止める
                    if (jpTimerRef.current !== null) {
                      clearInterval(jpTimerRef.current);
                      jpTimerRef.current = null;
                    }
                    // ★ 状態を確定させる（ここが抜けていた）
                    setShowEn(true);
                    setTrainPhase("ANSWER_SHOWN");
                    if (soundOn) playSe();
                    if (autoNext) {
                      scheduleGoNext2s();
                    }
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
                  if (autoNext && trainPhase === "ANSWER_SHOWN") {
                    return;
                  }

                  // ここから先は QUESTION or autoNext=OFF のみ
                  initSpeechRecognition();
                  setTrainPhase("RECORDING");
                  startSpeechFlow();

                  // 進行は音声側に任せる
                }}
              >
                {ttsOn ? UI.speak : UI.showAnswer}{" "}
              </button>
              {/* )} */}
            </div>
          )}

          {/* =====================================================
                  設定モード表示
              ===================================================== */}
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
                  maxHeight: "calc(100vh - 60px)",
                  overflowY: "auto",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                }}
              >
                <section className="settings-group first" aria-labelledby="basic-settings-heading">
                  <h2 id="basic-settings-heading">{UI.basicSettings}</h2>
                  <label className="settings-item">
                    <input type="checkbox" checked={soundOn} onChange={(e) => setSoundOn(e.target.checked)} />
                    <span>{UI.uiSoundsLabel}<small>（{UI.uiSoundsDescription}）</small></span>
                  </label>
                  <label className="settings-item">
                    <input type="checkbox" checked={ttsOn} onChange={(e) => setTtsOn(e.target.checked)} />
                    <span>{UI.ttsLabel}<small>（{UI.ttsDescription}）</small></span>
                  </label>
                </section>

                <section className="settings-group" aria-labelledby="learning-settings-heading">
                  <h2 id="learning-settings-heading">{UI.learningModeSettings}</h2>
                  {mode === "TRAIN" && (
                    <label className="settings-item">
                      <input type="checkbox" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} />
                      <span>{UI.autoNextLabel}<small>（{UI.autoNextDescription}）</small></span>
                    </label>
                  )}
                  <label className="settings-item">
                    <input type="checkbox" checked={jpLearnMode} onChange={(e) => setJpLearnMode(e.target.checked)} />
                    <span>{UI.japaneseLearningMode}<small>（{UI.japaneseLearningModeDescription}）</small></span>
                  </label>
                </section>

                <section className="settings-group" aria-labelledby="ai-conversation-settings-heading">
                  <h2 id="ai-conversation-settings-heading">{UI.aiConversationSettings}</h2>
                  <label className="settings-item">
                    <input
                      type="checkbox"
                      checked={showConversationCaptions}
                      onChange={(event) => setShowConversationCaptions(event.target.checked)}
                    />
                    <span>{UI.showConversationCaptions}<small>（{UI.showConversationCaptionsDescription}）</small></span>
                  </label>
                </section>

                <section className="settings-group" aria-labelledby="developer-settings-heading">
                  <h2 id="developer-settings-heading">{UI.developerSettings}</h2>
                  <label
                  className="settings-item developer-setting"
                  style={{
                    color: "#bbb",
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
                  <span>{UI.developerMode}</span>
                  </label>
                </section>

                <div style={{ fontSize: "0.75em", color: "#666" }}>
                  Build: {buildTimeJst}
                  {accessCount !== null && (
                    <span style={{ marginLeft: 8, color: "#999" }}>
                      {formatCount(accessCount)}
                    </span>
                  )}
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
            )}

          {mode === "TRAIN" && debugMode && <RecentLogs logs={pickLogs} />}
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
