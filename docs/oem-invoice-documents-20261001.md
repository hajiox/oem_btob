# OEM請求書訂正・書面

2026-10-01: `sql/022_oem_invoice_documents.sql` adds immutable invoice revision metadata, idempotent admin-only correction/cancel-reissue RPCs, and immutable delivery-note/receipt snapshots. Corrections keep stage, amount, payment plan, order, and original snapshot history; sending/pending/unknown mail, recorded receipts, or active settlements block correction. Cancel-reissue voids the old customer URL and creates a separate replacement transaction.

納品書は完成数量・完成日・出荷記録が揃った注文だけ、領収書は銀行明細確認済みの `oem_payment_receipts` がある注文だけ生成する。書面には発行時のissuer snapshotを含め、HTMLの印刷・PDF保存は補助機能で法的電子認証を意味しない。顧客用URLは署名付き `/btob/document/{id}.{signature}`、管理用印刷は `/admin/documents/{id}`。会計CSVは管理者専用で、日付範囲、500件ページング、UTF-8 BOM、CSV式注入中和を使用する。

確認: `npx tsc --noEmit` と実PGロールバック検証 `verify-oem-invoice-revisions-documents.cjs --with-migration` を通過。領収書は全額入金・精算済み案件だけを対象とし、精算返金を含む純受領額を固定保存する。未完了の精算は発行保留。JST日付とOEMスコープのCSV検証も通過。全体の検証・適用情報は `oem-operations-completion-20261001.md` 参照。
