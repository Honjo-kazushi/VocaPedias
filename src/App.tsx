import { useState } from "react";
import HomePage from "./ui/pages/HomePage";
import TtsVoiceTester from "./components/TtsVoiceTester";
import PerfDebugPanel from "./components/PerfDebugPanel";
import FeedbackPage from "./feedback/FeedbackPage";
import { unlockAppleTtsOnUserGesture } from "./sound/speakEn.ts";
import type { MainMode } from "./ui/static/uiStatic";
import "./App.css";

const STARTUP_MODES: ReadonlyArray<{ mode: MainMode; label: string; description: string }> = [
  { mode: "AI", label: "AI会話", description: "AIキャラクターと英会話" },
  { mode: "DAILY", label: "日常フレーズ", description: "日常で使う英語を練習" },
  { mode: "SCENE", label: "場面フレーズ", description: "場面別の英語を練習" },
  { mode: "TRAIN", label: "フレーズ学習", description: "覚えた英語をとっさに発話" },
];

function App() {
  const [startupMode, setStartupMode] = useState<MainMode | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const searchParams = new URLSearchParams(window.location.search);
  const perfDebugPanelEnabled = searchParams.get("perfDebug") === "1";
  if (searchParams.get("ttsDebug") === "1") {
    return <TtsVoiceTester />;
  }
  const selectStartupMode = (mode: MainMode) => {
    unlockAppleTtsOnUserGesture("startup-dialog");
    setStartupMode(mode);
  };
  return (
    <>
      {startupMode && <HomePage initialMainMode={startupMode} />}
      {perfDebugPanelEnabled && <PerfDebugPanel />}
      {!startupMode && (
        showFeedback ? <FeedbackPage onBack={() => setShowFeedback(false)} /> : <div className="startup-guide-overlay" role="presentation">
          <section className="startup-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="startup-guide-title">
            <h1 id="startup-guide-title">TossaSpeak</h1>
            <p className="startup-guide-prompt">起動するモードを選んでください</p>
            <div className="startup-mode-list">
              {STARTUP_MODES.map(({ mode, label, description }) => (
                <button
                  type="button"
                  className={mode === "AI" ? "startup-mode-button primary" : "startup-mode-button"}
                  autoFocus={mode === "AI"}
                  key={mode}
                  onClick={() => selectStartupMode(mode)}
                >
                  <strong>【{label}】</strong>
                  <span>{description}</span>
                </button>
              ))}
              <button
                type="button"
                className="startup-mode-button"
                onClick={() => setShowFeedback(true)}
              >
                <strong>【ご意見・ご感想】</strong>
                <span>感想や改善のご提案</span>
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export default App;
