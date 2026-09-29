-- Manual OEM bank payment plans and append-only receipt evidence.
BEGIN;

CREATE TABLE public.oem_payment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.oem_orders(id) ON DELETE RESTRICT,
  stage text NOT NULL CHECK (stage IN ('deposit','balance')),
  expected_amount integer NOT NULL CHECK (expected_amount > 0),
  due_date date,
  payer_name text NOT NULL DEFAULT '' CHECK (length(payer_name) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id, stage)
);

CREATE TABLE public.oem_payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.oem_payment_plans(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL UNIQUE,
  amount integer NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL,
  payer_name text NOT NULL CHECK (length(trim(payer_name)) BETWEEN 1 AND 200),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  confirmed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (paid_on <= ((now() AT TIME ZONE 'Asia/Tokyo')::date))
);

CREATE INDEX oem_payment_plans_order_idx ON public.oem_payment_plans(order_id);
CREATE INDEX oem_payment_receipts_plan_idx ON public.oem_payment_receipts(plan_id, created_at);
CREATE INDEX oem_payment_receipts_request_idx ON public.oem_payment_receipts(request_id);

ALTER TABLE public.oem_payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oem_payment_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oem_payment_plans, public.oem_payment_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.oem_payment_plans TO service_role;
GRANT SELECT, INSERT ON public.oem_payment_receipts TO service_role;

CREATE TRIGGER set_oem_payment_plans_updated_at BEFORE UPDATE ON public.oem_payment_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_oem_payment_receipt_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'OEM payment receipts are append-only' USING ERRCODE = 'read_only_sql_transaction';
END $$;
CREATE TRIGGER oem_payment_receipts_append_only BEFORE UPDATE OR DELETE ON public.oem_payment_receipts
FOR EACH ROW EXECUTE FUNCTION public.prevent_oem_payment_receipt_mutation();

CREATE OR REPLACE FUNCTION public.enforce_oem_payment_order_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_stage text; v_expected integer; v_received bigint;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'cancelled' AND OLD.status NOT IN ('shipped','cancelled') THEN RETURN NEW; END IF;
  IF OLD.status = 'issued' AND NEW.status = 'accepted' THEN RETURN NEW; END IF;
  IF OLD.status = 'accepted' AND NEW.status = 'deposit_paid' THEN v_stage := 'deposit';
  ELSIF OLD.status = 'deposit_paid' AND NEW.status = 'in_production' THEN RETURN NEW;
  ELSIF OLD.status = 'in_production' AND NEW.status = 'balance_due' THEN RETURN NEW;
  ELSIF OLD.status = 'balance_due' AND NEW.status = 'paid' THEN v_stage := 'balance';
  ELSIF OLD.status = 'paid' AND NEW.status = 'shipped' THEN RETURN NEW;
  ELSE RAISE EXCEPTION 'invalid OEM order status transition: % -> %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  SELECT p.expected_amount, coalesce(sum(r.amount),0) INTO v_expected,v_received
    FROM public.oem_payment_plans p LEFT JOIN public.oem_payment_receipts r ON r.plan_id=p.id
    WHERE p.order_id=NEW.id AND p.stage=v_stage GROUP BY p.expected_amount;
  IF v_expected IS NULL OR v_received <> v_expected THEN
    RAISE EXCEPTION 'matching % payment is required before order status transition', v_stage USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_oem_payment_order_status BEFORE UPDATE OF status ON public.oem_orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_oem_payment_order_status();

