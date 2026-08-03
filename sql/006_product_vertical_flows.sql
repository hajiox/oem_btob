-- 商品ごとに独立した縦型フォームへ移行する。
-- 1. 旧「商品選択」質問の料金を products に移す
-- 2. 共通ステップを各商品へ複製する
-- 3. 共通ステップを廃止し、form_steps.product_id を必須にする

BEGIN;

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS base_price DOUBLE PRECISION DEFAULT 0,
    ADD COLUMN IF NOT EXISTS base_price_type VARCHAR(20) DEFAULT 'fixed';

UPDATE public.products SET base_price = 0 WHERE base_price IS NULL;
UPDATE public.products SET base_price_type = 'fixed' WHERE base_price_type IS NULL;

ALTER TABLE public.products
    ALTER COLUMN base_price SET DEFAULT 0,
    ALTER COLUMN base_price SET NOT NULL,
    ALTER COLUMN base_price_type SET DEFAULT 'fixed',
    ALTER COLUMN base_price_type SET NOT NULL;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_base_price_type_check;
ALTER TABLE public.products
    ADD CONSTRAINT products_base_price_type_check
    CHECK (base_price_type IN ('fixed', 'percentage'));

-- 旧共通ステップにある商品選択肢の料金を、同名の商品へ引き継ぐ。
WITH legacy_product_prices AS (
    SELECT DISTINCT ON (product.id)
        product.id AS product_id,
        option.price_modifier AS base_price,
        COALESCE(option.price_modifier_type, 'fixed') AS base_price_type
    FROM public.products AS product
    JOIN public.form_steps AS step
      ON step.page_id = product.page_id
     AND step.product_id IS NULL
    JOIN public.form_questions AS question ON question.step_id = step.id
    JOIN public.form_options AS option ON option.question_id = question.id
    WHERE LOWER(BTRIM(option.label)) = LOWER(BTRIM(product.name))
      AND (
        question.question_text ILIKE '%作りたい商品%'
        OR question.question_text ILIKE '%商品を選%'
        OR step.step_title ILIKE '%商品%'
      )
    ORDER BY product.id, step.order_index, question.order_index, option.order_index
)
UPDATE public.products AS product
SET
    base_price = legacy.base_price,
    base_price_type = legacy.base_price_type
FROM legacy_product_prices AS legacy
WHERE product.id = legacy.product_id
  AND product.base_price = 0;

-- 商品がないページの共通ステップは安全に移行できないため、処理を中断する。
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.form_steps AS step
        WHERE step.product_id IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM public.products AS product WHERE product.page_id = step.page_id
          )
    ) THEN
        RAISE EXCEPTION '商品が未登録のページに共通ステップがあります。先に商品を登録してください。';
    END IF;
END $$;

CREATE TEMP TABLE _step_migration (
    old_step_id UUID NOT NULL,
    product_id UUID NOT NULL,
    new_step_id UUID NOT NULL PRIMARY KEY
) ON COMMIT DROP;

-- 商品選択ステップ以外の共通ステップを、同じページの全商品へ複製する。
INSERT INTO _step_migration (old_step_id, product_id, new_step_id)
SELECT step.id, product.id, gen_random_uuid()
FROM public.form_steps AS step
JOIN public.products AS product ON product.page_id = step.page_id
WHERE step.product_id IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.form_questions AS question
      WHERE question.step_id = step.id
        AND (
          question.question_text ILIKE '%作りたい商品%'
          OR question.question_text ILIKE '%商品を選%'
        )
  );

INSERT INTO public.form_steps (
    id,
    page_id,
    product_id,
    order_index,
    step_title,
    step_description,
    is_visible,
    created_at,
    updated_at
)
SELECT
    migration.new_step_id,
    old_step.page_id,
    migration.product_id,
    old_step.order_index,
    old_step.step_title,
    old_step.step_description,
    old_step.is_visible,
    old_step.created_at,
    NOW()
FROM _step_migration AS migration
JOIN public.form_steps AS old_step ON old_step.id = migration.old_step_id;

CREATE TEMP TABLE _question_migration (
    old_question_id UUID NOT NULL,
    product_id UUID NOT NULL,
    new_question_id UUID NOT NULL PRIMARY KEY,
    new_step_id UUID NOT NULL
) ON COMMIT DROP;

INSERT INTO _question_migration (old_question_id, product_id, new_question_id, new_step_id)
SELECT question.id, step_map.product_id, gen_random_uuid(), step_map.new_step_id
FROM _step_migration AS step_map
JOIN public.form_questions AS question ON question.step_id = step_map.old_step_id;

INSERT INTO public.form_questions (
    id,
    step_id,
    order_index,
    question_text,
    input_type,
    is_required,
    help_text,
    depends_on_option_id,
    created_at,
    updated_at
)
SELECT
    question_map.new_question_id,
    question_map.new_step_id,
    old_question.order_index,
    old_question.question_text,
    old_question.input_type,
    old_question.is_required,
    old_question.help_text,
    NULL,
    old_question.created_at,
    NOW()
