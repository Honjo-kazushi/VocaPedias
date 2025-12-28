export function speakEn(
  text: string,
  onEnd?: () => void,
  lang: "en" | "ja" = "en"
) {
  if (!window.speechSynthesis) return;

  const utter = new SpeechSynthesisUtterance(text);

  utter.lang = lang === "ja" ? "ja-JP" : "en-US";
  utter.rate = lang === "ja" ? 1.3 : 1.0;


  const voices = speechSynthesis.getVoices();
  const voice = voices.find(v =>
    lang === "ja" ? v.lang.startsWith("ja") : v.lang.startsWith("en")
  );
  if (voice) utter.voice = voice;

  utter.onend = () => {
    if (onEnd) onEnd();
  };

  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}
