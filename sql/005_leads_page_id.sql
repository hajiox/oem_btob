-- ============================================
-- leads テーブルに page_id を追加
-- pages テーブルにメール設定カラムを追加
-- 複数ページ対応 + ページごとのメール設定
-- ============================================

-- 1. leads に page_id を追加（NULLable: 既存データ対応）
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS page_id UUID REFERENCES public.pages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_page_id ON public.leads(page_id);

-- 2. pages にメール設定カラムを追加
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS email_from_name TEXT DEFAULT 'OEM自動見積り';
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS email_from_address TEXT DEFAULT 'staff@aizu-tv.com';
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS admin_notification_email TEXT DEFAULT 'staff@aizu-tv.com';
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS customer_email_subject TEXT DEFAULT '【自動回答】お見積り依頼を承りました';
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS admin_email_subject TEXT DEFAULT '【新規リード獲得】新しいお見積り依頼が届きました';

-- 3. メール本文テンプレート
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS customer_email_intro TEXT DEFAULT 'この度はお見積りシミュレーションをご利用いただき、誠にありがとうございます。
以下の内容で承りました。内容を確認の上、担当者より3営業日以内にご連絡させていただきます。';
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS customer_email_closing TEXT DEFAULT '※本メールは自動送信されています。お心当たりのない場合は破棄してください。';
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS admin_email_intro TEXT DEFAULT '新しいリードを獲得しました。管理画面から詳細を確認してください。';
