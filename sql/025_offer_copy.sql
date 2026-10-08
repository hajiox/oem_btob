BEGIN;

UPDATE public.lp_sections
SET title = '初回特典：試作費10,000円→5,000円（50%OFF）。原材料表示・栄養成分表示・簡易パッケージデザインは各0円。試作で特殊食材の使用の場合は別途お見積りとなります',
    updated_at = now()
WHERE page_id = '35e7d402-0443-4703-94a4-fc2873b8f933'
  AND order_index = 4
  AND title = '先着10社様限定 今なら初期費用0円';

COMMIT;
