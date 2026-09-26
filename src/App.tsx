import { useState } from "react";
import HomePage from "./ui/pages/HomePage";
import TtsVoiceTester from "./components/TtsVoiceTester";
import PerfDebugPanel from "./components/PerfDebugPanel";
import { isTossaPerfDebugEnabled } from "./debug/tossaPerf";
import { unlockAppleTtsOnUserGesture } from "./sound/speakEn.ts";
import "./App.css";

function App() {
  const [showStartupGuide, setShowStartupGuide] = useState(true);
  if (new URLSearchParams(window.location.search).get("ttsDebug") === "1") {
    return <TtsVoiceTester />;
  }
  const closeStartupGuide = () => {
    unlockAppleTtsOnUserGesture("startup-dialog");
    setShowStartupGuide(false);
  };
  return (
    <>
      <HomePage />
      {isTossaPerfDebugEnabled() && <PerfDebugPanel />}
      {showStartupGuide && (
        <div className="startup-guide-overlay" role="presentation">
          <section className="startup-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="startup-guide-title">
            <h1 id="startup-guide-title">TossaSpeak</h1>
            <p>会話中は字幕のON/OFFを切り替えられます。</p>
            <p>話す速さも</p>
            <p>「ゆっくり / ややゆっくり / 通常」</p>
            <p>から変更できます。</p>
            <p>設定はいつでも変更できます。</p>
            <button type="button" autoFocus onClick={closeStartupGuide}>OK</button>
          </section>
        </div>
      )}
    </>
  );
}

export default App;
