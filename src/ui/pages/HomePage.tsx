import "../../styles/style.css";
import { useEffect, useState, useMemo, useRef} from "react";
import { InMemoryPhraseRepository } from "../../infra/InMemoryPhraseRepository";
import type { Phrase } from "../../app/ports/PhraseRepository";
import { playSe } from "../../sound/playSe";
import { speakEn } from "../../sound/speakEn";
import { createPortal } from "react-dom";
import { PHRASES_SEED } from "../../data/phrases.seed";
import { getNextPhrase } from "../../app/usecases/getNextPhrase";


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



export default function HomePage() {
  const [randomPhrase, setRandomPhrase] = useState<Phrase | null>(null);
  const [showEn, setShowEn] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [goNext, setGoNext] = useState(false);
  const [autoNext, setAutoNext] = useState<boolean>(() => readBool("autoNext", true));
  const [soundOn, setSoundOn] = useState<boolean>(() => readBool("soundOn", true));
  const [ttsOn, setTtsOn]     = useState<boolean>(() => readBool("ttsOn", true));
  const [debugMode, setDebugMode] =
    useState<boolean>(() => readBool("debugMode", false));
  const STAR_KEY = "debugStarredPhraseIds";

  const [starredIds, setStarredIds] = useState<string[]>(() => {
    if (!debugMode) return [];
    try {
      return JSON.parse(localStorage.getItem(STAR_KEY) ?? "[]");
    } catch {
      return [];
    }
  });

  const toggleStar = (id: string) => {
    setStarredIds(prev => {
      const next = prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id];
      localStorage.setItem(STAR_KEY, JSON.stringify(next));
      return next;
    });
  };

  const clearAllStars = () => {
    setStarredIds([]);
    localStorage.removeItem(STAR_KEY);
  };

  const repo = useMemo(
    () => new InMemoryPhraseRepository(PHRASES_SEED),
    []
  );
  const [pickLogs, setPickLogs] = useState<PickLog[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const canAcceptInput = () => {
    if (isPaused) return false;
    if (isBusy) return false;
    // if (elapsed < 0.5) return false;
    if (!showEn && autoNext && elapsed >= 4.5) return false;
    return true;
  };

  const [autoSpeakOnTimeout, setAutoSpeakOnTimeout] =
    useState<boolean>(() => readBool("autoSpeakOnTimeout", false));
  const [jpLearnMode, setJpLearnMode] =
    useState<boolean>(() => readBool("jpLearnMode", false));

  const jpTimerRef = useRef<number | null>(null);
  const enTimerRef = useRef<number | null>(null);
  const speakGenRef = useRef(0); // TTSコールバック持ち越し防止（フラグ増殖ではなく世代番号1本）

  type Mode = "TRAIN" | "A" | "B" | "C" | "D" | "E" | "F";
  const [mode, setMode] = useState<Mode>("TRAIN");

  const [activeMeaningGroup, setActiveMeaningGroup] =
  useState<string | null>(null);
  const [practiceSub, setPracticeSub] = useState<string | null>(null);

const PRACTICE_MAIN_JP: Record<Mode, string | null> = {
  TRAIN: null,
    A: "会話",
    B: "感情",
    C: "状態",
    D: "行動",
    E: "判断",
    F: "配慮",
};

const practiceMainJp = mode !== "TRAIN" ? PRACTICE_MAIN_JP[mode] : null;

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
  return Array.from(map.entries()).map(([sub, count]) => ({ sub, count }));
}, [practiceMainPhrases]);

