import type { ChatMessage } from "./conversationTypes";
import type { TalkTopic } from "../data/talkTopics.seed";
import { formatConversation } from "./buildConversationPrompt";
import type { Phrase } from "../app/ports/PhraseRepository";
import type { SceneSituation } from "../data/sceneRoleplays";

export type SceneReviewContext = {
  situation: SceneSituation;
  usefulPhrases: readonly Phrase[];
};

export function buildReviewPrompt(messages: ChatMessage[], scene?: SceneReviewContext): string {
  const learnerSentences = messages
    .filter((message) => message.role === "user")
    .map((message, index) => `${index + 1}. ${message.content}`)
    .join("\n");
  const sceneReviewInstruction = scene
    ? `\nSCENE ROLE-PLAY CONTEXT:
Scene: ${scene.situation.sceneTitle} — ${scene.situation.title}
Goal: ${scene.situation.goal}
Existing useful phrase candidates:
${scene.usefulPhrases.slice(0, 4).map((phrase) => `- ${phrase.en}`).join("\n")}

For this scene review, keep the same headings and concise format. In 「今日よく使えた英語」, prefer a practical expression the learner actually used. In 「こんな言い方もできる」, recommend at most one candidate above only when it fits what the learner tried to do; otherwise give one natural scene-specific alternative. Useful phrases are suggestions, never required answers.\n`
    : "";

  return `You are reviewing a spoken English conversation lesson for a Japanese beginner-to-intermediate learner.

The authoritative list below contains SpeechRecognition transcripts of the learner's turns. It is authoritative only for what the app recorded, not proof that every recognized word is what the learner actually pronounced. When showing the recorded learner statement, copy the complete statement exactly, character for character. Never silently repair a pronoun, verb, article, punctuation mark, or any other part of it. Do not quote fragments as learner statements. Do not attribute Partner text or a corrected sentence to the learner.

AUTHORITATIVE LEARNER STATEMENTS:
${learnerSentences}
${sceneReviewInstruction}

Return one valid JSON object with exactly these fields:
{
  "detailedReview": "the display review as one Markdown string",
  "spokenReview": [
    { "lang": "ja-JP", "text": "a spoken Japanese segment" },
    { "lang": "en-US", "text": "the single English example" }
  ]
}

Do not wrap the JSON in Markdown fences. Escape newlines inside detailedReview correctly. The detailedReview is shown on screen; spokenReview alone is spoken by Emma.

For detailedReview, use Japanese and these exact section headings:

Be concise. Select no more than 3 points in the entire review: at most one Good, one Better, and one Try/another way. Each point must be one short sentence apart from the quoted learner statement and correction example. Never show the same learner statement in more than one section, repeat the user's sentences unnecessarily, review every turn, or repeat the same underlying issue. Prioritize one useful correction over many minor corrections. Do not explain basic grammar unless necessary. If the conversation was already natural, use only 1 or 2 points. Write no introduction, conclusion, general praise, score, or rank.

Speech recognition guidance:
- When the transcript is odd but the surrounding conversation makes a likely intended phrase clear, consider both speech-recognition error and learner error.
- You may suggest the likely intended phrase, but say 「音声認識の可能性があります」 or 「〜と言いたかった可能性があります」 when the evidence is not certain.
- Never state with certainty which word the learner pronounced when the transcript and context do not establish it.
- If the intended meaning is unclear, do not invent a correction. Briefly explain the uncertainty or omit that item.

## 今日よく使えた英語
Choose at most 1 statement. It must already be grammatically correct or nearly correct, natural in conversation, and safe to reuse without substantial correction. Being understandable is not sufficient.
If one statement meets this standard, use only:
あなた：（copy one exact complete statement from the authoritative list）
よかった点：（one short Japanese sentence）
If none meet this standard, write exactly 「今回はありませんでした。」 and nothing else in this section. Do not lower the standard to fill it.

## ここを直そう
Choose at most 1 high-value correction from the whole conversation. Prioritize clear grammar or word-usage errors and expressions that make the intended meaning difficult to understand. Ignore minor mistakes that are not useful enough for this short review. If the transcript may reflect speech-recognition error, briefly express that uncertainty instead of claiming the learner definitely used the recognized word. Use exactly this format:
あなた：（copy one exact complete statement from the authoritative list）
修正例：（simple, natural English that preserves the likely intended meaning）
ポイント：（one short, natural Japanese sentence; no detailed grammar lecture）
If there are no important corrections, write exactly 「今回はありませんでした。」.

Rules for each ポイント:
- Explain the specific problem in the recorded statement before giving a general grammar rule.
- Make the explanation correspond exactly to both the recorded statement and the 修正例. Do not explain a different issue merely because it is related.
- Tell the learner what was unnecessary, missing, wrongly ordered, or hard to understand, and then briefly say how the correction fixes it.
- Do not end with only a generic comment such as 「現在形を使います」, 「語順に注意します」, or 「自然です」.
- Prefer plain teacher-like Japanese over translated linguistic terminology. Avoid difficult grammar terms unless they make the correction clearer.
- If several words are problematic, prioritize the one or two changes that matter most. Do not turn the point into a full sentence analysis.
- When the transcript itself may be wrong, use cautious wording such as 「音声認識の可能性があります」 or 「〜と言いたかった可能性があります」 instead of asserting what the learner said.

Good explanation examples:
- For 「almost I usually what's the news program」 → 「I usually watch news programs.」, explain first that almost and usually do not need to be used together, then show that 「普段ニュース番組を見ます」 is expressed with the corrected sentence.
- For 「I enjoyed what's the TV show and enjoy」 → 「I usually enjoy watching TV shows.」, explain that the wording and order were unclear, and connect the corrected sentence directly to the likely meaning 「普段テレビ番組を見るのが好きです」. Do not claim that verb tense alone was the main problem.

## こんな言い方もできる
Give at most 1 simple, natural English expression related to something the learner tried to communicate in this conversation. It should be immediately useful in the learner's next conversation. Preserve the learner's intended meaning, including negation, contrast, people involved, and degree of certainty. Do not add a new claim or make the English advanced.
Use only:
別表現：（one concise English sentence）
If no intended meaning can be identified confidently, write exactly 「今回はありませんでした。」.

Keep every explanation brief, concrete, and natural for a Japanese beginner-to-intermediate learner. The learner should understand both why the original needs correction and what to change. Use A2-B1 English. Do not produce an exhaustive correction report. Do not add extra headings or repeat content between sections.

spokenReview rules:
- It is a short, natural comment spoken directly to the learner by Emma after the lesson. Do not copy or read the detailedReview as a report.
- Start with one specific positive observation grounded in this conversation, such as communicating an idea, answering a question, or describing an experience. Do not use generic praise alone.
- Mention only the single most useful improvement. Explain it briefly in friendly, conversational Japanese without a grammar lecture.
- Include at most one simple, natural English example that demonstrates that improvement or the learner's likely intended meaning.
- Put each continuous Japanese passage in a separate {"lang":"ja-JP","text":"..."} item and the English example in one {"lang":"en-US","text":"..."} item. Use at most 4 items total: positive Japanese, improvement Japanese, English example, and an optional short Japanese closing.
- Never say 「音声認識」, 「STT」, 「認識結果」, or discuss the app's internal system. If a suspicious transcript has a likely meaning in context, respond to that likely meaning naturally. If its intent is unclear, exclude it from spokenReview.
- Do not assert that a suspicious recognized word is what the learner actually said.
- Keep the complete spokenReview, including the English example, suitable for about 20 to 30 seconds of speech. Prefer about 80 to 140 Japanese characters plus one concise English sentence. Never repeat a point in different words.
- Use spoken teacher language such as 「〜できていましたよ」「ここは〜すると分かりやすいですね」「こんな感じで大丈夫ですよ」. Avoid report labels, bullet-like wording, long explanations, and mechanical phrasing.
- spokenReview must contain at least one ja-JP item. When a confident useful English example exists, include exactly one en-US item.

Conversation:
${formatConversation(messages)}`;
}

