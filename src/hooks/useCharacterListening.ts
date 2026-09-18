import { useCallback, useEffect, useRef, useState } from "react";

export type ListeningPose = "neutral" | "blink" | "nod";
const randomMs = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

export function useCharacterListening() {
  const [pose, setPose] = useState<ListeningPose>("neutral");
  const timerRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const clear = useCallback(() => {
    generationRef.current += 1;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  const stop = useCallback(() => {
    clear();
    setPose("neutral");
  }, [clear]);
  const start = useCallback(() => {
    stop();
    const generation = generationRef.current;
    const wait = () => {
      if (generationRef.current !== generation) return;
      timerRef.current = window.setTimeout(() => {
        if (generationRef.current !== generation) return;
        timerRef.current = null;
        const next = Math.random() < 0.8 ? "blink" : "nod";
        setPose(next);
        timerRef.current = window.setTimeout(() => {
          if (generationRef.current !== generation) return;
          timerRef.current = null;
          setPose("neutral");
          wait();
        }, next === "blink" ? randomMs(150, 300) : randomMs(300, 600));
      }, randomMs(1500, 3500));
    };
    wait();
  }, [stop]);
  useEffect(() => clear, [clear]);
  return { pose, start, stop };
}
