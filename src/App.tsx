import HomePage from "./ui/pages/HomePage";
import TtsVoiceTester from "./components/TtsVoiceTester";
import PerfDebugPanel from "./components/PerfDebugPanel";
import { isTossaPerfDebugEnabled } from "./debug/tossaPerf";
import "./App.css";

function App() {
  if (new URLSearchParams(window.location.search).get("ttsDebug") === "1") {
    return <TtsVoiceTester />;
  }
  return (
    <>
      <HomePage />
      {isTossaPerfDebugEnabled() && <PerfDebugPanel />}
    </>
  );
}

export default App;
