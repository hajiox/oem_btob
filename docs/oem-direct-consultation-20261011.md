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

2026-10-11時点、CodexMTGで仕様調整を実施（e7a3cabe-c1be-4578-bd00-4deb45df3ce6）。本人投稿c1d9556c-734e-486f-9362-bf4f617b9a60と追加許可764580a6-5441-4feb-b5df-d5258417eaceを確認。TSA応答c8180084-366c-4706-8b2d-f2a48c3b83a7では、担当チャットへの送信経路なし・共有同期のGit所有者不一致・GitHub接続不可が報告され、TSG変更は未実施。担当PC開発チャットへの直接依頼が必要との回答。CEO_SではTSGコードを変更していない。

## 検証

- `verify-oem-consultation.cjs`: 実サーバー処理をmockし、商品未定、価格注入拒否、正規化、NULL価格、重複・競合・制限・送信先障害・DB障害を確認。外部送信なし。
- `verify-oem-consultation-db.cjs`: migration029と実DBの合成受付を全ROLLBACK。メール/outbox原子性、v2保留/有効claim、v1互換、一般ロールのRPC実行拒否、試作・注文・請求0件を確認。
- `verify-oem-consultation-admin-mail.cjs`: 未算定表示、メール、返信文、既存概算・請求状態の扱いを確認。
- 既存概算94経路、通知/cron mock、analytics23件、型チェック、production buildが成功。scoped ESLintは新規実装でエラーなし。変更ファイル全体では既存のany 3件と警告3件が残り、全体lint合格とは扱わない。
- Chromeで390×844、1280×900を確認。カレー/ラーメンCTAから商品引継ぎ、未定入口、必須エラー、概算フォームとUTM/テスト除外を確認。実問い合わせ・実顧客メール・請求は作成しない。

## 本番確認

実装コミット `1d07ea61ee789d94d7618dec19745e243d3f481f` をmainへpush。migration029を通常runnerでdry-run後に適用。Vercel `dpl_3eaha4qaa6vNmJFRjYFL8eWrmtA5`（`oem-d33umhibu-hajioxs-projects.vercel.app`）のREADY・同コミット・`oem.aizubrandhall.com` aliasを確認した。

公開 `/btob`、`/curry-oem`、`/ramen-oem`、`/btob/consult` はHTTP200、主CTAと特殊食材注記あり。通知cronは未認証401。Chromeで公開390pxのカレー/ラーメンCTA→商品引継ぎ、商品未定、必須エラー、PC1280px、既存概算フォームと一般相談リンクを確認。390pxのscrollWidth384px、PC1280pxのscrollWidth1274pxで横overflowなし。UTMとテスト除外マーカーを引き継ぎ、検証中のGoogleタグ読み込み0件を確認。実問い合わせは送信していない。

本番envメタデータでは従来の通知フラグは設定継続、新しい未算定通知フラグは未設定。従来の概算相談通知を維持し、直接相談v2は保留する。公開証跡は `output/oem-direct-consultation-20261011/public-*.png` と `public-http.json`（成果物はcommit対象外）。