CREATE OR REPLACE FUNCTION public.save_oem_payment_plan(
  p_order_id uuid, p_stage text, p_expected_amount integer, p_due_date date,
  p_payer_name text, p_expected_updated_at timestamptz, p_actor uuid
) RETURNS TABLE(result text, plan_id uuid, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.oem_orders%ROWTYPE; v_plan public.oem_payment_plans%ROWTYPE;
BEGIN
  IF p_stage NOT IN ('deposit','balance') OR p_expected_amount IS NULL OR p_expected_amount <= 0
     OR p_expected_amount > 100000000 OR p_payer_name IS NULL OR length(p_payer_name) > 200 THEN
    RETURN QUERY SELECT 'invalid',NULL::uuid,NULL::timestamptz; RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oem_mail_admins WHERE user_id=p_actor) THEN
    RETURN QUERY SELECT 'forbidden',NULL::uuid,NULL::timestamptz; RETURN;
  END IF;
  SELECT * INTO v_order FROM public.oem_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status='cancelled' OR v_order.status='issued' OR
     (p_stage='deposit' AND v_order.status <> 'accepted') OR
     (p_stage='balance' AND v_order.status <> 'balance_due') THEN
    RETURN QUERY SELECT 'state',NULL::uuid,NULL::timestamptz; RETURN;
  END IF;
  SELECT * INTO v_plan FROM public.oem_payment_plans WHERE order_id=p_order_id AND stage=p_stage FOR UPDATE;
  IF FOUND THEN
    IF p_expected_updated_at IS NULL OR v_plan.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RETURN QUERY SELECT 'conflict',v_plan.id,v_plan.updated_at; RETURN;
    END IF;
    IF EXISTS (SELECT 1 FROM public.oem_payment_receipts r WHERE r.plan_id=v_plan.id) AND p_expected_amount <> v_plan.expected_amount THEN
      RETURN QUERY SELECT 'receipt_exists',v_plan.id,v_plan.updated_at; RETURN;
    END IF;
    UPDATE public.oem_payment_plans SET expected_amount=p_expected_amount,due_date=p_due_date,payer_name=trim(p_payer_name)
      WHERE id=v_plan.id RETURNING * INTO v_plan;
  ELSE
    IF p_expected_updated_at IS NOT NULL THEN RETURN QUERY SELECT 'conflict',NULL::uuid,NULL::timestamptz; RETURN; END IF;
    INSERT INTO public.oem_payment_plans(order_id,stage,expected_amount,due_date,payer_name)
      VALUES(p_order_id,p_stage,p_expected_amount,p_due_date,trim(p_payer_name)) RETURNING * INTO v_plan;
  END IF;
  INSERT INTO public.oem_lead_events(lead_id,event_type,details,created_by)
    VALUES(v_order.lead_id,'payment_plan_saved',jsonb_build_object('order_id',p_order_id,'plan_id',v_plan.id,'stage',p_stage,'expected_amount',p_expected_amount),p_actor);
  RETURN QUERY SELECT 'saved',v_plan.id,v_plan.updated_at;
END $$;

CREATE OR REPLACE FUNCTION public.record_oem_payment_receipt(
  p_plan_id uuid, p_request_id uuid, p_amount integer, p_paid_on date,
  p_payer_name text, p_note text, p_confirmed_by uuid
) RETURNS TABLE(result text, message text, receipt_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan public.oem_payment_plans%ROWTYPE; v_order public.oem_orders%ROWTYPE;
  v_existing public.oem_payment_receipts%ROWTYPE; v_total bigint; v_status text;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000000 OR p_paid_on IS NULL
     OR p_paid_on > (now() AT TIME ZONE 'Asia/Tokyo')::date OR p_payer_name IS NULL
     OR length(trim(p_payer_name)) NOT BETWEEN 1 AND 200 OR length(coalesce(p_note,'')) > 2000 THEN
    RETURN QUERY SELECT 'invalid','入力内容を確認してください',NULL::uuid; RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oem_mail_admins WHERE user_id=p_confirmed_by) THEN
    RETURN QUERY SELECT 'forbidden','入金確認権限がありません',NULL::uuid; RETURN;
  END IF;
  SELECT * INTO v_existing FROM public.oem_payment_receipts WHERE request_id=p_request_id;
  IF FOUND THEN
    IF v_existing.plan_id=p_plan_id AND v_existing.amount=p_amount AND v_existing.paid_on=p_paid_on
       AND v_existing.payer_name=trim(p_payer_name) AND v_existing.note=coalesce(p_note,'') THEN
      RETURN QUERY SELECT 'duplicate','同じ入金記録は登録済みです',v_existing.id; RETURN;
    END IF;
    RETURN QUERY SELECT 'conflict','送信IDが別の入金記録で使用されています',NULL::uuid; RETURN;
  END IF;
  SELECT * INTO v_plan FROM public.oem_payment_plans WHERE id=p_plan_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found','入金予定が見つかりません',NULL::uuid; RETURN; END IF;
  SELECT * INTO v_order FROM public.oem_orders WHERE id=v_plan.order_id FOR UPDATE;
  SELECT * INTO v_plan FROM public.oem_payment_plans WHERE id=p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found','入金予定が見つかりません',NULL::uuid; RETURN; END IF;
  SELECT * INTO v_existing FROM public.oem_payment_receipts WHERE request_id=p_request_id;
  IF FOUND THEN
    IF v_existing.plan_id=p_plan_id AND v_existing.amount=p_amount AND v_existing.paid_on=p_paid_on
       AND v_existing.payer_name=trim(p_payer_name) AND v_existing.note=coalesce(p_note,'') THEN
      RETURN QUERY SELECT 'duplicate','同じ入金記録は登録済みです',v_existing.id; RETURN;
    END IF;
    RETURN QUERY SELECT 'conflict','送信IDが別の入金記録で使用されています',NULL::uuid; RETURN;
  END IF;
  IF (v_plan.stage='deposit' AND v_order.status <> 'accepted') OR (v_plan.stage='balance' AND v_order.status <> 'balance_due') THEN
    RETURN QUERY SELECT 'state','現在の発注状態では入金を確認できません',NULL::uuid; RETURN;
  END IF;
  INSERT INTO public.oem_payment_receipts(plan_id,request_id,amount,paid_on,payer_name,note,confirmed_by)
    VALUES(p_plan_id,p_request_id,p_amount,p_paid_on,trim(p_payer_name),coalesce(p_note,''),p_confirmed_by) RETURNING id INTO v_existing.id;
  SELECT coalesce(sum(amount),0) INTO v_total FROM public.oem_payment_receipts WHERE plan_id=p_plan_id;
  IF v_total = v_plan.expected_amount THEN
    v_status := CASE WHEN v_plan.stage='deposit' THEN 'deposit_paid' ELSE 'paid' END;
    UPDATE public.oem_orders SET status=v_status WHERE id=v_order.id;
    INSERT INTO public.oem_lead_events(lead_id,event_type,details,created_by)
      VALUES(v_order.lead_id,'payment_confirmed',jsonb_build_object('order_id',v_order.id,'plan_id',p_plan_id,'receipt_id',v_existing.id,'stage',v_plan.stage,'amount',p_amount,'total',v_total,'status',v_status),p_confirmed_by);
    RETURN QUERY SELECT 'accepted','入金を確認し、発注状態を更新しました',v_existing.id; RETURN;
  END IF;
  INSERT INTO public.oem_lead_events(lead_id,event_type,details,created_by)
    VALUES(v_order.lead_id,'payment_recorded',jsonb_build_object('order_id',v_order.id,'plan_id',p_plan_id,'receipt_id',v_existing.id,'stage',v_plan.stage,'amount',p_amount,'total',v_total,'excess',v_total>v_plan.expected_amount),p_confirmed_by);
  RETURN QUERY SELECT CASE WHEN v_total > v_plan.expected_amount THEN 'excess' ELSE 'partial' END,
    CASE WHEN v_total > v_plan.expected_amount THEN '過入金を記録しました。状態は更新していません' ELSE '一部入金を記録しました' END,v_existing.id;
