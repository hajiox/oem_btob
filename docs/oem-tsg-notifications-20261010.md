# OEM見積もり相談のTSG通知

2026-10-10。OEM側 `3d4f695` と、担当PC TSAによるTSG側 `8356f3f` を本番反映。専用キーと通知有効値trueの本番設定を確認。16:15の本番cronで検証通知の自動配信、16:20の同一通知再送で重複防止に成功。

## 受付と通知

- 固定OEMページの `reserve_oem_lead` が新規相談を保存するとき、相談・既存メール・`oem_tsg_notifications` を同一トランザクションで作る。既存相談のbackfillはしない。導入後、通知が無効な間に受け付けた相談はpendingで保持し、有効化後に送る。
- `submitLead` は保存後にメールとTSG通知を独立試行する。通知だけの失敗で受付を失敗扱いにしない。
- 通知内容は受付時点の会社名・商品・数量・税別の製造概算・受付時刻・相談IDだけ。連絡先、自由記載、承認/請求用token URLは送らない。
- `sourceKey=oem:consultation:<leadId>:received:v1` とpayloadは不変。修正した内容や現在時刻で再生成しない。

## 受信API契約

`POST https://v0-line-blush.vercel.app/api/integrations/oem/consultation-received`

専用Bearer認証。TSG環境変数は `OEM_CONSULTATION_INTEGRATION_SECRET`、OEM側は `OEM_TSG_NOTIFICATION_SECRET`。同じ専用値を各システムのruntime secretへ安全に設定し、Chat・Git・ログに値を残さない。CodexのPC用キー、MCPデータキー、既存共通TSGキーは使わない。

JSONは次の9項目のみ。名前、商品、数量は非空・200 Unicode codepoints以内・制御文字なし。

```json
{
  "schemaVersion": 1,
  "event": "consultation_received",
  "sourceKey": "oem:consultation:<leadId>:received:v1",
  "leadId": "<UUID>",
  "receivedAt": "<受付時刻のISO日時>",
  "companyName": "<会社名>",
  "productName": "<商品>",
  "quantityLabel": "<数量>",
  "estimatedTotalPrice": 123000
}
```

TSG側は投稿先 `d6453519-ab54-4946-9762-ed266f59cb1e`（NEWブランド館（フロア））・投稿者TSG君・詳細リンク `https://oem.aizubrandhall.com/admin/dashboard` を固定する。本文には「見積もり相談受付」「概算・税別・試作費別」を明記する。正式発注と混同しない。

sourceKeyから決定的な投稿UUIDを作り、DBのunique insertと競合時再読込で同時実行を含め重複防止。同一内容はHTTP200、初回は201、同じキーの内容相違は409。成功応答は `{success:true,postId:<UUID>,duplicate:<boolean>}`。Pushは新規投稿時だけ試行する。既存Indeed連携の本文検索による重複判定ではなく、MeetingTranscriberの決定的ID方式を参考にする。

## 配信と再送

- OEM側は `OEM_TSG_NOTIFICATIONS_ENABLED=true` と32文字以上の専用secretが揃った本番のみ配信する。未設定は無効。Previewは明示有効でも送らない。
- 受付直後は対象相談1件を試行。`/api/oem/notifications/sync` は既存 `CRON_SECRET` のBearer認証で5分ごと、最大10件。1回の通信は8秒、リースは2分、worker上限120秒。
- claimは行ロック＋SKIP LOCKED。完了はlease tokenで照合し、古いworkerの状態上書きを防ぐ。リース切れ後は同一sourceKey/payloadで再試行するため、受信側の原子的な重複防止が必須。
- 400/409/422・不正payloadはblocked。他のHTTP失敗・通信不明・不正な成功応答はpendingへ戻し、60秒から最大1時間のbackoff。実行は次の5分cron。回数だけで削除・打切りしない。
- 応答やDB保存の失敗時にもTSGの生レスポンスや秘密値はログへ出さない。結果は通知表のstatus/attempts/error_code/post_idで確認する。
- blockedの復旧は原因を修正した上で、同じキー・同じpayloadを保持してstatusをpendingへ戻す。内容相違409は既存投稿を確認し、別キーの自動発行で回避しない。

## 検証・反映

2026-10-10に以下の通知/メール/94経路回帰・型チェック・新規TSへのeslint・本番buildが成功。DB検証は合成データを全件ROLLBACKし、028はchecksum管理の正規runnerでOEM本番DBへ適用済み。その後、下記の本番cronで明示的な動作確認投稿1件と同一通知の再送を検証した。

- `node scripts/verify-oem-tsg.cjs`: fetch完全mock、設定無効/Preview/認証、HTTP・通信不明・CAS・cron契約。
- `node scripts/verify-oem-tsg-db.cjs`: 通常OEM接続、合成相談のみ、全件ROLLBACK。重複・lease/CAS・再送・不変payload・anon/authenticated拒否。実メール/TSG投稿なし。
- `node scripts/verify-oem-security.cjs`: 既存94回答経路と受付/メール/TSG障害のmock回帰。実送信なし。
- `npx tsc --noEmit`、変更した新規TSファイルへのeslint、`npm run build`。
- migrationは `node scripts/oem-db-migrate.cjs 028_oem_tsg_notifications.sql --apply`。既存migrationを変更せず、checksum付きで適用する。

TSAへの連携仕様はCodexMTG投稿 `c800b3d8-6219-497c-a472-cdb4fd5c0665`。初回の承認確認待ちの後、担当PC TSAが管理職の直接依頼を確認して着手（報告 `dacc240d-b09c-4103-95a0-6aafade9762b`）。CEO_SからTSG本体は変更していない。TSG `8356f3f` の9項目契約・専用認証・固定宛先・決定的ID・proxy許可をソースで照合済み。本番 `ts-groupware-5nnkc7op0-hajioxs-projects.vercel.app`、OEM `oem-8mhsy5did-hajioxs-projects.vercel.app` のReady/独自ドメインaliasを確認。正規Vercel設定APIでOEM有効値true（非秘密）のみ確認し、秘密値は出力・保存していない。

本番cron検証は `sourceKey=oem:consultation:06fd55ae-8282-4b51-b02e-a58e36e4da79:received:v1` の1件を使用。会社名に「動作確認・実案件ではありません」と明記。合成lead/outboxだけを作成し、メールキューは0件。16:15:48 JSTにフロアへ投稿され、OEM側はsent/attempts=1/errorなし。MCP `posts_get` で投稿先・TSG君・会社/商品/数量/概算/管理リンクを照合。postId `b460a6f2-518c-5fa1-8b4d-8b4cbc5d38d1`。

16:19に同じ通知をpendingへ戻し、16:20:48 JSTの正規cronで再送成功。OEM側はsent/attempts=2/errorなし、postIdは同一。MCP `posts_get` の作成日時・versionは初回のまま、固定フロア内の検証会社名検索は1件・追加ページなしを確認した。専用キー/CRON_SECRETはsensitiveのため取り出さず、正規の定期ジョブで配送した。

検証後、メールキュー0件を確認した上で、厳密なID・会社名・検証用メールアドレスの照合付きトランザクションでOEM仮lead1件を削除。関連outboxはcascade削除され、仮lead/outbox/mailは全て0件。フロアの明示的な動作確認投稿1件は確認用に残した。確認先: `https://v0-line-blush.vercel.app/board/d6453519-ab54-4946-9762-ed266f59cb1e#post-b460a6f2-518c-5fa1-8b4d-8b4cbc5d38d1`。
