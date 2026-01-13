export type Phrase = {
    id: string;
    jp: string;
    en: string;
    tags: string[];
    tags2?: {
        main: string;
        sub: string;
    };
    meaningGroup?: string;
};
export type PhraseQuery = {
    keyword?: string;
    tags?: string[];
    scene?: string;
    limit?: number;
};
export interface PhraseRepository {
    listAll(): Promise<Phrase[]>;
    search(q: PhraseQuery): Promise<Phrase[]>;
    getById(id: string): Promise<Phrase | null>;
}
