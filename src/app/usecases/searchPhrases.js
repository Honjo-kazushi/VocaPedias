export async function searchPhrases(repo, q) {
    // A層で “検索の方針” を統一（UIに散らさない）
    const keyword = (q.keyword ?? "").trim();
    // repoがsearchを持つなら基本それを使用
    const results = await repo.search({
        ...q,
        keyword: keyword.length ? keyword : undefined,
    });
    // 例：limitの最終適用をA層で統一
    const limit = q.limit ?? 50;
    return results.slice(0, limit);
}
