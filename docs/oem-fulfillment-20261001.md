# ④ 製造・発送管理（2026-10-01）

## 実装範囲

- 管理画面の正式発注に、予定数量・単位・製造完了予定日・出荷予定日・メモを追加。
- 前金入金確認後に製造開始、完成数量・完成日・最終金額を入力して製造完了。
- 最終金額は既存請求書と同じ税別。数量の変更による自動比例計算はしない。
- 全額入金確認後のみ、出荷日・配送会社／受渡方法・任意の追跡番号を記録して出荷済みへ進める。
- 出荷予定超過、製造予定超過、計画未設定、出荷待ちをダッシュボードで表示。
- `balance_due` / `paid` の既存案件は、価格や注文状態を変更せず完成数量・日付を追加できる。
- 出荷済み／キャンセル済みは編集不可。完成後は予定数量・単位を変更不可。

## 整合性・権限

- SQL017追加テーブルはRLS有効・service_roleのみ。
- 全更新は管理者・OEM案件範囲・入力・versionを確認する単一RPC。
- 注文行／製造行ロックと楽観的versionチェック。更新・工程変更・監査イベントは同一トランザクション。
- 既存の入金証跡ゲートは維持。旧汎用工程更新アクションからの製造・出荷変更は拒否。
- 監査イベントに製造情報と注文状態・最終金額の前後値を記録。
- 実施者UUIDを記録し、期限判定・実績日判定は日本時間。
- 不明な更新結果は成功扱いせず再読み込みを促す。メール送信・配送業者への発送依頼は行わない。

## 検証

- `npm run build`、変更対象のESLint、`git diff --check`。
- `node scripts/verify-oem-fulfillment-boundaries.cjs`：入力・JST・認証・他案件・過剰指定・更新番号・未知結果（完全オフライン）。
- `node scripts/verify-oem-fulfillment.cjs --with-migration`：本番DB上のBEGIN/ROLLBACK内で追加DDLを検証。永続データ変更なし。
- 適用後：fulfillment / payments / invoices / orders / mail-attentionの回帰検証。すべてテスト行をROLLBACK、メールなし。
- SQL017は`node scripts/oem-db-migrate.cjs 017_oem_fulfillment.sql --apply`で追加適用済み。

## 実画面テスト案件

- `DEMO-FULFILLMENT-20261001`
- 会社名：`【動作テスト・支払不要】製造・発送確認`
- 宛先：`fulfillment-demo@example.invalid`。実取引・実同意・実銀行入金・メール送信なし。
- `scripts/prepare-oem-fulfillment-demo.cjs`はこの架空案件のみを作成。既存の場合は再利用。
- `--prepare-paid`は正確な注文番号・会社・宛先・OEMページ一致を確認し、製造完了後に架空残金入金を記録するテスト専用処理。
- 実画面検証結果は本番反映後に追記。

## 次段階

⑤変更・キャンセル精算、⑥定型文・AI返信案は今回の範囲外。
