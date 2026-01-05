// src/components/TrainUI.tsx
import type { Phrase } from "../app/ports/PhraseRepository";

type Mode = "TRAIN" | "A" | "B" | "C" | "D" | "E" | "F";

type Props = {
  // mode UI
  mode: Mode;
  modeLabels: Record<Mode, string>;
  onChangeMode: (m: Mode) => void;

  // 設定ボタン（任意）
  showSettingsButton?: boolean;
  onOpenSettings?: () => void;

  // 表示データ
  randomPhrase: Phrase | null;
  showEn: boolean;
  elapsed: number;
  uiText: {
    next: string;
    pause: string;
    english: string;
    ready: string;
  };
  tagEmoji: Record<string, string>;
  promptText: string;
  answerText: string;

  // 状態
  isBusy: boolean;
  isPaused: boolean;

  // 操作通知
  onNext: () => void;
  onPause: () => void;
  onRevealEnglish: () => void;

};

export function TrainUI(props: Props) {
  const {

    randomPhrase,
    showEn,
    elapsed,
    uiText,
    tagEmoji,

    isBusy,
    isPaused,
    onNext,
    onPause,
    onRevealEnglish,

    showSettingsButton = false,
    onOpenSettings,
  } = props;

  return (
    <div style={{ position: "relative" }}>
      {showSettingsButton && (
        <button
          className="btn-settings"
          aria-label="settings"
          onClick={() => onOpenSettings?.()}
        >
          ⚙️
        </button>
      )}

      <img src="/images/tossa.png" alt="tossa" className="app-logo" />

      <div className="mode-select-wrap">
        <select
          className="mode-select"
          value={mode}
          onChange={(e) => onChangeMode(e.target.value as Mode)}
        >
          <option value="TRAIN">{modeLabels.TRAIN}</option>
          <option value="A">{modeLabels.A}</option>
          <option value="B">{modeLabels.B}</option>
          <option value="C">{modeLabels.C}</option>
          <option value="D">{modeLabels.D}</option>
          <option value="E">{modeLabels.E}</option>
          <option value="F">{modeLabels.F}</option>
        </select>
      </div>

      <div className="app-main">
        <div className="spacer-top" />

        <div className="player-controls">
          <button
            className="btn btn-stop"
            disabled={isBusy || isPaused}
            onClick={onPause}
          >
            {uiText.pause}
          </button>

          <button className="btn btn-next" onClick={onNext}>
            {uiText.next}
          </button>

          <button
            className="btn btn-en"
            disabled={isBusy || isPaused}
            onClick={onRevealEnglish}
          >
            {uiText.english}
          </button>
        </div>

        {randomPhrase && (
          <div>
            <div className="prompt-text">
              <span style={{ marginRight: 8 }}>
                {tagEmoji[randomPhrase.tags?.[0] ?? ""] ?? ""}
              </span>
              {promptText}
            </div>

            {!showEn && (
              <div className="count-text">
                {elapsed < 3 ? `${3 - elapsed}` : uiText.ready}
              </div>
            )}

            {showEn && <div className="answer-text">{answerText}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
