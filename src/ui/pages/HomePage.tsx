import "../../styles/style.css";
import { useEffect, useState, useMemo, useRef} from "react";
import { InMemoryPhraseRepository } from "../../infra/InMemoryPhraseRepository";
import type { Phrase } from "../../app/ports/PhraseRepository";
import { playSe } from "../../sound/playSe";
import { speakEn } from "../../sound/speakEn";
import { createPortal } from "react-dom";
import { PHRASES_SEED } from "../../data/phrases.seed";
import { getNextPhrase } from "../../app/usecases/getNextPhrase";

import { TrainUI } from "../../components/TrainUI";
import { PracticeUI } from "../../components/PracticeUI";


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
  const [debugMode, setDebugMode] = useState(false);

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
    if (elapsed < 0.5) return false;
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
    };

    const MODE_LABELS = jpLearnMode
    ? {
        TRAIN: "Training",
        A: "Conversation",
        B: "Emotion",
        C: "State",
        D: "Practical",
        E: "Judgement",
        F: "Others",
      }
    : {
        TRAIN: "脳トレ",
        A: "会話",
        B: "感情",
        C: "状態",
        D: "実務",
        E: "判断",
        F: "その他",
      };

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
  }, [randomPhrase, showEn, autoNext, isPaused]);

  useEffect(() => {
    if (mode !== "TRAIN") {
      clearEnTriggers();
      if (jpTimerRef.current) {
        clearInterval(jpTimerRef.current);
        jpTimerRef.current = null;
      }
    }
      setIsPaused(false);
      setIsBusy(false);
      setGoNext(false);
      setShowEn(false);
  }, [mode]);

/*   useEffect(() => {
    startQuestion();
  }, []);
 */

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
        
{/* ===== PRACTICE 仮表示（HomePage内・非侵襲） ===== */}
{mode !== "TRAIN" && (
  <div
    style={{
      margin: "12px 0",
      padding: "12px",
      border: "1px solid #ccc",
      borderRadius: 6,
      background: "#fff",
    }}
  >
    <div style={{ fontWeight: "bold", marginBottom: 8 }}>
      {MODE_LABELS[mode]}（Practice 仮）
    </div>


    {PHRASES_SEED
      .filter(p => p.tags2?.main === MODE_LABELS[mode])
      .slice(0, 30)
      .map(p => (
          <div
            key={p.id}
            style={{
              padding: "6px 0",
              borderBottom: "1px dashed #eee",
              cursor: p.meaningGroup ? "pointer" : "default",
              opacity: p.meaningGroup ? 1 : 0.5,
            }}
            onClick={() => {
              if (!p.meaningGroup) return;
              console.log("practice tap:", p.id, p.meaningGroup);
              setActiveMeaningGroup(p.meaningGroup);
            }}
          >
          <div>{p.jp}</div>
          <div style={{ fontSize: "0.9em", color: "#555" }}>
            {p.en}
          </div>
        </div>
      ))}
  </div>
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
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ fontWeight: "bold", marginBottom: 8 }}>
        関連フレーズ
      </div>

      {PHRASES_SEED
        .filter(p => p.meaningGroup === activeMeaningGroup)
        .map(p => (
          <div key={p.id} style={{ marginBottom: 6 }}>
            <div>{p.jp}</div>
            <div style={{ fontSize: "0.9em", color: "#555" }}>
              {p.en}
            </div>
          </div>
        ))}

      <button
        style={{ marginTop: 12 }}
        onClick={() => setActiveMeaningGroup(null)}
      >
        閉じる
      </button>
    </div>
  </div>
)}

        {/* 上部の余白（将来：アプリイラスト／ガイド） */}
        <div className="spacer-top" />
          
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

    
          {/* 出題エリア */}
          {mode === "TRAIN" && randomPhrase && (() => {
            const promptText = jpLearnMode ? randomPhrase.en : randomPhrase.jp;
            const answerText = jpLearnMode ? randomPhrase.jp : randomPhrase.en;
            return (
              <div>
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

