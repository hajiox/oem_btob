-- Separate ledger: accepted quotations, invoices and receipts stay unchanged.
BEGIN;
CREATE TABLE public.oem_settlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.oem_orders(id) ON DELETE RESTRICT,
 revision integer NOT NULL CHECK(revision>0), kind text NOT NULL CHECK(kind IN ('adjustment','cancellation')),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','confirmed','settled','void')),
 material_stage text NOT NULL CHECK((kind='cancellation' AND material_stage IN ('before','after')) OR (kind='adjustment' AND material_stage='not_applicable')),
 taxable8 integer NOT NULL CHECK(taxable8 BETWEEN 0 AND 100000000), taxable10 integer NOT NULL CHECK(taxable10 BETWEEN 0 AND 100000000), non_taxable integer NOT NULL CHECK(non_taxable BETWEEN 0 AND 100000000),
 tax8 integer GENERATED ALWAYS AS ((taxable8::bigint*8/100)::integer) STORED, tax10 integer GENERATED ALWAYS AS ((taxable10::bigint*10/100)::integer) STORED,
 target_gross bigint GENERATED ALWAYS AS (taxable8::bigint+taxable10+non_taxable+taxable8::bigint*8/100+taxable10::bigint*10/100) STORED CHECK(target_gross BETWEEN 0 AND 100000000),
 due_date date CHECK(due_date IS NULL OR due_date>=DATE '1900-01-01'),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000), agreement_note text NOT NULL CHECK(length(trim(agreement_note)) BETWEEN 1 AND 4000),
 original_snapshot jsonb CHECK(original_snapshot IS NULL OR jsonb_typeof(original_snapshot)='object'), received_at_confirmation bigint,
 confirmed_at timestamptz, confirmed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 void_reason text NOT NULL DEFAULT '' CHECK(length(void_reason)<=2000), version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(state NOT IN ('confirmed','settled') OR (confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL AND original_snapshot IS NOT NULL AND received_at_confirmation IS NOT NULL)),
 CHECK(state<>'void' OR length(trim(void_reason))>0), UNIQUE(order_id,revision)
);
CREATE UNIQUE INDEX oem_settlements_one_open_idx ON public.oem_settlements(order_id) WHERE state IN ('draft','confirmed');
CREATE INDEX oem_settlements_order_idx ON public.oem_settlements(order_id,revision DESC);
CREATE TABLE public.oem_settlement_cash (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), settlement_id uuid NOT NULL REFERENCES public.oem_settlements(id) ON DELETE RESTRICT,
 order_id uuid NOT NULL REFERENCES public.oem_orders(id) ON DELETE RESTRICT, request_id uuid NOT NULL UNIQUE,
 direction text NOT NULL CHECK(direction IN ('receipt','refund')), amount integer NOT NULL CHECK(amount BETWEEN 1 AND 100000000),
 happened_on date NOT NULL CHECK(happened_on>=DATE '1900-01-01' AND happened_on<=(now() AT TIME ZONE 'Asia/Tokyo')::date),
 counterparty text NOT NULL CHECK(length(trim(counterparty)) BETWEEN 1 AND 200), note text NOT NULL CHECK(length(trim(note)) BETWEEN 1 AND 2000),
 confirmed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oem_settlement_cash_order_idx ON public.oem_settlement_cash(order_id,created_at DESC);
