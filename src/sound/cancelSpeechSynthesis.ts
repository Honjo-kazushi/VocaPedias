import type { CharacterId } from "../characters/characterProfiles";
import { tossaPerf } from "../debug/tossaPerf";

export type TtsCancelContext = {
  reason: string;
  source: string;
  characterId?: CharacterId | null;
  utteranceId?: number | null;
  generation?: number | null;
  conversationState?: string;
};

type ActiveTtsState = {
  characterId: CharacterId | null;
  utteranceId: number | null;
  generation: number | null;
  phase: string;
  source: string;
};

let activeTtsState: ActiveTtsState = {
  characterId: null,
  utteranceId: null,
  generation: null,
  phase: "idle",
  source: "none",
};
let activeConversationState = "unknown";

export function setActiveTtsState(next: Partial<ActiveTtsState>): void {
  activeTtsState = { ...activeTtsState, ...next };
}

export function setTtsConversationState(state: string): void {
  activeConversationState = state;
}

function currentScreen(): string {
  return typeof window === "undefined" ? "unknown" : `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function cancelSpeechSynthesis(synth: SpeechSynthesis, context: TtsCancelContext): void {
  const timestamp = typeof performance === "undefined" ? Date.now() : performance.now();
  tossaPerf("TTS", "TTS CANCEL REQUEST", {
    timestamp: timestamp,
    reason: context.reason,
    caller: context.source,
    source: context.source,
    characterId: context.characterId ?? activeTtsState.characterId,
    utteranceId: context.utteranceId ?? activeTtsState.utteranceId,
    generation: context.generation ?? activeTtsState.generation,
    currentTtsState: activeTtsState.phase,
    activeTtsSource: activeTtsState.source,
    synthSpeaking: Boolean(synth.speaking),
    synthPending: Boolean(synth.pending),
    synthPaused: Boolean(synth.paused),
    currentScreen: currentScreen(),
    conversationState: context.conversationState ?? activeConversationState,
  });
  activeTtsState = { ...activeTtsState, phase: "cancel-requested" };
  synth.cancel();
}
