# OEM見積もり相談のTSG通知

2026-10-10。OEM側の実装。TSG側の専用受信APIと資格情報設定は担当PC TSAでの正式依頼確認・実装待ち。自動投稿はまだ有効化しない。

## 受付と通知

- 固定OEMページの `reserve_oem_lead` が新規相談を保存するとき、相談・既存メール・`oem_tsg_notifications` を同一トランザクションで作る。既存相談のbackfillはしない。導入後、通知が無効な間に受け付けた相談はpendingで保持し、有効化後に送る。
- `submitLead` は保存後にメールとTSG通知を独立試行する。通知だけの失敗で受付を失敗扱いにしない。
- 通知内容は受付時点の会社名・商品・数量・税別の製造概算・受付時刻・相談IDだけ。連絡先、自由記載、承認/請求用token URLは送らない。
- `sourceKey=oem:consultation:<leadId>:received:v1` とpayloadは不変。修正した内容や現在時刻で再生成しない。

## 受信API契約（TSG側の追加が必要）

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

2026-10-10に以下の通知/メール/94経路回帰・型チェック・新規TSへのeslint・本番buildが成功。DB検証は合成データを全件ROLLBACKし、028はchecksum管理の正規runnerでOEM本番DBへ適用済み。TSGへの実投稿は行っていない。

- `node scripts/verify-oem-tsg.cjs`: fetch完全mock、設定無効/Preview/認証、HTTP・通信不明・CAS・cron契約。
- `node scripts/verify-oem-tsg-db.cjs`: 通常OEM接続、合成相談のみ、全件ROLLBACK。重複・lease/CAS・再送・不変payload・anon/authenticated拒否。実メール/TSG投稿なし。
- `node scripts/verify-oem-security.cjs`: 既存94回答経路と受付/メール/TSG障害のmock回帰。実送信なし。
- `npx tsc --noEmit`、変更した新規TSファイルへのeslint、`npm run build`。
- migrationは `node scripts/oem-db-migrate.cjs 028_oem_tsg_notifications.sql --apply`。既存migrationを変更せず、checksum付きで適用する。

TSAへの連携仕様はCodexMTG投稿 `c800b3d8-6219-497c-a472-cdb4fd5c0665`。回答 `2722dec0-f065-4bf9-af8f-cb2c38f78c86` は、Codex間依頼だけでは改修承認にならず管理職の正式依頼確認が必要との内容。CEO_SからTSG本体は変更していない。TSG側配備・専用secret設定・本番の一報確認が終わるまで、全体を稼働済みとしない。
