import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function SpeechTest() {
    const start = () => {
        const SR = window.SpeechRecognition ||
            window.webkitSpeechRecognition;
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
        rec.onerror = (e) => console.log("❌ onerror:", e.error);
        rec.onresult = (e) => {
            const text = e.results[0][0].transcript;
            console.log("✅ 認識結果:", text);
            alert("認識結果: " + text);
        };
        try {
            rec.start();
            console.log("start() 呼び出し成功");
        }
        catch (err) {
            console.log("❌ start() 例外:", err);
        }
    };
    return (_jsxs("div", { style: { padding: 24 }, children: [_jsx("h2", { children: "SpeechRecognition \u6700\u5C0F\u30C6\u30B9\u30C8" }), _jsx("button", { onClick: start, style: { fontSize: 20, padding: "10px 16px" }, children: "\uD83C\uDFA4 \u9332\u97F3\u958B\u59CB" }), _jsx("p", { children: "\u203B \u82F1\u8A9E\u3067\u8A71\u3057\u3066\u304F\u3060\u3055\u3044" })] }));
}
