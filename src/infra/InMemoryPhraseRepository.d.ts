import type { PhraseRepository, Phrase, PhraseQuery } from "../app/ports/PhraseRepository";
export declare class InMemoryPhraseRepository implements PhraseRepository {
    private phrases;
    constructor(phrases: Phrase[]);
    listAll(): Promise<Phrase[]>;
    getById(id: string): Promise<Phrase | null>;
    search(q: PhraseQuery): Promise<Phrase[]>;
}
