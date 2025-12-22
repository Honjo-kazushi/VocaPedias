import type { PhraseRepository, PhraseQuery, Phrase } from "../ports/PhraseRepository";

export async function getRandomPhrase(
  repo: PhraseRepository,
  q: Omit<PhraseQuery, "limit"> = {}
): Promise<Phrase | null> {
  const list = await repo.search(q);
  if (list.length === 0) return null;
  const idx = Math.floor(Math.random() * list.length);
  return list[idx];
}
