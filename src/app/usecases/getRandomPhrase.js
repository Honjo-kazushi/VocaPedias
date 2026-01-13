export async function getRandomPhrase(repo, q = {}) {
    const list = await repo.search(q);
    if (list.length === 0)
        return null;
    const idx = Math.floor(Math.random() * list.length);
    return list[idx];
}