const practicePhrases = useMemo(() => {
  if (!practiceSub) return practiceMainPhrases;
  return practiceMainPhrases.filter(p => p.tags2?.sub === practiceSub);
}, [practiceMainPhrases, practiceSub]);

  const UI = jpLearnMode
  ? {
      next: "▷ Next",
      pause: "Ⅱ Pause",
      english: "Japanese",
      keyword: "Keyword (e.g. see / I see)",
      ready: "Ready?",
      autoNext: "Auto Next",
      uiSounds: "UI Sounds",
      tts: "Voice (TTS)",
      autoSpeak: "Show Answer on Timeout",
      close: "Close",
      settings: "Settings",
      related: "Related phrases",
      practiceGuide:
        "Tap the bold phrases to view related phrases.",
    }
  : {
      next: "▷ 次へ",
      pause: "Ⅱ 停止",
      english: "English",
      keyword: "キーワード（例: see / なるほど）",
      ready: "考えた？",
      autoNext: "自動で次へ",
      uiSounds: "操作音(SE）",
      tts: "英語の音声（TTS）",
      autoSpeak: "タイムアップ時に自動で英語を表す",
      close: "閉じる",
      settings: "設定",
      related: "関連フレーズ",
      practiceGuide:
        "太文字フレーズを押すと関連フレーズを見れます",
    };

    const MODE_LABELS = jpLearnMode
    ? {
        TRAIN: "Training",
        A: "Conversation",
        B: "Emotion",
        C: "State",
        D: "Action",
        E: "Judgement",
        F: "Consideration",
      }
    : {
        TRAIN: "脳トレ",
        A: "会話",
        B: "感情",
        C: "状態",
        D: "行動",
        E: "判断",
        F: "配慮",
      };


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

  const TAG_EMOJI: Record<string, string> = {
  // 行動・進行
  出発: "🚶",
  到着: "📍",
  終了: "🏁",
  促し: "👉",
  指示: "📣",
  依頼: "🙏",
  確認: "❓",
  質問: "❔",

  // 判断・状態
  許可: "👍",
  保留: "⏸️",
  拒否: "✋",
  強調: "❗",
  評価: "⭐",
  一致: "🎯",
  変化: "🔄",

  // 感情・心理
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

  // 注意・警告
  注意: "⚠️",
  トラブル: "🚨",
  予防: "🛡️",

  // 会話・対人
  挨拶: "👋",
  応答: "💬",
  近況: "🗣️",
  理由: "🧠",

  // 実務・生活
  支払い: "💰",
  接客: "🙇",
  天気: "🌧️",

  // 感情・反応
提案: "💡",
喜び: "😊",
怒り: "😠",
悲哀: "😢",
驚き: "😲",
共感: "🤝",
残念: "😞",

// 状態・状況
体調: "🤒",
状況: "📍",
進行: "🔄",
環境: "🌍",
能力: "💪",
不確実: "🤔",

// 会話アクション
制止: "✋",
申し出: "🙋",
同意: "👍",
否定: "❌",
前置: "☝️",
教訓: "📘",
雑談: "💬",

// === 追加定義（未定義分） ===
曖昧: "🤷",
断り: "🚫",
反応: "😮",
医療: "🩺",
仕事: "💼",
買い物: "🛒",
量: "📏",
順番: "🔢",
映画: "🎬",
場所: "📍",
事実: "📄",
突然: "⚡",
順序: "➡️",
前置き: "☝️",
注意喚起: "⚠️",
時間: "⏰",
予定: "📅",
食事: "🍽️",
説明: "📖",
諦め: "😔"

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

  const [showSettings, setShowSettings] = useState(false);

  const playClickSe = () => {
    if (soundOn) playSe();
  };

  const practiceListRef = useRef<HTMLDivElement | null>(null);

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
      clearEnTriggers();

    // ★ すでに停止中なら「準備だけして開始しない」
    if (isPaused) {
      const result = await getNextPhrase(
        repo,
        randomPhrase?.id,
        pickLogs        // ★そのまま渡す
      );
      setRandomPhrase(result.phrase);
      setShowEn(false);
      setElapsed(0);
      return;   // ← ここで止まる
    }
    setIsBusy(true);

    try {
      const result = await getNextPhrase(
        repo,
        randomPhrase?.id,
        pickLogs        // ★そのまま渡す
      );

      setRandomPhrase(result.phrase);
      setShowEn(false);
      setElapsed(0);
      
      setPickLogs((logs) => {
        const primaryTag =
          result.phrase.tags && result.phrase.tags.length > 0
            ? result.phrase.tags[0]
            : null;

        // このタグがこれまで何回出たか
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

        if (next >= 5 && !showEn && autoNext && !isPaused) {

          setPickLogs((logs) => {
            if (logs.length === 0) return logs;
            const last = logs[logs.length - 1];
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
                  if (speakGenRef.current !== gen) return; // 古い発声の終端は無視
                  requestGoNext();
                },
                jpLearnMode ? "ja" : "en"
              );
            } else {
              scheduleGoNext2s();
            }
          } else {
            requestGoNext();
          }

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
      <div style={{ position: "relative" }}>
        {/* 設定ボタン：センター箱の外・固定 */}
      {mode === "TRAIN" && (
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
      )}

        <img
          src="/images/tossa.png"
          alt="tossa"
          className="app-logo"
        />

<div className="app-description">
  <div>
    "<strong>脳トレ</strong>"を選んだ状態で「<strong>次へ</strong>」を押す：学習スタート
  </div>
  <div style={{ marginTop: 4 }}>
    "脳トレ"以外を選ぶ：フレーズ集の閲覧
  </div>
  <div>
    Select “<strong>Training</strong>” and press 「<strong>Next</strong>」 to start learning
  </div>

  <div>
    Select any other mode to browse the phrase list
  </div>
</div>

        <div className="mode-select-wrap">
          <select
            className="mode-select"
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
          >
            <option value="TRAIN">{MODE_LABELS.TRAIN}</option>
            <option value="A">{MODE_LABELS.A}</option>
            <option value="B">{MODE_LABELS.B}</option>
            <option value="C">{MODE_LABELS.C}</option>
            <option value="D">{MODE_LABELS.D}</option>
            <option value="E">{MODE_LABELS.E}</option>
            <option value="F">{MODE_LABELS.F}</option>
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
                  <span style={{ marginRight: 8 }}>
                    {TAG_EMOJI[randomPhrase.tags?.[0] ?? ""] ?? ""}
                  </span>
                  {promptText}
                </div>

                {/* 0–3秒：カウント / 3秒：考えた？ */}
                {!showEn && (
                  <div className="count-text">
                    {elapsed < 3 ? `${3 - elapsed}` : UI.ready}
                  </div>
                )}


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

      {debugMode && (
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
      )}
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
            <div className="practice-item-jp">
              {jpLearnMode ? p.en : p.jp}

              {debugMode && (
                <span className="debug-id-star">
                  {p.id}
                  <span
                    className={`debug-star ${starredIds.includes(p.id) ? "on" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation(); // フレーズクリックと分離
                      toggleStar(p.id);
                    }}
                  >
                    ★
                  </span>
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

      {PHRASES_SEED
        .filter(p => p.meaningGroup === activeMeaningGroup)
        .map(p => (
          <div
            key={p.id}
            style={{
              marginBottom: 6,
              position: "relative",
            }}
          >
            {/* 上段（主表示） */}
            <div>
              {jpLearnMode ? p.en : p.jp}

              {debugMode && (
                <span
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    fontSize: "0.7em",
                    color: "#999",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {p.tags2?.main && p.tags2?.sub && (
                      <span style={{ color: "#777" }}>
                        （{p.tags2.main}−{p.tags2.sub}）
                      </span>
                    )}
                  {p.id}

                  <span
                    style={{
                      cursor: "pointer",
                      opacity: starredIds.includes(p.id) ? 1 : 0.3,
                      color: starredIds.includes(p.id) ? "#f5b301" : undefined,
                    }}
                    onClick={() => toggleStar(p.id)}
                  >
                    ★
                  </span>
                </span>
              )}
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
              requestGoNext();
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

              {/* 英語を見る（必要なときだけ） */}
              {/* {!showEn && ( */}
                <button className="btn btn-en"
                  disabled={isBusy || isPaused}
                  onClick={() => {
                    if (isBusy) return;
                    if (!canAcceptInput()) return;
                    if (!randomPhrase) return;
                    if (isPaused) {
                      speechSynthesis.cancel();
                      setIsPaused(false); // 再開扱い
                    }

                    setIsBusy(true);
                    setShowEn(true);

                    // ★ 直近ログを更新（英語を見た）
                    setPickLogs((logs) => {
                      if (logs.length === 0) return logs;
                      const last = logs[logs.length - 1];

                      return [
                        ...logs.slice(0, -1),
                        {
                          ...last,
                          revealed: true,
                          revealAtSec: elapsed,
                        },
                      ];
                    });

                    if (ttsOn && randomPhrase) {
                    const gen = speakGenRef.current;
                      speakEn(
                        jpLearnMode ? randomPhrase.jp : randomPhrase.en,
                        () => {
                          if (speakGenRef.current !== gen) return;
                          setIsBusy(false);
                          if (autoNext && !isPaused) requestGoNext();
                        },
                        jpLearnMode ? "ja" : "en"
                      );
                    } else {
                      if (soundOn) playSe();
                        scheduleGoNext2s();
                        setTimeout(() => { setIsBusy(false); }, 0);
                    }
                  }}
                >
                  {UI.english}
                </button>
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
          <label style={{ display: "block", marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={autoNext}
              onChange={(e) => setAutoNext(e.target.checked)}
            />
            {UI.autoNext}
          </label>

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

          <label style={{ display: "block", marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={autoSpeakOnTimeout}
              onChange={(e) => setAutoSpeakOnTimeout(e.target.checked)}
            />
            {UI.autoSpeak}
          </label>

          <label style={{ display: "block", marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={jpLearnMode}
              onChange={(e) => setJpLearnMode(e.target.checked)}
            />
            Japanese Learning Mode
          </label>

          <label>
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.target.checked)}
            />
            確認モード（開発用）
          </label>

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
    </div>
  );
}

