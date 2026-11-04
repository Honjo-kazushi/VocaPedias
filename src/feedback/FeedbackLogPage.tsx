import { useEffect, useState, type FormEvent } from "react";
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  type User,
} from "firebase/auth";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { auth } from "../firebase";
import { loadFeedbackPage, type FeedbackEntry } from "./feedbackRepository";
import "./feedback.css";

type FeedbackLogPageProps = {
  onBack: () => void;
};

function formatJst(entry: FeedbackEntry): string {
  if (!entry.createdAt) return "送信時刻を処理中";
  return entry.createdAt.toDate().toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function FeedbackLogPage({ onBack }: FeedbackLogPageProps) {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setUser(nextUser);
    setAuthReady(true);
  }), []);

  useEffect(() => {
    if (!user) {
      setEntries([]);
      setCursor(null);
      setHasMore(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    loadFeedbackPage()
      .then((page) => {
        if (!active) return;
        setEntries(page.entries);
        setCursor(page.cursor);
        setHasMore(page.hasMore);
      })
      .catch((loadError) => {
        console.warn("feedback log loading failed", loadError);
        if (active) setError("ログを読み込めません。管理者UIDの登録とFirestore Rulesを確認してください。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [user]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setPassword("");
    } catch (loginError) {
      console.warn("administrator login failed", loginError);
      setError("ログインできませんでした。メールアドレスとパスワードを確認してください。");
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    setError("");
    try {
      const page = await loadFeedbackPage(cursor);
      setEntries((current) => [...current, ...page.entries]);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (loadError) {
      console.warn("additional feedback loading failed", loadError);
      setError("追加のログを読み込めませんでした。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="feedback-screen feedback-log-screen">
      <section className="feedback-card" aria-labelledby="feedback-log-title">
        <div className="feedback-log-header">
          <h1 id="feedback-log-title">ご意見ログ</h1>
          <button type="button" onClick={onBack}>設定へ戻る</button>
        </div>
        {!authReady ? (
          <p role="status">認証状態を確認中…</p>
        ) : !user ? (
          <form className="feedback-login" onSubmit={handleLogin}>
            <p>管理者としてログインしてください。認証状態はこのブラウザーに保持されます。</p>
            <label htmlFor="feedback-admin-email">メールアドレス</label>
            <input id="feedback-admin-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" />
            <label htmlFor="feedback-admin-password">パスワード</label>
            <input id="feedback-admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
            {error && <p className="feedback-error" role="alert">{error}</p>}
            <button type="submit" className="feedback-primary" disabled={loading}>{loading ? "ログイン中…" : "ログイン"}</button>
          </form>
        ) : (
          <div>
            {error && <p className="feedback-error" role="alert">{error}</p>}
            {loading && entries.length === 0 ? <p role="status">読み込み中…</p> : entries.length === 0 && !error ? <p>投稿はまだありません。</p> : null}
            <div className="feedback-log-list">
              {entries.map((entry) => (
                <article key={entry.id} className="feedback-log-entry">
                  <time>{formatJst(entry)}</time>
                  <h2>{entry.nickname}</h2>
                  <p>{entry.message}</p>
                </article>
              ))}
            </div>
            {hasMore && <button type="button" className="feedback-load-more" onClick={loadMore} disabled={loading}>{loading ? "読み込み中…" : "さらに20件読み込む"}</button>}
          </div>
        )}
      </section>
    </main>
  );
}
