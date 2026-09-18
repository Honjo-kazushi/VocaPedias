import { useEffect, useRef, useState } from "react";
import type { CharacterProfile } from "../characters/characterProfiles";
import type { CharacterExpression } from "../data/characters";
import type { ListeningPose } from "./useCharacterListening";

type IdleVisual = {
  expression: CharacterExpression;
  listening: boolean;
  pose: ListeningPose;
};

const NEUTRAL: IdleVisual = { expression: "neutral", listening: false, pose: "neutral" };
const randomMs = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

export function useIdleExpression(active: boolean, profile: CharacterProfile, blinkImage: string | undefined): IdleVisual {
  const [visual, setVisual] = useState<IdleVisual>(NEUTRAL);
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = ++generationRef.current;
    let timer: number | null = null;
    let preload: HTMLImageElement | null = null;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (generationRef.current !== generation) return;
        if (!blinkImage || profile.expressionBias.listening < 0.5) return;
        setVisual({ expression: "neutral", listening: true, pose: "blink" });
        timer = window.setTimeout(() => {
          if (generationRef.current !== generation) return;
          setVisual(NEUTRAL);
          schedule();
        }, randomMs(150, 300));
      }, randomMs(4000, 8000));
    };

    timer = window.setTimeout(() => {
      if (generationRef.current !== generation) return;
      setVisual(NEUTRAL);
      if (!active || !blinkImage || profile.expressionBias.listening < 0.5) return;
      preload = new Image();
      preload.src = blinkImage;
      void preload.decode().catch(() => undefined).then(() => {
        if (generationRef.current === generation) schedule();
      });
    }, 0);
    return () => {
      generationRef.current += 1;
      preload = null;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [active, blinkImage, profile]);

  return active ? visual : NEUTRAL;
}
