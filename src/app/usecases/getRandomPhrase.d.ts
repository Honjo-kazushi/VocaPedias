import type { PhraseRepository, PhraseQuery, Phrase } from "../ports/PhraseRepository";
export declare function getRandomPhrase(repo: PhraseRepository, q?: Omit<PhraseQuery, "limit">): Promise<Phrase | null>;
