import { useState, type FormEvent } from "react";
import { submitFeedback } from "./feedbackRepository";
import "./feedback.css";

type FeedbackPageProps = {
  onBack: () => void;
};

export default function FeedbackPage({ onBack }: FeedbackPageProps) {
  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    const trimmedNickname = nickname.trim();
    const trimmedMessage = message.trim();
    if (!trimmedNickname || !trimmedMessage) {
      setError("お名前・ニックネームと、ご意見・ご感想を入力してください。");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      await submitFeedback(trimmedNickname, trimmedMessage);
      setSubmitted(true);
    } catch (submitError) {
      console.warn("feedback submission failed", submitError);
      setError("送信できませんでした。通信状態を確認して、もう一度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="feedback-screen">
      <section className="feedback-card" aria-labelledby="feedback-title">
        <h1 id="feedback-title">ご意見・ご感想</h1>
        {submitted ? (
          <div className="feedback-success" role="status">
            <p>ご意見ありがとうございました。</p>
            <button type="button" className="feedback-primary" onClick={onBack}>トップメニューへ戻る</button>
          </div>
        ) : (
          <>
            <div className="feedback-intro">
              <p>TossaSpeakを使ってみた感想や改善してほしい点をお聞かせください。</p>
              <p>日本語・英語のどちらでも投稿できます。</p>
              <p lang="en">Please share your feedback or suggestions.</p>
            </div>
            <form onSubmit={handleSubmit}>
              <label htmlFor="feedback-nickname">お名前・ニックネーム</label>
              <input
                id="feedback-nickname"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                maxLength={50}
                required
                autoComplete="nickname"
                disabled={isSubmitting}
              />
              <small>{nickname.length}/50</small>

              <label htmlFor="feedback-message">ご意見・ご感想</label>
              <textarea
                id="feedback-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={2000}
                required
                rows={9}
                disabled={isSubmitting}
              />
              <small>{message.length}/2,000</small>

              {error && <p className="feedback-error" role="alert">{error}</p>}
              <div className="feedback-actions">
                <button type="submit" className="feedback-primary" disabled={isSubmitting}>
                  {isSubmitting ? "送信中…" : "送信する"}
                </button>
                <button type="button" onClick={onBack} disabled={isSubmitting}>戻る</button>
              </div>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
