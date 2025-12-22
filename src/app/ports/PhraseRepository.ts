export type Phrase = {
  id: string;
  jp: string;
  en: string;
  tags: string[];        // ["同調","推測"] など
  scene?: string;        // "cafe" 等（任意）
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
