# OEM 直接相談・概算相談の行動計測（2026-10-11）

既存の詳細計測仕様は `docs/oem-detailed-analytics-20261010.md` を継承する。今回、直接相談ページ `/btob/consult` を対象に加え、相談区分を固定値で送信する。GA4・Google広告の管理設定は変更しない。

## 相談区分とイベント

フォーム・CTAのイベントに `inquiry_type` を追加する。許可値は `direct`（概算を経由しない直接相談）と `quote`（概算フォーム）の2つだけ。既存呼び出しの既定値は `quote`。ページビュー自体にはフォームの相談区分を付けず、クエリなしのページURLで到達を確認する。

| イベント | 直接相談での送信契機 |
| --- | --- |
| `oem_cta_click` | 直接相談へのCTA操作。`cta_location` は既存の固定値のみ |
| `oem_start_consultation` | 直接相談への進行。表示だけを実入力開始と扱わない |
| `oem_step_view` | 連絡先フォームまたは完了画面の表示 |
| `oem_form_start` / `oem_contact_start` | 最初の実入力・操作 |
| `oem_field_start` | 固定の項目区分ごとの最初の入力 |
| `oem_validation_error` | 必須未入力・連絡先不正などの固定エラー区分 |
| `oem_submit_attempt` | 送信試行。受付成功を意味しない |
| `oem_submit_error` | 受付失敗・通信失敗の固定エラー区分 |
| `generate_lead` | サーバーが受付成功を返した後だけ送信 |
| `oem_form_exit` | 実操作開始後、受付完了前の離脱シグナル |

`generate_lead` のみ従来の成果指標として維持する。マイクロイベントをキーイベントに変更しない。計測関数自体はサーバー受付を検証しないため、UIは `submitOemConsultation` の応答で `success` を確認した後にだけ呼ぶ。クリック、バリデーション通過、送信開始、受付失敗では呼ばない。

商品が未定の場合、直接相談の上記イベントは `product_id`・`product_name` を省略する。自由記述の商品名、仮の商品ID、相談文を代わりに送信しない。商品指定がある場合も、従来どおりカタログの固定ID・固定名だけを許可する。概算の開始・送信・受付成功は従来どおり商品ID必須とする。商品選択前の一般概算CTAだけは、`oem_cta_click` の商品省略を許可する。

## 呼び出し契約と重複排除

```ts
trackOemEvent('oem_start_consultation', productId, { inquiry_type: 'direct' })
trackOemInteraction('oem_contact_start', productId, {
    inquiry_type: 'direct', step_kind: 'contact',
})
// サーバー受付成功を確認した場合のみ。
trackOemEvent('generate_lead', productId, { inquiry_type: 'direct' })
```

`productId` は未定なら `undefined` / `null`。既存概算コードの呼び出し変更は不要。`OemInquiryType` / `OemEventDetails` を共通型として公開する。

重複排除キーに相談区分を含め、同じ商品でも直接相談と概算相談を別の行動として記録する。省略された `quote` と明示的な `quote` は同じキーになる。読み込み待ちの保留イベントにも固定区分を保存する。既存の1回限り・繰り返しイベントの扱い、保留200件、詳細重複排除2,048件は維持する。

## 流入情報と除外

対象URLは `oem.aizubrandhall.com` の `/btob`、`/btob/consult`、`/curry-oem`、`/ramen-oem`。管理画面や個別案件URLは対象に含めない。

`getOemNavigationSearch(search)` は内部リンク用に、既存の許可リスト内のUTMだけを先頭 `?` なしのクエリ文字列で返す。sourceとmediumが両方とも有効な場合のみ流入ラベルを保持し、任意のクエリ・クリックID・本文・個人情報をコピーしない。`utm_campaign=oem_tracking_test` は大小文字・重複を検出して単一の正規化したパラメータとして独立して引き継ぐ。テスト除外はURL単位のまま維持するため、対象ページ間のリンクはこのマーカーを保持する。

同WindowのSPA遷移では既存の許可キャンペーン保持を継続し、ページビューと詳細イベントのURL・参照元は安全な値だけにする。ホスト単位のlocalStorage社内除外、対象外ホスト・パスの送信禁止、除外中の保留データ破棄・解除後の再送禁止も維持する。

## 個人情報と集計上の境界

相談区分はランタイムでも許可リストで検証する。会社名、担当者名、メール、電話、相談本文、回答値、自由商品名、価格、エラー文面、受付ID、冪等キーは送らない。既存のGoogle Signals・広告パーソナライズ無効、広告consent deniedの設定を維持する。

GA4のイベントパラメータには `inquiry_type` を送るが、今回はGA4管理画面での新ディメンション登録を行っていない。区分別の探索・レポートを行うにはイベントスコープのカスタムディメンション `inquiry_type` の登録が後続作業となる。送信実装・ローカル検証を、本番GA4の受信確認や登録完了とは扱わない。広告のコンバージョン目標、予算、入札、配信設定の変更はない。

## 検証

計測ライブラリの自動テスト23件が成功。対象は既存計測回帰、direct/quoteの固定区分と重複排除、直接相談の未定商品、概算の必須商品維持、商品未定の一般概算CTA、PII排除、遅延読み込み、SPA流入保持、安全なリンククエリ、テスト・内部除外と保留破棄。

```powershell
npx tsc --outDir output/analytics-tests-20261011 --module commonjs --target ES2022 --lib 'ES2023,DOM' --esModuleInterop --skipLibCheck src/lib/oem-analytics.ts src/lib/oem-analytics.test.ts
node --test output/analytics-tests-20261011/oem-analytics.test.js
```

上記テストはWindow/gtagをメモリ上で置き換え、GA4への外部送信、実顧客データの使用、実問い合わせを行わない。全体の型・buildと画面確認は統合時に確認する。
