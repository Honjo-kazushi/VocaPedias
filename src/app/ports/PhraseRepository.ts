export type Phrase = {
  id: string;
  jp: string;
  en: string;
  tags: string[];        // ["同調","推測"] など
  tags2?: {
    main: string;
    sub: string;
  };
  meaningGroup?: string | null; // 同義束（Alt 展開の基点）
};

export type PhraseQuery = {
  keyword?: string;      // jp/en/tags を横断検索
  tags?: string[];       // AND想定（必要ならORに変更）
  scene?: string;
  limit?: number;
};

export interface PhraseRepository {
  listAll(): Promise<Phrase[]>;
  search(q: PhraseQuery): Promise<Phrase[]>;
  getById(id: string): Promise<Phrase | null>;
}
