# OEM 詳細行動計測（2026-10-10）

対象は `oem.aizubrandhall.com` の `/btob`、`/curry-oem`、`/ramen-oem`。GA4 プロパティは **555029617**。フォームの価格計算、分岐、入力検証、送信条件は変えず、行動の固定メタデータを追加する。

## イベント

| イベント | 記録する行動・状態 |
| --- | --- |
| `page_view` | 初回表示と対象ページ間の SPA 遷移。同じ URL の連続送信を抑止 |
| `oem_select_product` | 商品選択。URL による初期商品指定も含む（既存） |
| `oem_view_quote` | 概算結果の表示（既存） |
| `oem_start_consultation` | 概算から相談フォームへの進行（既存） |
| `generate_lead` | 問い合わせ送信の成功（既存） |
| `oem_form_start` | 商品選択・回答変更・連絡先入力など、最初の実操作 |
| `oem_step_view` | 商品選択、質問、概算、連絡先、完了の各画面の表示 |
| `oem_answer` | 質問への最初の入力・選択変更。回答内容や完了判定は含まない |
| `oem_step_back` | フォームの「戻る」操作 |
| `oem_contact_start` | 連絡先フォームの最初の入力 |
| `oem_field_start` | 連絡先の項目ごとの最初の入力 |
| `oem_validation_error` | 必須未入力、連絡先不正、対応不可などの固定分類 |
| `oem_submit_attempt` | 送信ボタン、通常の Enter、ブラウザー検証、submit による送信試行 |
| `oem_submit_error` | サーバー側失敗または通信エラーの固定分類 |
| `oem_form_exit` | 操作開始後、未完了フォームからの離脱シグナル |
| `oem_cta_click` | カレー・ラーメン LP の上部／下部の概算 CTA |
| `oem_scroll` | 実際のスクロールで 25・50・75・90% に到達 |

マイクロイベントはキーイベントにしない。実問い合わせ成功の **`generate_lead` のみ**従来どおりキーイベントとして扱う。

## パラメータと GA4 登録

商品はカタログ内の固定 `product_id`・`product_name`。詳細イベントには必要な項目だけを付ける。

| パラメータ | 内容 |
| --- | --- |
| `step_kind` | `product` / `question` / `quote` / `contact` / `complete` |
| `step_id`・`question_id` | 質問設定の UUID。表示文言は送らない |
| `step_index` | 商品選択を 0 とする画面位置（0〜100） |
| `field_name` | `company_name` / `contact_name` / `email` / `phone` / `notes` / `desired_product` |
| `input_type` | 固定の入力種別。選択＋追加入力は別種別で識別 |
| `action` | `select` / `change` / `clear` / `next` / `back` の許可値のみ |
| `error_type` | `required` / `invalid_contact` / `submission_failed` / `network` / `unavailable` |
| `cta_location` | 固定の配置識別子。現在の LP は `hero` / `footer` |
| `scroll_percent` | 25 / 50 / 75 / 90 |
| `elapsed_seconds` | 最初の実操作から離脱シグナルまでの秒数（0〜86,400） |

既存の商品 2 項目に加え、`step_kind`、`step_id`、`step_index`、`question_id`、`field_name`、`input_type`、`action`、`error_type`、`cta_location`、`scroll_percent` の **10 項目はイベントスコープのカスタムディメンション登録済み**。`elapsed_seconds` は「OEM入力開始からの経過秒」としてカスタム指標（Time・秒）を登録済み。一覧の12ディメンションと1指標を実画面で確認した。

GA4 の「探索」で行に商品名・到達段階・質問ID・入力欄、値に総ユーザー数・イベント数を置き、イベント名とセッションのキャンペーンで絞り込める。ユーザー数で到達人数、イベント数で戻る・エラーなどの発生回数を確認する。質問IDはフォーム設定の質問と照合する。初回のみのイベントで再編集回数を数えない。

