export default function SpeechTest() {
  const start = () => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SR) {
      console.log("❌ SpeechRecognition API がありません");
      alert("SpeechRecognition API がありません");
      return;
    }

    console.log("✅ SpeechRecognition API 検出");

    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;

    rec.onstart = () => console.log("▶️ onstart: 録音開始");
    rec.onend = () => console.log("⏹ onend: 録音終了");
    rec.onerror = (e: any) =>
      console.log("❌ onerror:", e.error);

    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      console.log("✅ 認識結果:", text);
      alert("認識結果: " + text);
    };

    try {
      rec.start();
      console.log("start() 呼び出し成功");
    } catch (err) {
      console.log("❌ start() 例外:", err);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>SpeechRecognition 最小テスト</h2>
      <button
        onClick={start}
        style={{ fontSize: 20, padding: "10px 16px" }}
      >
        🎤 録音開始
      </button>
      <p>※ 英語で話してください</p>
    </div>
  );
}
