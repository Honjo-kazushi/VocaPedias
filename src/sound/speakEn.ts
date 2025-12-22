export function speakEn(text: string, onEnd?: () => void) {
  if (!("speechSynthesis" in window)) {
    onEnd?.();
    return;
  }

  speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.9;

  u.onend = () => {
    onEnd?.();
  };

  speechSynthesis.speak(u);
}