CREATE INDEX oem_settlement_cash_settlement_idx ON public.oem_settlement_cash(settlement_id);
-- Every successful operation key is retained, even after subsequent edits.
CREATE TABLE public.oem_settlement_requests (
 request_id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES public.oem_orders(id) ON DELETE RESTRICT,
 settlement_id uuid NOT NULL REFERENCES public.oem_settlements(id) ON DELETE RESTRICT, input_settlement_id uuid,
 action text NOT NULL CHECK(action IN ('save','confirm','void','record_cash')), input jsonb NOT NULL,
 result text NOT NULL, result_version integer NOT NULL, actor uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oem_settlement_requests_order_idx ON public.oem_settlement_requests(order_id);
CREATE INDEX oem_settlement_requests_settlement_idx ON public.oem_settlement_requests(settlement_id);
ALTER TABLE public.oem_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oem_settlement_cash ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oem_settlement_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oem_settlements,public.oem_settlement_cash,public.oem_settlement_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.oem_settlements,public.oem_settlement_cash,public.oem_settlement_requests TO service_role;

CREATE FUNCTION public.prevent_oem_settlement_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'settlement history cannot be deleted'; END IF;
 IF NEW.id<>OLD.id OR NEW.order_id<>OLD.order_id OR NEW.revision<>OLD.revision OR NEW.kind<>OLD.kind OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'settlement identity is immutable'; END IF;
 IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'settlement version must increment'; END IF;
 IF OLD.state IN ('settled','void') THEN RAISE EXCEPTION 'closed settlement is immutable'; END IF;
 -- Generated tax columns are not yet computed in BEFORE UPDATE. Freeze their
 -- source bases instead; PostgreSQL recomputes the same derived amounts.
 IF OLD.state='confirmed' AND (NEW.state NOT IN ('confirmed','settled') OR (to_jsonb(NEW)-ARRAY['state','version','updated_at','tax8','tax10','target_gross']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','updated_at','tax8','tax10','target_gross'])) THEN RAISE EXCEPTION 'confirmed settlement business fields are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER oem_settlements_immutable BEFORE UPDATE OR DELETE ON public.oem_settlements FOR EACH ROW EXECUTE FUNCTION public.prevent_oem_settlement_mutation();
CREATE FUNCTION public.prevent_oem_settlement_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'settlement evidence is append-only'; END $$;
CREATE TRIGGER oem_settlement_cash_append_only BEFORE UPDATE OR DELETE ON public.oem_settlement_cash FOR EACH ROW EXECUTE FUNCTION public.prevent_oem_settlement_evidence_mutation();
CREATE TRIGGER oem_settlement_requests_append_only BEFORE UPDATE OR DELETE ON public.oem_settlement_requests FOR EACH ROW EXECUTE FUNCTION public.prevent_oem_settlement_evidence_mutation();
CREATE FUNCTION public.oem_settlement_has_active(p_order uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.oem_settlements WHERE order_id=p_order AND state IN ('draft','confirmed')) $$;
CREATE FUNCTION public.oem_settlement_net_received(p_order uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT sum(r.amount) FROM public.oem_payment_receipts r JOIN public.oem_payment_plans p ON p.id=r.plan_id WHERE p.order_id=p_order),0)+coalesce((SELECT sum(CASE direction WHEN 'receipt' THEN amount ELSE -amount END) FROM public.oem_settlement_cash WHERE order_id=p_order),0)
$$;
CREATE FUNCTION public.block_oem_settlement_original_writes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE oid uuid;
BEGIN
 IF TG_TABLE_NAME='oem_payment_plans' THEN
  IF TG_OP='UPDATE' THEN
   IF NEW.order_id<>OLD.order_id OR NEW.stage<>OLD.stage THEN RAISE EXCEPTION 'payment plan identity is immutable' USING ERRCODE='check_violation'; END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='oem_payment_receipts' THEN SELECT order_id INTO oid FROM public.oem_payment_plans WHERE id=NEW.plan_id; ELSE oid:=CASE WHEN TG_OP='DELETE' THEN OLD.order_id ELSE NEW.order_id END; END IF;
 PERFORM 1 FROM public.oem_orders WHERE id=oid FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.oem_settlements WHERE order_id=oid AND state<>'void') THEN RAISE EXCEPTION 'use settlement ledger instead of original financial records' USING ERRCODE='check_violation'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER oem_settlement_payment_plan_freeze BEFORE INSERT OR UPDATE OR DELETE ON public.oem_payment_plans FOR EACH ROW EXECUTE FUNCTION public.block_oem_settlement_original_writes();
CREATE TRIGGER oem_settlement_payment_receipt_freeze BEFORE INSERT ON public.oem_payment_receipts FOR EACH ROW EXECUTE FUNCTION public.block_oem_settlement_original_writes();
CREATE TRIGGER oem_settlement_invoice_freeze BEFORE INSERT ON public.oem_invoices FOR EACH ROW EXECUTE FUNCTION public.block_oem_settlement_original_writes();
CREATE FUNCTION public.block_oem_settlement_fulfillment_writes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM public.oem_orders WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.order_id ELSE NEW.order_id END FOR UPDATE;
 IF public.oem_settlement_has_active(CASE WHEN TG_OP='DELETE' THEN OLD.order_id ELSE NEW.order_id END) THEN RAISE EXCEPTION 'pending settlement holds manufacturing and shipping' USING ERRCODE='check_violation'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER oem_settlement_fulfillment_hold BEFORE INSERT OR UPDATE OR DELETE ON public.oem_order_fulfillment FOR EACH ROW EXECUTE FUNCTION public.block_oem_settlement_fulfillment_writes();
CREATE FUNCTION public.prevent_oem_revision_after_cancel_settlement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prev public.oem_orders%ROWTYPE; latest public.oem_settlements%ROWTYPE;
BEGIN
 PERFORM 1 FROM public.leads WHERE id=NEW.lead_id FOR NO KEY UPDATE;
 SELECT * INTO prev FROM public.oem_orders WHERE lead_id=NEW.lead_id ORDER BY revision DESC LIMIT 1 FOR UPDATE;
 IF FOUND THEN
  -- Active-order issuing remains guarded by the existing application and the
  -- (lead_id,revision) unique constraint. This additive gate targets cancellation.
  IF prev.status<>'cancelled' THEN RETURN NEW; END IF;
  IF prev.accepted_at IS NOT NULL OR public.oem_settlement_net_received(prev.id)<>0 THEN
   SELECT * INTO latest FROM public.oem_settlements WHERE order_id=prev.id AND state<>'void' ORDER BY revision DESC LIMIT 1;
   IF NOT FOUND OR latest.kind<>'cancellation' OR latest.state<>'settled' THEN RAISE EXCEPTION 'cancelled accepted order must be settled before reissue' USING ERRCODE='check_violation'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER oem_settlement_revision_hold BEFORE INSERT ON public.oem_orders FOR EACH ROW EXECUTE FUNCTION public.prevent_oem_revision_after_cancel_settlement();
CREATE OR REPLACE FUNCTION public.enforce_oem_payment_order_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE st text; expected integer; received bigint; latest public.oem_settlements%ROWTYPE;
BEGIN
 IF NEW.status=OLD.status THEN RETURN NEW; END IF;
 IF NEW.status='cancelled' THEN
  IF OLD.status='issued' THEN RETURN NEW; END IF;
  SELECT * INTO latest FROM public.oem_settlements WHERE order_id=OLD.id AND state<>'void' ORDER BY revision DESC LIMIT 1;
  IF OLD.status IN ('cancelled','shipped') OR NOT FOUND OR latest.kind<>'cancellation' OR latest.state NOT IN ('confirmed','settled') THEN RAISE EXCEPTION 'confirmed cancellation settlement required' USING ERRCODE='check_violation'; END IF;
  RETURN NEW;
 END IF;
 IF public.oem_settlement_has_active(OLD.id) THEN RAISE EXCEPTION 'pending settlement holds order progression' USING ERRCODE='check_violation'; END IF;
 IF OLD.status='issued' AND NEW.status='accepted' THEN RETURN NEW; END IF;
 IF OLD.status='accepted' AND NEW.status='deposit_paid' THEN st:='deposit';
 ELSIF OLD.status='deposit_paid' AND NEW.status='in_production' THEN RETURN NEW;
 ELSIF OLD.status='in_production' AND NEW.status='balance_due' THEN RETURN NEW;
 ELSIF OLD.status='balance_due' AND NEW.status='paid' THEN
  SELECT * INTO latest FROM public.oem_settlements WHERE order_id=OLD.id AND state<>'void' ORDER BY revision DESC LIMIT 1;
  IF FOUND THEN
   IF latest.kind='adjustment' AND latest.state='settled' AND latest.target_gross=public.oem_settlement_net_received(OLD.id) THEN RETURN NEW; END IF;
   RAISE EXCEPTION 'settlement is not fully paid' USING ERRCODE='check_violation';
  END IF; st:='balance';
 ELSIF OLD.status='paid' AND NEW.status='shipped' THEN RETURN NEW;
 ELSE RAISE EXCEPTION 'invalid OEM transition % -> %',OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
 SELECT p.expected_amount,coalesce(sum(r.amount),0) INTO expected,received FROM public.oem_payment_plans p LEFT JOIN public.oem_payment_receipts r ON r.plan_id=p.id WHERE p.order_id=NEW.id AND p.stage=st GROUP BY p.expected_amount;
 IF expected IS NULL OR received<>expected THEN RAISE EXCEPTION 'matching original payment is required' USING ERRCODE='check_violation'; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION public.update_oem_settlement(p_order_id uuid,p_settlement_id uuid,p_actor uuid,p_expected_version integer,p_action text,p_request_id uuid,p_input jsonb)
RETURNS TABLE(result text,settlement_id uuid,current_version integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.oem_orders%ROWTYPE; s public.oem_settlements%ROWTYPE; req public.oem_settlement_requests%ROWTYPE;
 before_data jsonb; snap jsonb; v8 bigint; v10 bigint; vn bigint; gross_v bigint; net bigint; rem bigint;
 d date; kind_v text; reason_v text; agreement_v text; stage_v text; dir text; amount_v bigint; counterparty_v text; note_v text;
 is_new boolean; result_v text; revision_v integer;
BEGIN
 IF p_order_id IS NULL OR p_actor IS NULL OR p_expected_version IS NULL OR p_expected_version<0 OR p_request_id IS NULL OR p_action IS NULL OR p_action NOT IN ('save','confirm','void','record_cash') OR p_input IS NULL OR jsonb_typeof(p_input)<>'object' THEN RETURN QUERY SELECT 'invalid',NULL::uuid,NULL::integer; RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.oem_mail_admins WHERE user_id=p_actor) THEN RETURN QUERY SELECT 'forbidden',NULL::uuid,NULL::integer; RETURN; END IF;
 SELECT * INTO o FROM public.oem_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.leads WHERE id=o.lead_id AND page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid) THEN RETURN QUERY SELECT 'not_found',NULL::uuid,NULL::integer; RETURN; END IF;
 SELECT * INTO req FROM public.oem_settlement_requests WHERE request_id=p_request_id;
 IF FOUND THEN
  IF req.order_id=p_order_id AND req.input_settlement_id IS NOT DISTINCT FROM p_settlement_id AND req.action=p_action AND req.input=p_input THEN RETURN QUERY SELECT 'duplicate',req.settlement_id,req.result_version; ELSE RETURN QUERY SELECT 'conflict',NULL::uuid,NULL::integer; END IF; RETURN;
 END IF;
 is_new:=p_settlement_id IS NULL;
 IF is_new THEN
  IF p_action<>'save' OR p_expected_version<>0 THEN RETURN QUERY SELECT 'invalid',NULL::uuid,0; RETURN; END IF;
  IF public.oem_settlement_has_active(o.id) THEN RETURN QUERY SELECT 'conflict',NULL::uuid,0; RETURN; END IF;
 ELSE
  SELECT * INTO s FROM public.oem_settlements WHERE id=p_settlement_id AND order_id=o.id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::uuid,NULL::integer; RETURN; END IF;
  IF s.version<>p_expected_version THEN RETURN QUERY SELECT 'conflict',s.id,s.version; RETURN; END IF;
  IF (p_action='record_cash' AND s.state<>'confirmed') OR (p_action<>'record_cash' AND s.state<>'draft') THEN RETURN QUERY SELECT 'state',s.id,s.version; RETURN; END IF;
 END IF;
 before_data:=CASE WHEN is_new THEN NULL ELSE to_jsonb(s) END; net:=public.oem_settlement_net_received(o.id);
 IF p_action='save' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_input) k WHERE k NOT IN ('kind','materialStage','taxable8','taxable10','nonTaxable','dueDate','reason','agreementNote')) OR NOT(p_input ?& ARRAY['kind','materialStage','taxable8','taxable10','nonTaxable','reason','agreementNote']) THEN RETURN QUERY SELECT 'invalid',s.id,s.version; RETURN; END IF;
  kind_v:=p_input->>'kind'; stage_v:=p_input->>'materialStage';
  IF jsonb_typeof(p_input->'kind') IS DISTINCT FROM 'string' OR jsonb_typeof(p_input->'materialStage') IS DISTINCT FROM 'string' OR kind_v NOT IN ('adjustment','cancellation') OR (kind_v='adjustment' AND stage_v<>'not_applicable') OR (kind_v='cancellation' AND stage_v NOT IN ('before','after')) THEN RETURN QUERY SELECT 'invalid',s.id,s.version; RETURN; END IF;
  IF NOT is_new AND kind_v<>s.kind THEN RETURN QUERY SELECT 'invalid',s.id,s.version; RETURN; END IF;
  IF (kind_v='adjustment' AND o.status NOT IN ('balance_due','paid','shipped')) OR (kind_v='cancellation' AND (o.status NOT IN ('accepted','deposit_paid','in_production','balance_due','paid','cancelled') OR (o.status='cancelled' AND o.accepted_at IS NULL AND net=0))) THEN RETURN QUERY SELECT 'state',s.id,s.version; RETURN; END IF;
  IF jsonb_typeof(p_input->'taxable8') IS DISTINCT FROM 'number' OR jsonb_typeof(p_input->'taxable10') IS DISTINCT FROM 'number' OR jsonb_typeof(p_input->'nonTaxable') IS DISTINCT FROM 'number' OR (p_input->>'taxable8')!~'^[0-9]+$' OR (p_input->>'taxable10')!~'^[0-9]+$' OR (p_input->>'nonTaxable')!~'^[0-9]+$' THEN RETURN QUERY SELECT 'invalid',s.id,s.version; RETURN; END IF;
  v8:=(p_input->>'taxable8')::bigint; v10:=(p_input->>'taxable10')::bigint; vn:=(p_input->>'nonTaxable')::bigint;
  IF v8>100000000 OR v10>100000000 OR vn>100000000 THEN RETURN QUERY SELECT 'invalid',s.id,s.version; RETURN; END IF;
  gross_v:=v8+v10+vn+v8*8/100+v10*10/100;
  IF gross_v>100000000 OR jsonb_typeof(p_input->'reason') IS DISTINCT FROM 'string' OR jsonb_typeof(p_input->'agreementNote') IS DISTINCT FROM 'string' THEN RETURN QUERY SELECT 'invalid',s.id,s.version; RETURN; END IF;
  reason_v:=trim(p_input->>'reason'); agreement_v:=trim(p_input->>'agreementNote');
  IF length(reason_v) NOT BETWEEN 1 AND 2000 OR length(agreement_v) NOT BETWEEN 1 AND 4000 THEN RETURN QUERY SELECT 'invalid',s.id,s.version; RETURN; END IF;
  IF p_input->>'dueDate' IS NOT NULL AND p_input->>'dueDate'<>'' AND (jsonb_typeof(p_input->'dueDate') IS DISTINCT FROM 'string' OR (p_input->>'dueDate')!~'^\d{4}-\d{2}-\d{2}$') THEN RETURN QUERY SELECT 'invalid',s.id,s.version; RETURN; END IF;
  d:=nullif(p_input->>'dueDate','')::date; IF d<DATE '1900-01-01' THEN RETURN QUERY SELECT 'invalid',s.id,s.version; RETURN; END IF;
  IF is_new THEN
   SELECT coalesce(max(revision),0)+1 INTO revision_v FROM public.oem_settlements WHERE order_id=o.id;
   INSERT INTO public.oem_settlements(order_id,revision,kind,material_stage,taxable8,taxable10,non_taxable,due_date,reason,agreement_note,created_by) VALUES(o.id,revision_v,kind_v,stage_v,v8,v10,vn,d,reason_v,agreement_v,p_actor) RETURNING * INTO s;
  ELSE
   UPDATE public.oem_settlements SET material_stage=stage_v,taxable8=v8,taxable10=v10,non_taxable=vn,due_date=d,reason=reason_v,agreement_note=agreement_v,version=version+1,updated_at=now() WHERE id=s.id RETURNING * INTO s;
  END IF; result_v:='saved';
 ELSIF p_action='confirm' THEN
  IF p_input<>'{"customerConfirmed":true}'::jsonb THEN RETURN QUERY SELECT 'invalid',s.id,s.version; RETURN; END IF;
  IF (s.kind='adjustment' AND o.status NOT IN ('balance_due','paid','shipped')) OR (s.kind='cancellation' AND o.status NOT IN ('accepted','deposit_paid','in_production','balance_due','paid','cancelled')) THEN RETURN QUERY SELECT 'state',s.id,s.version; RETURN; END IF;
  snap:=jsonb_build_object('order_number',o.order_number,'status',o.status,'formal_quote_amount',o.formal_quote_amount,'final_amount',o.final_amount,'deposit_amount',o.deposit_amount,'specification',o.specification,'terms_version',o.terms_version,'terms_sha256',o.terms_sha256,'original_received',net,
   'payment_plans',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'stage',p.stage,'expected_amount',p.expected_amount,'due_date',p.due_date)) FROM public.oem_payment_plans p WHERE p.order_id=o.id),'[]'::jsonb),
   'invoice_ids',coalesce((SELECT jsonb_agg(i.id) FROM public.oem_invoices i WHERE i.order_id=o.id),'[]'::jsonb));
  UPDATE public.oem_settlements SET state=CASE WHEN target_gross=net THEN 'settled' ELSE 'confirmed' END,original_snapshot=snap,received_at_confirmation=net,confirmed_at=now(),confirmed_by=p_actor,version=version+1,updated_at=now() WHERE id=s.id RETURNING * INTO s;
  IF s.kind='cancellation' AND o.status<>'cancelled' THEN UPDATE public.oem_orders SET status='cancelled' WHERE id=o.id;
  ELSIF s.kind='adjustment' AND s.state='settled' AND o.status='balance_due' THEN UPDATE public.oem_orders SET status='paid' WHERE id=o.id; END IF; result_v:='confirmed';
 ELSIF p_action='void' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_input) k WHERE k<>'reason') OR jsonb_typeof(p_input->'reason') IS DISTINCT FROM 'string' OR length(trim(p_input->>'reason')) NOT BETWEEN 1 AND 2000 THEN RETURN QUERY SELECT 'invalid',s.id,s.version; RETURN; END IF;
  UPDATE public.oem_settlements SET state='void',void_reason=trim(p_input->>'reason'),version=version+1,updated_at=now() WHERE id=s.id RETURNING * INTO s; result_v:='voided';
 ELSE
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_input) k WHERE k NOT IN ('direction','amount','happenedOn','counterparty','note','bankConfirmed')) OR NOT(p_input ?& ARRAY['direction','amount','happenedOn','counterparty','note','bankConfirmed']) OR p_input->'bankConfirmed' IS DISTINCT FROM 'true'::jsonb THEN RETURN QUERY SELECT 'invalid',s.id,s.version; RETURN; END IF;
  IF jsonb_typeof(p_input->'direction') IS DISTINCT FROM 'string' OR jsonb_typeof(p_input->'amount') IS DISTINCT FROM 'number' OR (p_input->>'amount')!~'^[0-9]+$' OR jsonb_typeof(p_input->'happenedOn') IS DISTINCT FROM 'string' OR (p_input->>'happenedOn')!~'^\d{4}-\d{2}-\d{2}$' OR jsonb_typeof(p_input->'counterparty') IS DISTINCT FROM 'string' OR jsonb_typeof(p_input->'note') IS DISTINCT FROM 'string' THEN RETURN QUERY SELECT 'invalid',s.id,s.version; RETURN; END IF;
  dir:=p_input->>'direction'; amount_v:=(p_input->>'amount')::bigint; d:=(p_input->>'happenedOn')::date; counterparty_v:=trim(p_input->>'counterparty'); note_v:=trim(p_input->>'note'); rem:=s.target_gross-net;
  IF dir NOT IN ('receipt','refund') OR amount_v NOT BETWEEN 1 AND 100000000 OR d<DATE '1900-01-01' OR d>(now() AT TIME ZONE 'Asia/Tokyo')::date OR length(counterparty_v) NOT BETWEEN 1 AND 200 OR length(note_v) NOT BETWEEN 1 AND 2000 OR (dir='receipt' AND (rem<=0 OR amount_v>rem)) OR (dir='refund' AND (rem>=0 OR amount_v>abs(rem))) THEN RETURN QUERY SELECT 'invalid',s.id,s.version; RETURN; END IF;
  INSERT INTO public.oem_settlement_cash(settlement_id,order_id,request_id,direction,amount,happened_on,counterparty,note,confirmed_by) VALUES(s.id,o.id,p_request_id,dir,amount_v,d,counterparty_v,note_v,p_actor);
  net:=public.oem_settlement_net_received(o.id);
  UPDATE public.oem_settlements SET state=CASE WHEN target_gross=net THEN 'settled' ELSE 'confirmed' END,version=version+1,updated_at=now() WHERE id=s.id RETURNING * INTO s;
  IF s.state='settled' AND s.kind='adjustment' AND o.status='balance_due' THEN UPDATE public.oem_orders SET status='paid' WHERE id=o.id; END IF; result_v:='recorded';
 END IF;
 INSERT INTO public.oem_settlement_requests(request_id,order_id,settlement_id,input_settlement_id,action,input,result,result_version,actor) VALUES(p_request_id,o.id,s.id,p_settlement_id,p_action,p_input,result_v,s.version,p_actor);
 INSERT INTO public.oem_lead_events(lead_id,event_type,details,created_by) VALUES(o.lead_id,CASE p_action WHEN 'confirm' THEN 'settlement_confirmed' WHEN 'void' THEN 'settlement_voided' WHEN 'record_cash' THEN 'settlement_cash_recorded' ELSE 'settlement_saved' END,jsonb_build_object('order_id',o.id,'settlement_id',s.id,'request_id',p_request_id,'before',before_data,'after',to_jsonb(s),'direction',dir,'amount',amount_v),p_actor);
 RETURN QUERY SELECT result_v,s.id,s.version;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range OR invalid_text_representation THEN RETURN QUERY SELECT 'invalid',p_settlement_id,NULL::integer;