export function buildJapaneseConversationReviewPrompt(messages: ChatMessage[], topic: TalkTopic): string {
  return `Miyabiとの日本語の雑談を、Emmaがユーザーへごく短く振り返ります。これは英語学習のReviewではありません。

次のJSONオブジェクトだけを返してください。Markdownコードフェンスは付けません。
{
  "detailedReview": "画面表示用のMarkdown文字列",
  "spokenReview": [
    { "lang": "ja-JP", "text": "Emmaが話す自然な日本語" }
  ]
}

detailedReviewの見出しは正確に「## 今日のポイント」だけを使ってください。その下は最大3項目、各項目1文までにしてください。「👍 よかった」「✏️ より自然に」「💡 別の言い方」から必要なものだけを使い、問題が少なければ1〜2項目で終えてください。同じ内容を言い換えて繰り返さず、長い説明や会話にない内容を加えないでください。

spokenReviewはEmmaからユーザーへ直接話す、自然で温かい日本語にしてください。会話の具体的な内容を1つだけ振り返り、1項目、約15〜20秒に収めます。長い解説や繰り返しは避けてください。

禁止事項:
- 文法訂正、発音指導、英語への言い換え、英語例文
- 採点、評価、ランク
- ユーザーの発言を批評すること
- Miyabiになりきること（Review担当はEmma）

内部のTopic: ${topic.title}

会話:
${formatConversation(messages)}`;
}
