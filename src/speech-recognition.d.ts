interface AppSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: {
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
  }) => void) | null;
  start(): void;
  stop(): void;
}

interface Window {
  SpeechRecognition?: new () => AppSpeechRecognition;
  webkitSpeechRecognition?: new () => AppSpeechRecognition;
}