END $$;

CREATE FUNCTION public.get_oem_settlement_data(p_order_id uuid,p_actor uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE orig bigint; sr bigint; sf bigint; n bigint; latest public.oem_settlements%ROWTYPE; hist jsonb; cash_rows jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.oem_mail_admins WHERE user_id=p_actor) OR NOT EXISTS(SELECT 1 FROM public.oem_orders o JOIN public.leads l ON l.id=o.lead_id WHERE o.id=p_order_id AND l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid) THEN RETURN NULL; END IF;
 SELECT coalesce(sum(r.amount),0) INTO orig FROM public.oem_payment_receipts r JOIN public.oem_payment_plans p ON p.id=r.plan_id WHERE p.order_id=p_order_id;
 SELECT coalesce(sum(amount) FILTER(WHERE direction='receipt'),0),coalesce(sum(amount) FILTER(WHERE direction='refund'),0) INTO sr,sf FROM public.oem_settlement_cash WHERE order_id=p_order_id;
 n:=orig+sr-sf; SELECT * INTO latest FROM public.oem_settlements WHERE order_id=p_order_id AND state<>'void' ORDER BY revision DESC LIMIT 1;
 SELECT coalesce(jsonb_agg(to_jsonb(x)-'created_by' ORDER BY x.revision DESC),'[]'::jsonb) INTO hist FROM (SELECT * FROM public.oem_settlements WHERE order_id=p_order_id ORDER BY revision DESC LIMIT 50) x;
 SELECT coalesce(jsonb_agg(to_jsonb(x)-ARRAY['order_id','request_id'] ORDER BY x.created_at DESC),'[]'::jsonb) INTO cash_rows FROM (SELECT * FROM public.oem_settlement_cash WHERE order_id=p_order_id ORDER BY created_at DESC LIMIT 100) x;
 RETURN jsonb_build_object('latest',CASE WHEN latest.id IS NULL THEN NULL ELSE to_jsonb(latest)-'created_by' END,'history',hist,'cash',cash_rows,'originalReceived',orig,'settlementReceived',sr,'settlementRefunded',sf,'netReceived',n,'remaining',CASE WHEN latest.id IS NULL THEN NULL ELSE latest.target_gross-n END,'historyHasMore',(SELECT count(*)>50 FROM public.oem_settlements WHERE order_id=p_order_id),'cashHasMore',(SELECT count(*)>100 FROM public.oem_settlement_cash WHERE order_id=p_order_id));
