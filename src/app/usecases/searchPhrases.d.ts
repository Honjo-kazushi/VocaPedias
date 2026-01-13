import type { PhraseRepository, PhraseQuery, Phrase } from "../ports/PhraseRepository";
export declare function searchPhrases(repo: PhraseRepository, q: PhraseQuery): Promise<Phrase[]>;
