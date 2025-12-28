// src/components/TrainUI.tsx
import type { Phrase } from "../app/ports/PhraseRepository";

type Props = {
  randomPhrase: Phrase | null;
  showEn: boolean;
  elapsed: number;
  UI: {
    next: string;
    pause: string;
    english: string;
    ready: string;
  };
  TAG_EMOJI: Record<string, string>;

  // 操作系は「通知」だけ
  onNext: () => void;
  onPause: () => void;
  onRevealEnglish: () => void;
};

export function TrainUI({
  randomPhrase,
  showEn,
  elapsed,
  UI,
  TAG_EMOJI,
  onNext,
  onPause,
  onRevealEnglish,
}: Props) {
  if (!randomPhrase) return null;

  const promptText = randomPhrase.jp;
  const answerText = randomPhrase.en;

  return (
    <div className="app-main">
      <div className="spacer-top" />

      <div className="player-controls">
        <button className="btn btn-stop" onClick={onPause}>
          {UI.pause}
        </button>

        <button className="btn btn-next" onClick={onNext}>
          {UI.next}
        </button>

        {!showEn && (
          <button className="btn btn-en" onClick={onRevealEnglish}>
            {UI.english}
          </button>
        )}
      </div>

      <div>
        <div className="prompt-text">
          <span style={{ marginRight: 8 }}>
            {TAG_EMOJI[randomPhrase.tags?.[0] ?? ""] ?? ""}
          </span>
          {promptText}
        </div>

        {!showEn && (
          <div className="count-text">
            {elapsed < 3 ? `${3 - elapsed}` : UI.ready}
          </div>
        )}

        {showEn && (
          <div className="answer-text">
            {answerText}
          </div>
        )}
      </div>
    </div>
  );
}
