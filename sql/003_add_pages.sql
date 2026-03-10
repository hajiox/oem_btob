-- ============================================
-- [D] ページ管理 (LP・フォームを複数管理するための親テーブル)
-- ============================================

CREATE TABLE public.pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "公開ページ閲覧" ON public.pages
  FOR SELECT USING (TRUE);

CREATE POLICY "管理者ページ全操作" ON public.pages
  FOR ALL USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE TRIGGER set_pages_updated_at
  BEFORE UPDATE ON public.pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 既存テーブルの改修 (page_idの追加)
-- ============================================

-- 1. まず NULL 許可で既存テーブルにカラムを追加
ALTER TABLE public.lp_sections ADD COLUMN page_id UUID REFERENCES public.pages(id) ON DELETE CASCADE;
ALTER TABLE public.form_steps ADD COLUMN page_id UUID REFERENCES public.pages(id) ON DELETE CASCADE;

-- 2. 初期ページデータの挿入 (oem)
INSERT INTO public.pages (slug, title, description) 
VALUES ('oem', '食品OEM', '福島の食材を使った小ロットからの食品OEM') 
ON CONFLICT (slug) DO NOTHING;

-- 3. 既存のデータを 'oem' ページに紐付ける
UPDATE public.lp_sections 
SET page_id = (SELECT id FROM public.pages WHERE slug = 'oem') 
WHERE page_id IS NULL;

UPDATE public.form_steps 
SET page_id = (SELECT id FROM public.pages WHERE slug = 'oem') 
WHERE page_id IS NULL;

-- 4. 制約を追加 (NOT NULL)
ALTER TABLE public.lp_sections ALTER COLUMN page_id SET NOT NULL;
ALTER TABLE public.form_steps ALTER COLUMN page_id SET NOT NULL;

-- 5. インデックスの追加
CREATE INDEX idx_lp_sections_page ON public.lp_sections(page_id);
CREATE INDEX idx_form_steps_page ON public.form_steps(page_id);
