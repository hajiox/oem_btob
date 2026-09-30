# OEMメール要確認（第3段階）検証メモ — 2026-09-30

## 対象範囲

- 第3段階の要件は、新着（未読相当）と返信待ちを独立して扱うこと。確認済みマークは画面に表示した実メッセージUUIDだけを対象にする。
- 「返信済み」は、`reply_to_id` がある会話上の返信が `sent` になった場合だけ成立する。請求書・正式発注など `reply_to_id` のない送信は返信待ちを閉じない。
- 返信処理中の `pending` / `sending`、結果不明の `unknown`、失敗の `failed` は未解決のまま残す。返信成功後に同じ案件へ新着した受信メールは新しい未処理として残す。
- 手動確認は、その時点で表示したアンカーより古い受信メールのスナップショットだけを対象にする。再取込で `reviewed_*` / `handled_*` を消さない。
- Gmail同期はメールを送らず、同期リース・ページトークンを使う。匿名・通常認証ユーザーからのDB/RPC直接アクセスは禁止し、service roleだけを許可する。

## 追加した検証・デモ

- `scripts/verify-oem-mail-attention.cjs`：`sql/016_oem_mail_attention.sql` の構造、RLS/RPC権限、返信状態遷移、アンカーより古い受信のクローズ、新着の未処理維持、再取込時の確認状態保持、同期リースの競合と完了をトランザクション内で確認する。`--with-migration` 指定時だけ migration SQL を同一トランザクションへ読み込む。常に最後に `ROLLBACK` し、メール送信は行わない。
- `scripts/prepare-oem-attention-demo.cjs`：明示的な運用指示がある場合のみ実行する合成データ準備用。`DEMO-ATTENTION-20260930` 相当の識別情報、`【動作テスト・返信不要】新着・返信待ち確認`、`attention-demo@example.invalid`、案件タグ付きの合成 inbound 1件を再利用または作成する。キュー投入、銀行操作、顧客データ利用、メール送信は行わない。

## 検証証跡

- `node scripts/verify-oem-mail-attention.cjs --with-migration`：PASS。実RPCで50件レビュー上限、非プロビジョニング管理者・非OEM/別案件の拒否、返信成功/失敗/結果不明、返信中の新着保持、同時刻1001通のhandle、51案件以上のsummary/listページング、再取込保持、同期リース、service-only権限を検証。全テスト行はROLLBACK、メール送信なし。
- `node scripts/verify-oem-mail-sync.cjs`：PASS。実装を読み込むオフラインテストで案件番号/参加者の隔離、ページ継続、期間固定と24時間重複取得、再試行、期限切れページ、cron認証、管理API認証/同一origin/案件境界を確認。Gmail/DBはmock、送信なし。
- `node scripts/verify-oem-reply-snapshot.cjs`：PASS。実送信関数をmockで実行し、明示返信対象と返信ヘッダー、旧ハッシュ互換、冪等性、結果不明の再送禁止、別案件拒否を確認。
- Gmail client、conversation security、invoiceの既存検証はPASS。TypeScript・production buildはPASS。変更ファイルのESLintはエラー0、Dashboard既存ref cleanup警告1。
- 2026-09-30に016 additive migrationを本番へ適用。既存データ/権限を削除しない。
- 合成デモを準備：lead `85a1d291-071a-4ce1-9512-754090353380` / message `16fb1448-3634-463b-8f50-6b0dcbcf2450`。実顧客/実注文ではなく、キュー/銀行/メール送信は操作しない。

## 自動取得と運用

- Vercel既存Proプロジェクトで`/api/oem/mail/sync`を5分間隔のcronへ登録。production `CRON_SECRET`を秘密扱いで設定（ローカル保存/ログ出力なし）。画面を開いている間は60秒ごとに取得し、サーバー側リースと60秒間隔で重複実行を抑制する。
- 初回は案件番号付きの過去メール、以後は最後に完了した期間から24時間重複して取得。1回10スレッド、3並列。続きのquery/page tokenはDBに保存して次回継続し、上限で黙って打ち切らない。
- 画面の「未確認」はこの管理画面での確認状態でありGmailの既読とは別。「対応済み」は電話等で解決した場合にも使え、手動対応のみ戻せる。
- 実返信で返信待ちを閉じるのは成功保存時のみ。確認画面を作った時の受信アンカーを固定し、その後の新着を巻き込まない。履歴未取得の返信待ちがある場合は先に以前の会話を読み込ませる。
- 同期失敗は管理画面で表示し、続きから再試行する。メール接続が切れた場合の再認可は管理者が行う。

## 本番確認

- 実装commit `275b87f`、deployment `dpl_3N85x2p7mf55H8pyQwtX8pDqfgFa` はREADY、`oem.aizubrandhall.com` に反映済み。
- 通常Chrome連携で合成メールを開き、当該案件が「未確認1・返信待ち1」→「未確認0・返信待ち1」へ変化。「対応済み」でアラートから消え、会話には「対応済み」と手動で戻せるボタンが残ることを確認。
- DBで reviewed/handled/actor記録を確認。実返信済みにはしない（reply_closed_at未設定）。テスト前後の送信済み2通・pending1通は変化なし。既存の別案件は操作しない。
- 本番の未認証attention/cron GETは401。Vercel cron定義が5分間隔で有効。2026-09-30 17:40:32 JSTのdeploymentホストへのscheduled GETは200を確認（手動の未認証GETは17:37:55に401）。管理画面での実Gmail取得もエラーなし。
- 画面証跡：`output/mail-attention/01-reviewed-awaiting.png`、`02-handled.png`（ローカル出力、Git対象外）。

