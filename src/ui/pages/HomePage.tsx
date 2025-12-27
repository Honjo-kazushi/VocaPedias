import "../../styles/style.css";
import { useEffect, useState, useMemo, useRef} from "react";
import { InMemoryPhraseRepository } from "../../infra/InMemoryPhraseRepository";
import { searchPhrases } from "../../app/usecases/searchPhrases";
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
  const [keyword, setKeyword] = useState("");
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [randomPhrase, setRandomPhrase] = useState<Phrase | null>(null);
  const [focus, setFocus] = useState(true);
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

  const jpTimerRef = useRef<number | null>(null);
  const enTimerRef = useRef<number | null>(null);
  const speakGenRef = useRef(0); // TTSコールバック持ち越し防止（フラグ増殖ではなく世代番号1本）

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
    if (!focus || !randomPhrase) return;
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
              speakEn(randomPhrase.en, () => {
                if (speakGenRef.current !== gen) return; // 古い発声の終端は無視
                requestGoNext();
              });
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
  }, [focus, randomPhrase, showEn, autoNext, isPaused]);

  useEffect(() => {
    searchPhrases(repo, {
      keyword: keyword || undefined,
      limit: 3,
    }).then(setPhrases);
  }, [keyword]);

  useEffect(() => {
    startQuestion();
  }, []);

  return (
      <div style={{ position: "relative" }}>
        {/* 設定ボタン：センター箱の外・固定 */}
        <button
          aria-label="settings"
          onClick={() => {
            if (soundOn) playSe();
            setShowSettings(true);
          }}
          
          style={{
            position: "fixed",
            top: 8,
            right: 8,
            zIndex: 1000,
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: "20px",
            cursor: "pointer",
            padding: 4,
          }}
        >
          ⚙️
        </button>

        <img
          src="/images/tossa.png"
          alt="tossa"
          style={{
            width: 144,
            height: "auto",
            opacity: 0.6,
            display: "block",
            margin: "8px auto 16px",
            pointerEvents: "none",
          }}
        />

        {/* ===== メインUI：センター1列 ===== */}
        <div
          style={{
            maxWidth: 360,
            margin: "0 auto",
            padding: "16px",
            textAlign: "center",
            background: "rgba(255,0,0,0.05)",
          }}
        >
          {/* 上部の余白（将来：アプリイラスト／ガイド） */}
          <div style={{ height: 48 }} />

          {/* 検索（確認モード用。今はあってOK） */}
          <input
            placeholder="キーワード（例: see / なるほど）"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "8px",
              marginBottom: 12,
            }}
          />
        <div className="player-controls">
          <button
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
            Ⅱ 停止
          </button>

          {/* 次へ */}
          <button
            onClick={() => {
              if (soundOn) playSe();
              if (isBusy) return;
              setIsPaused(false);
              if (!canAcceptInput()) return;
              requestGoNext();
            }}
          >
            ▷ 次へ
          </button>

              {/* 英語を見る（必要なときだけ） */}
              {/* {!showEn && ( */}
                <button
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
                      speakEn(randomPhrase.en, () => {
                        if (speakGenRef.current !== gen) return;
                        setIsBusy(false);
                        if (autoNext && !isPaused) requestGoNext();
                      });
                    } else {
                      if (soundOn) playSe();
                        scheduleGoNext2s();
                        setTimeout(() => { setIsBusy(false); }, 0);
                    }
                  }}
                >
                  English
                </button>
              {/* )} */}
        </div>


          {/* 出題エリア */}
          {focus && randomPhrase && (
            <div>
              <div style={{ fontSize: "1.2em" }}>
                <span style={{ marginRight: 8 }}>
                  {TAG_EMOJI[randomPhrase.tags?.[0] ?? ""] ?? ""}
                </span>
                {randomPhrase.jp}
              </div>

              {/* 0–3秒：カウント / 3秒：考えた？ */}
              {!showEn && (
                <div style={{ color: "#888", marginBottom: 12 }}>
                  {elapsed < 3 ? `${3 - elapsed}` : "考えた？"}
                </div>
              )}


              {/* 英語表示 */}
              {showEn && (
                <div style={{ fontSize: "1.3em", color: "#555", marginTop: 12 }}>
                  {randomPhrase.en}
                </div>
              )}
            </div>
          )}
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
            自動で次へ
          </label>

          <label style={{ display: "block", marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={soundOn}
              onChange={(e) => setSoundOn(e.target.checked)}
            />
            操作音（SE）
          </label>

          <label style={{ display: "block" }}>
            <input
              type="checkbox"
              checked={ttsOn}
              onChange={(e) => setTtsOn(e.target.checked)}
            />
            英語の音声（TTS）
          </label>

          <label style={{ display: "block", marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={autoSpeakOnTimeout}
              onChange={(e) => setAutoSpeakOnTimeout(e.target.checked)}
            />
            タイムアップ時に自動で英語を表す
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
            onClick={() => {
              if (soundOn) playSe();
              setShowSettings(false);
            }}
            style={{
              marginTop: 12,
              width: "100%",
            }}
          >
            閉じる
          </button>

        </div>,
        document.body
      )
    }
    
      {debugMode && (
        <RecentLogs logs={pickLogs} />
      )}

    </div>
  );
}

