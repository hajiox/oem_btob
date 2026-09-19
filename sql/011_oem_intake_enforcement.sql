-- Block anonymous direct inserts for the OEM page. Other public forms (including
-- legacy rows whose page_id is NULL) retain their existing anonymous insert path.
BEGIN;
DROP POLICY IF EXISTS "リード作成(匿名可)" ON public.leads;
CREATE POLICY "リード作成(匿名可・OEM除外)" ON public.leads
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    OR page_id IS NULL
    OR page_id <> '35e7d402-0443-4703-94a4-fc2873b8f933'::UUID
  );
COMMIT;
