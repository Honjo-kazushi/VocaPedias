import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

export const FEEDBACK_PAGE_SIZE = 20;

export type FeedbackEntry = {
  id: string;
  nickname: string;
  message: string;
  createdAt: Timestamp | null;
};

export type FeedbackPage = {
  entries: FeedbackEntry[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
};

export async function submitFeedback(nickname: string, message: string): Promise<void> {
  await addDoc(collection(db, "feedback"), {
    nickname,
    message,
    createdAt: serverTimestamp(),
  });
}

export async function loadFeedbackPage(
  after: QueryDocumentSnapshot<DocumentData> | null = null,
): Promise<FeedbackPage> {
  const feedback = collection(db, "feedback");
  const pageQuery = after
    ? query(feedback, orderBy("createdAt", "desc"), startAfter(after), limit(FEEDBACK_PAGE_SIZE))
    : query(feedback, orderBy("createdAt", "desc"), limit(FEEDBACK_PAGE_SIZE));
  const snapshot = await getDocs(pageQuery);
  const entries = snapshot.docs.map((document) => {
    const data = document.data();
    return {
      id: document.id,
      nickname: typeof data.nickname === "string" ? data.nickname : "",
      message: typeof data.message === "string" ? data.message : "",
      createdAt: data.createdAt ?? null,
    };
  });
  return {
    entries,
    cursor: snapshot.docs.at(-1) ?? null,
    hasMore: snapshot.docs.length === FEEDBACK_PAGE_SIZE,
  };
}
