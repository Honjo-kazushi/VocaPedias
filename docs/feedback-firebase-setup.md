# ご意見・ご感想機能 Firebase設定手順

この機能のコードには、管理者のメールアドレスやUIDを記載していません。管理者UIDはFirestoreの `feedbackAdmins` コレクションで管理します。

## 重要

リポジトリから現行本番のFirestore Security Rulesを確認できなかったため、`firebase.json` にはRulesファイルを登録していません。`firestore.feedback.rules.snippet` は完全なRulesではなく、既存Rulesへ手動で追加する断片です。そのままデプロイすると既存の `counters/vocapedias` などの権限を失う可能性があります。

## 1. メール・パスワード認証を有効化

1. Firebase Consoleで `tossaspeak` プロジェクトを開く。
2. **Authentication → Sign-in method** を開く。
3. **Email/Password** を有効にする。

## 2. 管理者アカウントを作成

1. **Authentication → Users → Add user** を開く。
2. 管理者用メールアドレスと十分に強いパスワードを登録する。
3. 作成されたユーザーの **UID** をコピーする。

## 3. 管理者UIDを許可リストへ登録

1. **Firestore Database → Data** を開く。
2. `feedbackAdmins` コレクションを作成する。
3. ドキュメントIDに、手順2でコピーしたUIDをそのまま指定する。
4. Firebase Consoleの都合でフィールドが必要な場合は、`enabled`（boolean）を `true` で追加する。Rulesはドキュメントの存在だけを確認する。

管理者を無効化するときは、対応する `feedbackAdmins/{uid}` ドキュメントを削除します。

## 4. Security Rulesをマージ

1. Firebase Consoleで現在のFirestore Rules全体を取得し、別途バックアップする。
2. `firestore.feedback.rules.snippet` の関数と2つの `match` ブロックを、既存の `match /databases/{database}/documents` の内側へ追加する。
3. 既存の `counters/vocapedias` 用Rulesを残す。
   - 既存Rulesに `match /{document=**}` と `allow read, write: if true` のような全公開ルールがある場合、個別の拒否ルールを追加しても保護できません。Firestore Rulesの許可条件は、いずれか1つが成立すると許可されるためです。
   - 全公開ルールがある場合は公開前に停止し、`counters/vocapedias` の必要な操作だけを明示的に許可するルールへ安全に分割してください。現行Rulesを確認せず、その変更を推測で行わないでください。
4. Rules PlaygroundまたはEmulatorで次を確認する。
   - 未認証ユーザーは、仕様どおりの `feedback` ドキュメントだけ作成できる。
   - 未認証ユーザーは `feedback` を読み取れない。
   - `feedbackAdmins/{uid}` に登録した認証ユーザーだけ `feedback` を読める。
   - 誰もクライアントから `feedback` を更新・削除できない。
   - 既存アクセスカウンターが従来どおり動作する。
5. 確認後にFirebase ConsoleからRulesを公開する。

## 5. 初回ログイン

1. アプリの設定で、従来どおり開発者モードを900ms長押ししてONにする。
2. 表示された「ご意見ログ」を5秒間長押しする。
3. 管理者メールアドレスとパスワードでログインする。

Firebase Authのローカル永続化を明示しているため、同じブラウザーでは通常、次回からログイン画面を省略します。プライベートブラウズ、サイトデータ消去、認証トークン無効化などの場合は再ログインが必要です。
