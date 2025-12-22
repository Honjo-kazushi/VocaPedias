import { useEffect, useState } from "react";
import { InMemoryPhraseRepository } from "../../infra/InMemoryPhraseRepository";
import { searchPhrases } from "../../app/usecases/searchPhrases";
import type { Phrase } from "../../app/ports/PhraseRepository";
// import { getRandomPhrase } from "../../app/usecases/getRandomPhrase";
import { playSe } from "../../sound/playSe";
import { speakEn } from "../../sound/speakEn";
import { createPortal } from "react-dom";
import { PHRASES_SEED } from "../../data/phrases.seed";
import { getNextPhrase } from "../../app/usecases/getNextPhrase";

type PickLog = {
  time: number;
  phraseId: string;
  tags: string[];
  rule: string;
  detail: string;
  
  revealed: boolean;     // 英語を見るを押したか
  elapsed: number;       // 押した時点の秒数
};


export default function HomePage() {
  const [keyword, setKeyword] = useState("");
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [randomPhrase, setRandomPhrase] = useState<Phrase | null>(null);
  const [focus, setFocus] = useState(true);
  const [showEn, setShowEn] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // const [goNext, setGoNext] = useState(false);
  const [autoNext, setAutoNext] = useState<boolean>(() => readBool("autoNext", true));
  const [soundOn, setSoundOn] = useState<boolean>(() => readBool("soundOn", true));
  const [ttsOn, setTtsOn]     = useState<boolean>(() => readBool("ttsOn", true));
  const [debugMode, setDebugMode] = useState(false);
  const [hasStarted, setHasStarted] = useState<boolean>(() => {
    return localStorage.getItem("hasStarted") === "true";
  });

  const repo = new InMemoryPhraseRepository(PHRASES_SEED);
  const [pickLogs, setPickLogs] = useState<PickLog[]>([]);
  const [isBusy, setIsBusy] = useState(false);

  const canAcceptInput = () => {
    if (isBusy) return false;        // ★最重要
    if (elapsed < 0.5) return false;
    if (!showEn && autoNext && elapsed >= 4.5) return false;
    return true;
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
  const recent = logs.slice(-3).reverse();

  return (
    <div style={{
      marginTop: 12,
      padding: 8,
      fontSize: "0.8em",
      color: "#555",
      borderTop: "1px dashed #ccc"
    }}>
      {recent.map((l, i) => (
        <div key={i}>
          <strong>{l.phraseId}</strong>
          {" / "}revealed:{l.revealed ? "Y" : "N"}
          {" / "}t:{l.elapsed}s
        </div>
      ))}
    </div>
  );
}

  const [showSettings, setShowSettings] = useState(false);

  const requestGoNext = () => {
    startQuestion();
    // setGoNext(true);
  };

  const startQuestion = async () => {
    if (isBusy) return;
    setIsBusy(true);

    const result = await getNextPhrase(repo, randomPhrase?.id);
    // const p = await getRandomPhrase(repo);
    setRandomPhrase(result.phrase);
    setShowEn(false);
    setElapsed(0);
    setFocus(true);

    // ★ JSONログを積む
    setPickLogs((logs) => [
      ...logs,
      {
        time: Date.now(),
        phraseId: result.phrase.id,
        tags: result.phrase.tags,
        rule: result.reason.rule,
        detail: result.reason.detail,
        revealed: false,
        elapsed: 0,
      },
    ]);

    if (soundOn) playSe();
    setIsBusy(false);
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
    if (!ttsOn) {
      speechSynthesis.cancel();
    }
  }, [ttsOn]);

  /* useEffect(() => {
    if (!goNext) return;

    setGoNext(false);
    startQuestion();
  }, [goNext]); */

  useEffect(() => {
    if (!showEn) return;

    const id = window.setTimeout(() => {
      requestGoNext();
    }, 2000);

    return () => window.clearTimeout(id);
  }, [showEn, autoNext]);

  useEffect(() => {
    if (!focus || !randomPhrase) return;

    const id = window.setInterval(() => {
      setElapsed((e) => {
        const next = e + 1;
        if (next >= 5 && !showEn && autoNext) {
          requestGoNext();
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [focus, randomPhrase, showEn, autoNext]);

  useEffect(() => {
    searchPhrases(repo, {
      keyword: keyword || undefined,
      limit: 3,
    }).then(setPhrases);
  }, [keyword]);

  return (
      <div style={{ position: "relative" }}>
        {/* 設定ボタン：センター箱の外・固定 */}
        <button
          aria-label="settings"
          onClick={() => setShowSettings(v => !v)}
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

          {/* 次へ */}
          <button
            style={{
              width: "100%",
              fontSize: "1.1em",
              padding: "10px 0",
              marginBottom: 8,
            }}
            onClick={() => {
              if (!canAcceptInput()) return;

              // 出題中＝スキップ（英語を見ていない）
              if (focus && randomPhrase && !showEn) {
                setPickLogs((logs) => {
                  if (logs.length === 0) return logs;
                  const last = logs[logs.length - 1];
                  return [
                    ...logs.slice(0, -1),
                    { ...last, revealed: false, elapsed },
                  ];
                });
                requestGoNext();
                return;
              }

              // それ以外（初回・英語表示後など）は従来どおり
              if (!hasStarted) {
                setHasStarted(true);
                localStorage.setItem("hasStarted", "true");
              }
              startQuestion();
            }}
          >
            次へ
          </button>


          {!hasStarted && (
            <div
              style={{
                marginBottom: 24,
                fontSize: "0.95em",
                color: "#777",
              }}
            >
              このボタンを押して開始
            </div>
          )}

          {/* 出題エリア */}
          {focus && randomPhrase && (
            <div>
              <div style={{ fontSize: "2.2em", marginBottom: 16 }}>
                {randomPhrase.jp}
              </div>

              {/* 0–3秒：カウント / 3秒：考えた？ */}
              {!showEn && (
                <div style={{ color: "#888", marginBottom: 12 }}>
                  {elapsed < 3 ? `${3 - elapsed}` : "考えた？"}
                </div>
              )}

              {/* 英語を見る（必要なときだけ） */}
              {!showEn && (
                <button
                  onClick={() => {
                    if (!canAcceptInput()) return;

                    setIsBusy(true);
                    setShowEn(true);

                    // ★ 直近ログを更新（英語を見た）
                    setPickLogs((logs) => {
                      if (logs.length === 0) return logs;
                      const last = logs[logs.length - 1];
                      return [
                        ...logs.slice(0, -1),
                        { ...last, revealed: true, elapsed },
                      ];
                    });

                    if (ttsOn) {
                      speakEn(randomPhrase.en, () => {
                        setIsBusy(false);
                        if (autoNext) requestGoNext();
                      });
                    } else {
                      setTimeout(() => {
                        setIsBusy(false);
                        if (autoNext) requestGoNext();
                      }, 2000);
                    }
                  }}
                  style={{
                    marginTop: 8,
                    padding: "8px 16px",
                  }}
                >
                  英語を見る
                </button>
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
            効果音（SE）
          </label>

          <label style={{ display: "block" }}>
            <input
              type="checkbox"
              checked={ttsOn}
              onChange={(e) => setTtsOn(e.target.checked)}
            />
            英語の音声（TTS）
          </label>

          <label>
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.target.checked)}
            />
            確認モード（開発用）
          </label>

        </div>,
        document.body
      )
    }
    
      {debugMode && (
        <RecentLogs logs={pickLogs} />
      )}

      {/* {debugMode && (
        <PhraseList phrases={phrases} />
      )} */}
    </div>
  );
}

// function PhraseList({ phrases }: { phrases: Phrase[] }) {
//   return (
//     <div style={{ marginTop: 24, padding: 12 }}>
//       <h3 style={{ fontSize: "1em", color: "#666" }}>フレーズ確認（開発用）</h3>

//       {phrases.map((p) => (
//         <div
//           key={p.id}
//           style={{
//             marginBottom: 8,
//             paddingBottom: 8,
//             borderBottom: "1px solid #eee",
//           }}
//         >
//           <div>{p.jp}</div>
//           <div style={{ fontSize: "0.9em", color: "#555" }}>
//             {p.en}
//           </div>
//         </div>
//       ))}
//     </div>
//   );
// }
