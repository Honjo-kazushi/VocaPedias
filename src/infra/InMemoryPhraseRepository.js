export class InMemoryPhraseRepository {
    phrases;
    constructor(phrases) {
        this.phrases = phrases;
    }
    async listAll() {
        return this.phrases;
    }
    async getById(id) {
        return this.phrases.find(p => p.id === id) ?? null;
    }
    async search(q) {
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
