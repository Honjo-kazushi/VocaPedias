import HomePage from "./ui/pages/HomePage";
import TtsVoiceTester from "./components/TtsVoiceTester";

function App() {
  if (new URLSearchParams(window.location.search).get("ttsDebug") === "1") {
    return <TtsVoiceTester />;
  }
  return <HomePage />;
}

export default App;