新しい定義は通常24〜48時間で探索などに利用可能になる（[Google公式](https://support.google.com/analytics/answer/14240153?hl=en-EN)）。過去に記録していなかった操作は復元できない。

## 重複排除と集計の解釈

- 同じ Window 内で、既存 4 イベントはイベント名＋商品ごとに 1 回。詳細イベントとは別に重複排除を管理する。
- フォーム開始・連絡先開始は商品ごと、項目入力開始は商品＋項目ごと、回答は商品＋質問＋入力種別ごとに初回のみ。同じ質問を再編集しても回答数は増えない。
- 画面表示は安定した設定 ID を優先し、画面順の変更や React の再実行による二重計測を抑止する。戻って再表示した回数の集計には使わない。
- 「戻る」、検証エラー、送信試行、送信エラー、離脱シグナルは繰り返しを記録する。クリック・検証・submit が同じ操作内で発生しても送信試行は 1 回にまとめ、日本語 IME の確定 Enter は除く。
- 読み込み中の行動は安全なページ情報とともに一時保持する。保留は直近 200 件、詳細イベントの重複排除は最大 2,048 件。恒久的な操作履歴ではない。

`oem_form_exit` はページ非表示、`pagehide`、フォームのアンマウントで送信を試みる。未操作・送信成功後は送らず、同じ非表示中の重複を抑え、復帰後の再離脱は記録する。タブ切り替えや復帰も含むため、**離脱シグナル数を確定した放棄件数としない**。途中離脱は開始・画面到達と、その後の `generate_lead` の有無をあわせて解釈する。秒数は経過時間であり、実際の入力作業時間ではない。

## 個人情報を送らない境界・除外

ランタイムの許可リストで、UUID・固定列挙値・範囲内の数値だけを採用する。会社名、担当者名、メール、電話、備考、作りたい商品の自由記述、回答値、選択肢ラベル、価格、エラー文面、受付 ID・冪等キーは送信しない。

`page_location` は origin＋pathname のみで、クエリとハッシュを除く。外部参照元は origin のみ、同一ホストの対象 3 ページだけ pathname を許可する。任意の UTM、検索語、`gclid` 等のクリック ID、クエリ全体は送らない。Google Signals と広告パーソナライズを無効にし、広告関連の consent は denied とする。

`utm_campaign=oem_tracking_test` はテスト除外（大小文字を区別せず、同名パラメータが複数でも検出）。社内除外はホスト単位の localStorage `oem_analytics_internal_v1=1`。除外中はタグ初期導入・イベント・ページビューを抑止し、保留データを破棄して解除後に再送しない。対象外ホスト・対象外パスも送信しない。

## P-MAX とページ遷移の修正

許可キャンペーンに **`oem_pmax_fukushima`**、許可コンテンツに `curry`・`ramen` を追加した。`utm_source=google&utm_medium=cpc&utm_campaign=oem_pmax_fukushima&utm_content=curry` などの承認済みラベルを GA4 の `campaign_source`・`campaign_medium`・`campaign_name`・`campaign_content` に変換する。source と medium の両方が許可値である場合のみ適用する。

同じ Window 内の LP → `/btob` の SPA 遷移でも承認済み流入情報を保持する。各ページビューはクエリなしの現在 URL・安全な参照元で更新し、遅延読み込み中に発生した詳細イベントには発生時点の URL・参照元・キャンペーンを明示する。

## 検証と参照コード

参照: `src/lib/oem-analytics.ts`、`src/components/OemAnalytics.tsx`、`src/components/OemTrackedQuoteLink.tsx`、`src/components/InteractiveForm.tsx`。自動テストは `src/lib/oem-analytics.test.ts`（許可値、個人情報除外、重複排除、読み込み待ち、SPA、P-MAX、テスト／社内除外）。

- 自動テスト17件、TypeScript型チェック、build、変更対象の計測/LPファイルのESLintが成功。`InteractiveForm.tsx` 全体の既存 `no-explicit-any` は今回の範囲外。
- Chromeのローカル画面でカレーの材料→包装→原料なし→概算146,000円→連絡先→戻るを確認。不正メール入力では送信不可。実問い合わせ送信は行っていない。
- GA4設定証跡: `output/oem-detailed-tracking-20261010/ga4-dimensions.jpg`、`ga4-metric.jpg`、`ga4-dimensions.txt`。
- 本番公開はGitHub main→Vercelで行い、Readyと本番ドメイン・配信資産を別途照合する。実ユーザーの新イベント受信・人数は公開後の集計待ち。テスト除外URLで操作した結果を本番顧客イベントの受信と見なさない。

## 公開時のビルド復旧

最初の本番デプロイ `oem-fa8bui8k9-hajioxs-projects.vercel.app` はNoto Sans JP取得時のTurbopack内部クエリ解析で失敗した（`next/font/google queries have exactly one entry`）。同時刻のローカルbuildは成功しており、取得CSSには環境差がある。ビルドを公式対応の `next build --webpack` に変更し、フォント・レイアウトの設定は維持した（[Next.js公式](https://nextjs.org/blog/next-16)）。これに伴い検出された3か所の既存 `params` 型をPromiseに修正した。各処理は既にawaitしており、実行処理の変更はない。変更後のローカルbuildは全ルート成功。失敗ログは `output/oem-detailed-tracking-20261010/deploy-error.log` に保存した。
