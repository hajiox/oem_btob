-- ============================================
-- マイグレーション: 質問の条件分岐（depends_on）
-- 質問が特定の選択肢が選ばれた時にのみ表示される機能
-- ============================================

-- form_questions に depends_on_option_id を追加
-- NULLの場合は常に表示、値がある場合はその選択肢が選ばれた時のみ表示
ALTER TABLE public.form_questions
  ADD COLUMN IF NOT EXISTS depends_on_option_id UUID REFERENCES public.form_options(id) ON DELETE SET NULL;

-- インデックス
CREATE INDEX IF NOT EXISTS idx_form_questions_depends_on ON public.form_questions(depends_on_option_id);