FROM _question_migration AS question_map
JOIN public.form_questions AS old_question ON old_question.id = question_map.old_question_id;

CREATE TEMP TABLE _option_migration (
    old_option_id UUID NOT NULL,
    product_id UUID NOT NULL,
    new_option_id UUID NOT NULL PRIMARY KEY,
    new_question_id UUID NOT NULL
) ON COMMIT DROP;

INSERT INTO _option_migration (old_option_id, product_id, new_option_id, new_question_id)
SELECT option.id, question_map.product_id, gen_random_uuid(), question_map.new_question_id
FROM _question_migration AS question_map
JOIN public.form_options AS option ON option.question_id = question_map.old_question_id;

INSERT INTO public.form_options (
    id,
    question_id,
    order_index,
    label,
    price_modifier,
    price_modifier_type,
    is_base_price,
    description,
    image_url,
    created_at,
    updated_at
)
SELECT
    option_map.new_option_id,
    option_map.new_question_id,
    old_option.order_index,
    old_option.label,
    old_option.price_modifier,
    old_option.price_modifier_type,
    old_option.is_base_price,
    old_option.description,
    old_option.image_url,
    old_option.created_at,
    NOW()
FROM _option_migration AS option_map
JOIN public.form_options AS old_option ON old_option.id = option_map.old_option_id;

-- 複製した質問内の条件分岐を、同じ商品の複製済み選択肢へつなぎ直す。
UPDATE public.form_questions AS new_question
SET depends_on_option_id = option_map.new_option_id
FROM _question_migration AS question_map
JOIN public.form_questions AS old_question ON old_question.id = question_map.old_question_id
JOIN _option_migration AS option_map
  ON option_map.old_option_id = old_question.depends_on_option_id
 AND option_map.product_id = question_map.product_id
WHERE new_question.id = question_map.new_question_id;

-- 既存の商品別質問が共通選択肢に依存している場合も、商品の複製先へつなぎ直す。
UPDATE public.form_questions AS question
SET depends_on_option_id = option_map.new_option_id
FROM public.form_steps AS step, _option_migration AS option_map
WHERE question.step_id = step.id
  AND step.product_id = option_map.product_id
  AND question.depends_on_option_id = option_map.old_option_id;

-- 商品選択ステップを含む旧共通ステップを削除する。
DELETE FROM public.form_steps WHERE product_id IS NULL;

-- 商品内で表示順を0から振り直す。
WITH ordered_steps AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY product_id
            ORDER BY order_index, created_at, id
        ) - 1 AS new_order_index
    FROM public.form_steps
)
UPDATE public.form_steps AS step
SET order_index = ordered.new_order_index
FROM ordered_steps AS ordered
WHERE step.id = ordered.id;

-- カレーの原料供給分岐を初期設定する。
-- 「ある」の場合だけ原料名を聞き、「ない」の場合は原料名を飛ばして概算見積もりへ進む。
WITH curry_ingredient_branches AS (
    SELECT DISTINCT ON (ingredient_question.id)
        ingredient_question.id AS question_id,
        supply_option.id AS option_id
    FROM public.products AS product
    JOIN public.form_steps AS supply_step
      ON supply_step.product_id = product.id
    JOIN public.form_questions AS supply_question
      ON supply_question.step_id = supply_step.id
    JOIN public.form_options AS supply_option
      ON supply_option.question_id = supply_question.id
    JOIN public.form_steps AS ingredient_step
      ON ingredient_step.product_id = product.id
     AND ingredient_step.order_index > supply_step.order_index
    JOIN public.form_questions AS ingredient_question
      ON ingredient_question.step_id = ingredient_step.id
    WHERE product.name ILIKE '%カレー%'
      AND (
          supply_question.question_text ILIKE '%原料供給%'
          OR supply_step.step_title ILIKE '%原料供給%'
      )
      AND BTRIM(supply_option.label) = 'ある'
      AND (
          ingredient_question.question_text ILIKE '%原料名%'
          OR ingredient_step.step_title ILIKE '%原料名%'
      )
    ORDER BY ingredient_question.id, supply_step.order_index DESC, supply_option.order_index
)
UPDATE public.form_questions AS question
SET depends_on_option_id = branch.option_id
FROM curry_ingredient_branches AS branch
WHERE question.id = branch.question_id;

ALTER TABLE public.form_steps ALTER COLUMN product_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_form_steps_product_order
    ON public.form_steps(product_id, order_index);

COMMENT ON COLUMN public.form_steps.product_id IS
    '所属商品。商品ごとに独立した質問フローを構成するため必須。';

COMMIT;
