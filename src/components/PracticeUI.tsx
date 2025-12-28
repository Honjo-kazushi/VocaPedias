import { useMemo, useState } from "react";
import type { Phrase } from "../../app/ports/PhraseRepository";

type MainTag = "会話" | "感情" | "状態" | "行動" | "判断" | "その他";

type Props = {
  main: MainTag;        // コンボで選ばれた A–F
  phrases: Phrase[];   // PHRASES_SEED 全体
};

const SUB_TAGS: Record<MainTag, string[]> = {
  会話: ["確認", "質問", "依頼", "応答", "提案"],
  感情: ["喜", "怒", "哀", "驚", "共"],
  状態: ["体調", "状況", "進行", "環境", "能力"],
  行動: ["依頼", "提案", "指示", "制止", "申し出", "拒否"],
  判断: ["同意", "否定", "保留", "許可", "評価", "予測"],
  その他: ["前置", "反応", "教訓", "説明"],
};

export function PracticeUI({ main, phrases }: Props) {
  const subTags = SUB_TAGS[main];

  // デフォ：先頭サブタグ
  const [sub, setSub] = useState(subTags[0]);

  const list = useMemo(() => {
    return phrases.filter(
      (p) => p.tags2?.main === main && p.tags2?.sub === sub
    );
  }, [phrases, main, sub]);

  return (
    <div className="practice-root">
      {/* サブタグ */}
      <div className="practice-subtags">
        {subTags.map((s) => (
          <button
            key={s}
            className={s === sub ? "active" : ""}
            onClick={() => setSub(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {/* フレーズ一覧 */}
      <div className="practice-list">
        {list.map((p) => (
          <div key={p.id} className="practice-item">
            <div className="jp">{p.jp}</div>
            <div className="en">{p.en}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
