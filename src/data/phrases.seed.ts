// src/data/phrases.seed.ts
import type { Phrase } from "../app/ports/PhraseRepository";

export const PHRASES_SEED: Phrase[] = [
  // 同意
  { id: "a1", jp: "いいですね", en: "That sounds good.", tags: ["同意"] },
  { id: "a2", jp: "それで大丈夫です", en: "I'm fine with that.", tags: ["同意"] },
  { id: "a3", jp: "同じ意見ですね", en: "I agree with you.", tags: ["同意"] },
  { id: "a4", jp: "同じ考えだね", en: "We're on the same page.", tags: ["同意"] },
  
  // 否定
  { id: "n1", jp: "そうは思いません", en: "I don't think so.", tags: ["否定"] },
  { id: "n2", jp: "それは難しいです", en: "That would be difficult.", tags: ["否定"] },

  // 保留
  { id: "h1", jp: "少し考えさせてください", en: "Let me think about it.", tags: ["保留"] },
  { id: "h2", jp: "あとで返事します", en: "I'll get back to you later.", tags: ["保留"] },

  // 確認
  { id: "c1", jp: "こういう意味ですか？", en: "Do you mean this?", tags: ["確認"] },
  { id: "c2", jp: "つまり、こういうことですか？", en: "So, you mean this?", tags: ["確認"] },
  { id: "c3", jp: "どう書くの？", en: "How do you spell it?", tags: ["確認"] },
  
  // 終了
  { id: "e1", jp: "今のところ以上です", en: "That's all for now.", tags: ["終了"] },
  { id: "e2", jp: "また後で話しましょう", en: "Let's talk later.", tags: ["終了"] },

  // 感情
  { id: "f1", jp: "それは安心しました", en: "That's a relief.", tags: ["感情"] },
  { id: "f2", jp: "それは残念です", en: "That's too bad.", tags: ["感情"] },

  // 配慮
  { id: "p1", jp: "ここだけの話だけど", en: "Between you and me.", tags: ["配慮"] },
  { id: "p2", jp: "このことは内緒にして", en: "Keep this to yourself.", tags: ["配慮"] },
  { id: "p3", jp: "頼りにしてるよ", en: "I'm counting on you.", tags: ["期待"] },
  { id: "p4", jp: "問題ないよ", en: "That's nothing.", tags: ["安心"] },

  { id: "r1", jp: "ただ、ありのままでいて", en: "Just be yourself", tags: ["安心"] },
  { id: "r2", jp: "年の割には若いね", en: "For your age,you look young.", tags: ["評価"] },
  { id: "r3", jp: "ちょっと見て", en: "Take a look.", tags: ["注意"] },
  { id: "r4", jp: "私の知る限りでは", en: "As far as I know,", tags: ["前置き"] },
  { id: "r5", jp: "待たせて、ごめん", en: "Sorry for the wait.", tags: ["謝罪"] },
  { id: "r6", jp: "あなたらしい", en: "That's so you.", tags: ["評価"] },
  { id: "r7", jp: "そうだといいね", en: "I hope so.", tags: ["期待"] },
  { id: "r8", jp: "ちょっと通して", en: "Let me through.", tags: ["依頼"] },
  { id: "r9", jp: "彼となんか別れちゃえ", en: "Maybe you should break up with him.", tags: ["助言"] },
  { id: "r10", jp: "正直に言うと", en: "To tell the truth,", tags: ["前置き"] },
  { id: "a5", jp: "もちろん", en: "Sure thing.", tags: ["同意", "快諾"] },
  { id: "t1", jp: "考え込む", en: "I get lost in thought.", tags: ["思考", "状態"]},
  { id: "r10-1", jp: "正直に言うとね", en: "To be honest,", tags: ["前置き"] },
  { id: "r10-2", jp: "はっきりさせたいんだけど", en: "Just to be clear,", tags: ["前置き"] },
  { id: "r6-1", jp: "それは筋が通ってるね", en: "That makes sense.", tags: ["評価"] },
  { id: "r6-2", jp: "悪くないと思う", en: "That sounds reasonable.", tags: ["評価"] },
  { id: "r8-1", jp: "ちょっとお願いしてもいい？", en: "Could you do me a favor?", tags: ["依頼"] },
  { id: "r8-2", jp: "見てもらえる？", en: "Could you take a look?", tags: ["依頼"] },
  { id: "r9-1", jp: "そうしたほうがいいと思う", en: "You might want to do it.", tags: ["助言"] },
  { id: "r9-2", jp: "私ならそうするかな", en: "If I were you, I'd do it.", tags: ["助言"] }
];
