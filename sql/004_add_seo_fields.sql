-- ============================================
-- [E] ページテーブルにSEO・OGP関連カラムを追加
-- ============================================

ALTER TABLE public.pages ADD COLUMN seo_title TEXT;
ALTER TABLE public.pages ADD COLUMN seo_description TEXT;
ALTER TABLE public.pages ADD COLUMN og_title TEXT;
ALTER TABLE public.pages ADD COLUMN og_description TEXT;
ALTER TABLE public.pages ADD COLUMN og_image_url TEXT;
ALTER TABLE public.pages ADD COLUMN favicon_url TEXT;

COMMENT ON COLUMN public.pages.seo_title IS '検索エンジン向けのタイトルタグ';
COMMENT ON COLUMN public.pages.seo_description IS '検索エンジン向けのスニペット（meta description）';
COMMENT ON COLUMN public.pages.og_title IS 'OGPタイトル (Twitter/Facebook)';
COMMENT ON COLUMN public.pages.og_description IS 'OGP説明文';
COMMENT ON COLUMN public.pages.og_image_url IS 'OGP画像のURL';
COMMENT ON COLUMN public.pages.favicon_url IS 'ファビコンのURL';
