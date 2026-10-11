# OEM 直接相談（2026-10-11）

商品・包装・数量を決める前に相談できる `/btob/consult` を追加。カレー・ラーメンLPと総合LPは「商品づくりを相談する」を主導線、「概算費用を確認する」を副導線にした。専用LPの商品を引き継ぎ、一般入口では商品未定を許可する。390pxでは画像より先に主CTAとロット目安が表示される。

必須は会社名・農園名・屋号（個人名も可）、名前、メール、固定選択の相談テーマ。電話・商品・補足は任意。現行の初回試作5,000円（税別・税込5,500円）、2回まで、特殊食材別見積、通常3回の支払い、試作のみ終了可の条件を維持する。

## 受付・既存機能との境界

- 独立した `submitOemConsultation` が連絡先・商品・テーマ・冪等キーを検証。価格やBTO回答をクライアントから受け取らない。
- migration029により `leads.intake_kind=consultation`、`consultation_theme`、`estimated_total_price=NULL` を保存。概算経由の既存受付は `quote` と数値価格を維持する。
- 受付・メール2通・TSG outboxは既存の制限付きRPCで同一トランザクションに保存。送信先障害は受付失敗とせず、同一キー・同一内容で再送する。
- 管理画面・受付メール・返信候補は「相談のみ・見積未算定」と表示。0円見積に変換しない。試作・承認・請求・注文は自動作成しない。条件確認後の既存管理操作・権限は維持する。
- GA4に固定値 `inquiry_type=direct|quote` を追加。サーバー成功時だけ `generate_lead`。PII・本文・回答・価格を送らず、UTM許可リスト・社内/テスト除外を維持する。詳細は `oem-detailed-analytics-20261011.md`。GA4側カスタムディメンション登録と実相談の受信確認は未実施。広告設定は変更しない。

## TSG v2の有効化条件

既存9項目のv1は数値価格のまま。直接相談だけ `schemaVersion=2,estimatedTotalPrice=null,quantityLabel=未定（相談のみ）` とする。sourceKeyは従来形式を維持し、受付後のpayload変更・別キー発行はしない。

`OEM_TSG_UNESTIMATED_NOTIFICATIONS_ENABLED=true` の場合だけ新RPC `claim_oem_tsg_notification_batch(uuid,boolean)` でv2をclaimする。未設定・falseおよび旧workerはv1のみ処理し、v2を永続pendingに保持する。TSG担当PC TSAによる受信APIの後方互換対応と本番確認後に限り有効化する。従来の `OEM_TSG_NOTIFICATIONS_ENABLED`、専用secret、固定フロア、lease/CAS、cron認証は維持する。

2026-10-11時点、CodexMTGで仕様調整を実施（e7a3cabe-c1be-4578-bd00-4deb45df3ce6）。本人投稿c1d9556c-734e-486f-9362-bf4f617b9a60は確認済みだが、TSA応答47015dd5-ab3f-44a0-b5e2-5f93a6906b75では担当開発チャットへの人間の直接依頼が必要とされ、TSG変更は未実施。CEO_SではTSGコードを変更していない。

## 検証

- `verify-oem-consultation.cjs`: 実サーバー処理をmockし、商品未定、価格注入拒否、正規化、NULL価格、重複・競合・制限・送信先障害・DB障害を確認。外部送信なし。
- `verify-oem-consultation-db.cjs`: migration029と実DBの合成受付を全ROLLBACK。メール/outbox原子性、v2保留/有効claim、v1互換、一般ロールのRPC実行拒否、試作・注文・請求0件を確認。
- `verify-oem-consultation-admin-mail.cjs`: 未算定表示、メール、返信文、既存概算・請求状態の扱いを確認。
- 既存概算94経路、通知/cron mock、analytics23件、型チェック、production buildが成功。scoped ESLintは新規実装でエラーなし。変更ファイル全体では既存のany 3件と警告3件が残り、全体lint合格とは扱わない。
- Chromeで390×844、1280×900を確認。カレー/ラーメンCTAから商品引継ぎ、未定入口、必須エラー、概算フォームとUTM/テスト除外を確認。実問い合わせ・実顧客メール・請求は作成しない。

本番反映・公開画面の確認結果は反映後に追記する。
