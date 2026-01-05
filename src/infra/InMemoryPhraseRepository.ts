import type { PhraseRepository, Phrase, PhraseQuery } from "../app/ports/PhraseRepository";

export class InMemoryPhraseRepository implements PhraseRepository {
  private phrases: Phrase[];

  constructor(phrases: Phrase[]) {
    this.phrases = phrases;
  }
  async listAll(): Promise<Phrase[]> {
    return this.phrases;
  }

  async getById(id: string): Promise<Phrase | null> {
    return this.phrases.find(p => p.id === id) ?? null;
  }

  async search(q: PhraseQuery): Promise<Phrase[]> {
    const kw = (q.keyword ?? "").trim().toLowerCase();
    const tags = q.tags ?? [];

    return this.phrases.filter(p => {
      const hay = `${p.jp} ${p.en} ${p.tags.join(" ")}`.toLowerCase();
      const okKw = kw ? hay.includes(kw) : true;
      const okTags = tags.length ? tags.every(t => p.tags.includes(t)) : true;
      return okKw && okTags;
    });
  }
}