END $$;
CREATE FUNCTION public.get_oem_settlement_alerts(p_limit integer DEFAULT 50,p_offset integer DEFAULT 0)
RETURNS TABLE(order_id uuid,lead_id uuid,order_number text,company_name text,settlement_id uuid,kind text,target_gross bigint,net_received bigint,remaining bigint,due_date date,total_count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 WITH c AS (
  SELECT o.id order_id,o.lead_id,o.order_number,l.company_name,s.id settlement_id,
   CASE WHEN s.id IS NULL THEN 'unconfigured' WHEN s.state='draft' THEN 'draft' WHEN s.target_gross<public.oem_settlement_net_received(o.id) THEN 'refund' WHEN s.due_date<(now() AT TIME ZONE 'Asia/Tokyo')::date THEN 'overdue' ELSE 'collect' END kind,
   s.target_gross,public.oem_settlement_net_received(o.id) net_received,s.target_gross-public.oem_settlement_net_received(o.id) remaining,s.due_date
  FROM public.oem_orders o JOIN public.leads l ON l.id=o.lead_id AND l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid
  LEFT JOIN LATERAL (SELECT * FROM public.oem_settlements WHERE order_id=o.id AND state<>'void' ORDER BY revision DESC LIMIT 1) s ON true
  WHERE s.state IN ('draft','confirmed') OR (o.status='cancelled' AND (o.accepted_at IS NOT NULL OR public.oem_settlement_net_received(o.id)<>0) AND s.id IS NULL)
 ), numbered AS (SELECT c.*,count(*) OVER() total_count FROM c)
 SELECT * FROM numbered ORDER BY CASE kind WHEN 'refund' THEN 0 WHEN 'overdue' THEN 1 WHEN 'unconfigured' THEN 2 ELSE 3 END,due_date NULLS LAST,order_id LIMIT least(greatest(coalesce(p_limit,50),1),50) OFFSET greatest(coalesce(p_offset,0),0)
$$;
-- Preserve original alert semantics; omit orders with a superseding settlement.
CREATE OR REPLACE FUNCTION public.get_oem_payment_alerts(p_limit integer DEFAULT 100,p_offset integer DEFAULT 0)
RETURNS TABLE(order_id uuid,lead_id uuid,order_number text,company_name text,stage text,expected_amount integer,received_amount bigint,due_date date,kind text,total_count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
WITH candidates AS (
 SELECT o.id order_id,o.lead_id,o.order_number,l.company_name,p.stage,p.expected_amount,p.due_date,coalesce(sum(r.amount),0)::bigint received_amount,
 CASE WHEN p.id IS NULL THEN 'unconfigured' WHEN coalesce(sum(r.amount),0)>p.expected_amount THEN 'excess' WHEN p.due_date<(now() AT TIME ZONE 'Asia/Tokyo')::date AND coalesce(sum(r.amount),0)<p.expected_amount THEN 'overdue' ELSE 'waiting' END kind
 FROM public.oem_orders o JOIN public.leads l ON l.id=o.lead_id AND l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid
 LEFT JOIN public.oem_payment_plans p ON p.order_id=o.id AND (p.stage=CASE WHEN o.status='accepted' THEN 'deposit' WHEN o.status='balance_due' THEN 'balance' ELSE p.stage END)
 LEFT JOIN public.oem_payment_receipts r ON r.plan_id=p.id
 WHERE o.status IN ('accepted','deposit_paid','in_production','balance_due','paid','shipped') AND NOT EXISTS(SELECT 1 FROM public.oem_settlements s WHERE s.order_id=o.id AND s.state<>'void')
 GROUP BY o.id,o.lead_id,o.order_number,l.company_name,p.id,p.stage,p.expected_amount,p.due_date
 HAVING (p.id IS NULL AND o.status IN ('accepted','balance_due')) OR coalesce(sum(r.amount),0)>p.expected_amount OR o.status IN ('accepted','balance_due')
), numbered AS (SELECT c.*,count(*) OVER() total_count FROM candidates c)
SELECT order_id,lead_id,order_number,company_name,coalesce(stage,CASE WHEN EXISTS(SELECT 1 FROM public.oem_orders oo WHERE oo.id=numbered.order_id AND oo.status='accepted') THEN 'deposit' ELSE 'balance' END),expected_amount,received_amount,due_date,kind,total_count FROM numbered ORDER BY CASE kind WHEN 'excess' THEN 0 WHEN 'overdue' THEN 1 WHEN 'unconfigured' THEN 2 ELSE 3 END,due_date NULLS LAST,order_id LIMIT greatest(0,least(coalesce(p_limit,100),100)) OFFSET greatest(0,coalesce(p_offset,0))
$$;
REVOKE ALL ON FUNCTION public.oem_settlement_has_active(uuid),public.oem_settlement_net_received(uuid),public.update_oem_settlement(uuid,uuid,uuid,integer,text,uuid,jsonb),public.get_oem_settlement_data(uuid,uuid),public.get_oem_settlement_alerts(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.oem_settlement_has_active(uuid),public.oem_settlement_net_received(uuid),public.update_oem_settlement(uuid,uuid,uuid,integer,text,uuid,jsonb),public.get_oem_settlement_data(uuid,uuid),public.get_oem_settlement_alerts(integer,integer) TO service_role;
COMMIT;