END $$;

CREATE OR REPLACE FUNCTION public.get_oem_payment_alerts(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
RETURNS TABLE(order_id uuid,lead_id uuid,order_number text,company_name text,stage text,expected_amount integer,received_amount bigint,due_date date,kind text,total_count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
WITH candidates AS (
 SELECT o.id order_id,o.lead_id,o.order_number,l.company_name, p.stage,p.expected_amount,p.due_date,
   coalesce(sum(r.amount),0)::bigint received_amount,
   CASE WHEN p.id IS NULL THEN 'unconfigured'
        WHEN coalesce(sum(r.amount),0) > p.expected_amount THEN 'excess'
        WHEN p.due_date < (now() AT TIME ZONE 'Asia/Tokyo')::date AND coalesce(sum(r.amount),0) < p.expected_amount THEN 'overdue'
        ELSE 'waiting' END kind
 FROM public.oem_orders o JOIN public.leads l ON l.id=o.lead_id AND l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid
 LEFT JOIN public.oem_payment_plans p ON p.order_id=o.id AND (p.stage=CASE WHEN o.status='accepted' THEN 'deposit' WHEN o.status='balance_due' THEN 'balance' ELSE p.stage END)
 LEFT JOIN public.oem_payment_receipts r ON r.plan_id=p.id
 WHERE o.status IN ('accepted','deposit_paid','in_production','balance_due','paid','shipped')
 GROUP BY o.id,o.lead_id,o.order_number,l.company_name,p.id,p.stage,p.expected_amount,p.due_date
 HAVING (p.id IS NULL AND o.status IN ('accepted','balance_due'))
     OR coalesce(sum(r.amount),0) > p.expected_amount OR o.status IN ('accepted','balance_due')
), numbered AS (SELECT c.*,count(*) over() total_count FROM candidates c)
SELECT order_id,lead_id,order_number,company_name,
  coalesce(stage, CASE WHEN kind='unconfigured' AND order_id IS NOT NULL THEN
    CASE WHEN EXISTS (SELECT 1 FROM public.oem_orders oo WHERE oo.id=numbered.order_id AND oo.status='accepted') THEN 'deposit' ELSE 'balance' END
  END)::text,
  expected_amount,received_amount,due_date,kind::text,total_count
FROM numbered ORDER BY CASE kind WHEN 'excess' THEN 0 WHEN 'overdue' THEN 1 WHEN 'unconfigured' THEN 2 ELSE 3 END,due_date NULLS LAST,order_number
LIMIT greatest(0,least(coalesce(p_limit,100),100)) OFFSET greatest(0,coalesce(p_offset,0));
$$;

REVOKE ALL ON FUNCTION public.save_oem_payment_plan(uuid,text,integer,date,text,timestamptz,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_oem_payment_receipt(uuid,uuid,integer,date,text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_oem_payment_alerts(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_oem_payment_plan(uuid,text,integer,date,text,timestamptz,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_oem_payment_receipt(uuid,uuid,integer,date,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_oem_payment_alerts(integer,integer) TO service_role;

COMMIT;
