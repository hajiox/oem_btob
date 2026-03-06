-- ============================================
-- B2B食品OEM フルダイナミックLP & BTO管理システム
-- 初期スキーマ v1.0
-- ============================================

-- updated_at 自動更新用トリガー関数
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- [A] LPコンテンツ管理
-- ============================================

CREATE TABLE public.lp_sections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_index INTEGER NOT NULL DEFAULT 0,
  section_type TEXT NOT NULL DEFAULT 'content' CHECK (section_type IN ('hero', 'content', 'feature', 'cta', 'testimonial', 'faq')),
  image_url TEXT,
  title TEXT,
  description TEXT,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.lp_sections ENABLE ROW LEVEL SECURITY;

-- 公開側: 誰でも可視セクションを閲覧可
CREATE POLICY "公開セクション閲覧" ON public.lp_sections
  FOR SELECT USING (is_visible = TRUE);

-- 管理者: サービスロールキーで全操作（RLSバイパス）
-- 管理画面はservice_roleを使うため、追加のINSERT/UPDATE/DELETEポリシーは
-- 認証済み管理者にのみ適用
CREATE POLICY "管理者全操作" ON public.lp_sections
  FOR ALL USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE TRIGGER set_lp_sections_updated_at
  BEFORE UPDATE ON public.lp_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_lp_sections_order ON public.lp_sections(order_index);
CREATE INDEX idx_lp_sections_visible ON public.lp_sections(is_visible);

-- ============================================
-- [B] 動的フォーム管理（BTO）
-- ============================================

-- ステップの定義
CREATE TABLE public.form_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_index INTEGER NOT NULL DEFAULT 0,
  step_title TEXT NOT NULL,
  step_description TEXT,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.form_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "公開ステップ閲覧" ON public.form_steps
  FOR SELECT USING (is_visible = TRUE);

CREATE POLICY "管理者ステップ全操作" ON public.form_steps
  FOR ALL USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE TRIGGER set_form_steps_updated_at
  BEFORE UPDATE ON public.form_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_form_steps_order ON public.form_steps(order_index);

-- 質問の定義
CREATE TABLE public.form_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  step_id UUID NOT NULL REFERENCES public.form_steps(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  question_text TEXT NOT NULL,
  input_type TEXT NOT NULL DEFAULT 'radio' CHECK (input_type IN ('radio', 'checkbox', 'text', 'textarea', 'number', 'select')),
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  help_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.form_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "公開質問閲覧" ON public.form_questions
  FOR SELECT USING (TRUE);

CREATE POLICY "管理者質問全操作" ON public.form_questions
  FOR ALL USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE TRIGGER set_form_questions_updated_at
  BEFORE UPDATE ON public.form_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_form_questions_step ON public.form_questions(step_id);
CREATE INDEX idx_form_questions_order ON public.form_questions(order_index);

-- 選択肢と金額計算ロジック
CREATE TABLE public.form_options (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES public.form_questions(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  price_modifier INTEGER NOT NULL DEFAULT 0,
  is_base_price BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.form_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "公開選択肢閲覧" ON public.form_options
  FOR SELECT USING (TRUE);

CREATE POLICY "管理者選択肢全操作" ON public.form_options
  FOR ALL USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE TRIGGER set_form_options_updated_at
  BEFORE UPDATE ON public.form_options
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_form_options_question ON public.form_options(question_id);
CREATE INDEX idx_form_options_order ON public.form_options(order_index);

-- ============================================
-- [C] リード管理
-- ============================================

CREATE TABLE public.leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  selected_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_total_price INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'quoted', 'negotiating', 'won', 'lost')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- リードは匿名ユーザーでもフォーム送信で作成可能
CREATE POLICY "リード作成(匿名可)" ON public.leads
  FOR INSERT WITH CHECK (TRUE);

-- リードの閲覧・更新・削除は管理者のみ
CREATE POLICY "管理者リード閲覧" ON public.leads
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "管理者リード更新" ON public.leads
  FOR UPDATE USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "管理者リード削除" ON public.leads
  FOR DELETE USING ((SELECT auth.uid()) IS NOT NULL);

CREATE TRIGGER set_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_created ON public.leads(created_at DESC);
CREATE INDEX idx_leads_email ON public.leads(email);
