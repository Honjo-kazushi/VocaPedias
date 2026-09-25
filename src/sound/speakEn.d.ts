import type { CharacterId } from "../characters/characterProfiles";
export type SpeechLocale = "ja-JP" | "en-US";
export type SpeechQueueItem = {
    lang: SpeechLocale;
    text: string;
    brightJapanese?: boolean;
    characterId?: CharacterId;
    avoidVoiceCharacterId?: CharacterId;
    rateMultiplier?: number;
};
export declare function speakEn(text: string, onEnd?: () => void, lang?: "en" | "ja", onStart?: () => void, onBoundary?: (event: SpeechSynthesisEvent) => void): string | null;
export declare function splitSpeechSentences(text: string): string[];
export type SpeechFinishReason = "complete" | "cancel" | "error";
export type SentenceSpeechCallbacks = {
    onFinish?: (reason: SpeechFinishReason) => void;
    onSentenceStart: (sentence: string) => void;
    onSentenceEnd: () => void;
    onBoundary?: (event: SpeechSynthesisEvent) => void;
};
export type SpeechQueueCallbacks = {
    onFinish?: (reason: SpeechFinishReason) => void;
    onItemStart: (item: SpeechQueueItem, index: number) => void;
    onItemEnd: (item: SpeechQueueItem, index: number) => void;
    onBoundary?: (event: SpeechSynthesisEvent) => void;
};
export declare function speakSpeechQueue(items: SpeechQueueItem[], callbacks: SpeechQueueCallbacks, characterId?: CharacterId): (requestReason?: string) => void;
export declare function speakEnSentences(text: string, callbacks: SentenceSpeechCallbacks, characterId?: CharacterId, locale?: SpeechLocale, rateMultiplier?: number): (requestReason?: string) => void;
