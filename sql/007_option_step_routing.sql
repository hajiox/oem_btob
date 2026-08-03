BEGIN;

ALTER TABLE public.form_options
    ADD COLUMN IF NOT EXISTS next_step_id UUID REFERENCES public.form_steps(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS go_to_estimate BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.form_options
    DROP CONSTRAINT IF EXISTS form_options_single_route_check;

ALTER TABLE public.form_options
    ADD CONSTRAINT form_options_single_route_check
    CHECK (NOT (go_to_estimate AND next_step_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_form_options_next_step
    ON public.form_options(next_step_id);

-- 旧「表示条件」を、回答からSTEPへの明示的な行き先へ移行する。
UPDATE public.form_options AS source_option
SET
    next_step_id = target_step.id,
    go_to_estimate = FALSE
FROM public.form_questions AS target_question
JOIN public.form_steps AS target_step
  ON target_step.id = target_question.step_id
WHERE target_question.depends_on_option_id = source_option.id;

-- 条件付きSTEPへ進まない兄弟回答は、その条件区間の次のSTEPへ接続する。
-- 次のSTEPがなければ概算見積もりへ接続する。
WITH routed_source_questions AS (
    SELECT
        source_question.id AS question_id,
        source_step.product_id,
        MAX(target_step.order_index) AS last_branch_order
    FROM public.form_questions AS target_question
    JOIN public.form_steps AS target_step
      ON target_step.id = target_question.step_id
    JOIN public.form_options AS routed_option
      ON routed_option.id = target_question.depends_on_option_id
    JOIN public.form_questions AS source_question
      ON source_question.id = routed_option.question_id
    JOIN public.form_steps AS source_step
      ON source_step.id = source_question.step_id
    WHERE source_step.product_id = target_step.product_id
    GROUP BY source_question.id, source_step.product_id
), sibling_routes AS (
    SELECT
        sibling_option.id AS option_id,
        next_step.id AS next_step_id
    FROM routed_source_questions AS route_group
    JOIN public.form_options AS sibling_option
      ON sibling_option.question_id = route_group.question_id
    LEFT JOIN LATERAL (
        SELECT step.id
        FROM public.form_steps AS step
        WHERE step.product_id = route_group.product_id
          AND step.order_index > route_group.last_branch_order
          AND step.is_visible = TRUE
        ORDER BY step.order_index
        LIMIT 1
    ) AS next_step ON TRUE
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.form_questions AS dependent_question
        WHERE dependent_question.depends_on_option_id = sibling_option.id
    )
)
UPDATE public.form_options AS option
SET
    next_step_id = sibling.next_step_id,
    go_to_estimate = sibling.next_step_id IS NULL
FROM sibling_routes AS sibling
WHERE option.id = sibling.option_id;

COMMENT ON COLUMN public.form_options.next_step_id IS
    'この回答を選んだ後に進むform_steps.id。NULLの場合は次のSTEPへ進む。';

COMMENT ON COLUMN public.form_options.go_to_estimate IS
    'この回答を選んだ後、後続質問を飛ばして概算見積もりへ進む。';

COMMIT;
