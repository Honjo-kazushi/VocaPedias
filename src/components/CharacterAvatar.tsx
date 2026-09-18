import type { ListeningPose } from "../hooks/useCharacterListening";
import type { Ref } from "react";
import type { CharacterDefinition, CharacterExpression } from "../data/characters";

type Props = {
  character: CharacterDefinition;
  expression?: CharacterExpression;
  intro?: boolean;
  isSpeaking?: boolean;
  isListening?: boolean;
  listeningPose?: ListeningPose;
  mouthOpenRef?: Ref<HTMLImageElement>;
  onIntroImageLoad?: () => void;
};

export function CharacterAvatar({ character, expression = "neutral", intro = false, isSpeaking = false, isListening = false, listeningPose = "neutral", mouthOpenRef, onIntroImageLoad }: Props) {
  const listening = isListening && !isSpeaking;
  const images = character.expressions[expression];
  const neutral = character.expressions.neutral;
  const closed = listening
    ? (listeningPose !== "neutral" ? character.listening?.[listeningPose] : undefined) ?? character.expressions.neutral.closed
    : isSpeaking ? neutral.closed : images.closed;
  if (intro) return <img className={`character-avatar intro intro-${character.id}-${expression}`} src={closed} alt={character.name} onLoad={onIntroImageLoad} />;
  return (
    <div className={`character-avatar-stack avatar-${character.id} ${isSpeaking ? "is-speaking" : ""}`}>
      <img
        ref={mouthOpenRef}
        className="character-avatar character-mouth"
        src={closed}
        data-closed-src={neutral.closed}
        data-open-src={neutral.open}
        alt={character.name}
      />
    </div>
  );
}
