-- OEM invoice revisions and signed delivery/receipt documents.
-- Originals remain immutable snapshots; lifecycle metadata is the only mutable part.
BEGIN;

ALTER TABLE public.oem_invoices
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active' CHECK (lifecycle_status IN ('active','superseded','void')),
  ADD COLUMN IF NOT EXISTS void_reason text NOT NULL DEFAULT '' CHECK (length(void_reason) <= 2000),
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES public.oem_invoices(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS revision_of uuid REFERENCES public.oem_invoices(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS revision_no integer NOT NULL DEFAULT 1 CHECK (revision_no > 0);
ALTER TABLE public.oem_invoices DROP CONSTRAINT IF EXISTS oem_invoices_order_id_stage_key;
CREATE UNIQUE INDEX IF NOT EXISTS oem_invoices_one_active_stage_idx ON public.oem_invoices(order_id,stage) WHERE lifecycle_status='active';
CREATE INDEX IF NOT EXISTS oem_invoices_revision_idx ON public.oem_invoices(revision_of,revision_no);

CREATE OR REPLACE FUNCTION public.prevent_oem_invoice_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.lifecycle_status IN ('superseded','void') AND NEW.id=OLD.id AND NEW.order_id=OLD.order_id AND NEW.lead_id=OLD.lead_id AND NEW.plan_id=OLD.plan_id AND NEW.stage=OLD.stage AND NEW.invoice_number=OLD.invoice_number AND NEW.snapshot=OLD.snapshot AND NEW.input_hash=OLD.input_hash AND NEW.request_id=OLD.request_id AND NEW.send_request_id=OLD.send_request_id AND NEW.created_by=OLD.created_by AND NEW.issued_at=OLD.issued_at AND NEW.revision_of IS NOT DISTINCT FROM OLD.revision_of AND NEW.revision_no=OLD.revision_no THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.id=OLD.id AND NEW.order_id=OLD.order_id AND NEW.lead_id=OLD.lead_id
     AND NEW.plan_id=OLD.plan_id AND NEW.stage=OLD.stage AND NEW.invoice_number=OLD.invoice_number
     AND NEW.snapshot=OLD.snapshot AND NEW.input_hash=OLD.input_hash AND NEW.request_id=OLD.request_id
     AND NEW.send_request_id=OLD.send_request_id AND NEW.created_by=OLD.created_by AND NEW.issued_at=OLD.issued_at
     AND NEW.revision_of IS NOT DISTINCT FROM OLD.revision_of AND NEW.revision_no=OLD.revision_no
     AND NEW.lifecycle_status=OLD.lifecycle_status AND NEW.mail_status IS DISTINCT FROM OLD.mail_status THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.id=OLD.id AND NEW.order_id=OLD.order_id AND NEW.lead_id=OLD.lead_id
     AND NEW.plan_id=OLD.plan_id AND NEW.stage=OLD.stage AND NEW.invoice_number=OLD.invoice_number
     AND NEW.snapshot=OLD.snapshot AND NEW.input_hash=OLD.input_hash AND NEW.request_id=OLD.request_id
     AND NEW.send_request_id=OLD.send_request_id AND NEW.created_by=OLD.created_by AND NEW.issued_at=OLD.issued_at
     AND NEW.revision_of IS NOT DISTINCT FROM OLD.revision_of AND NEW.revision_no=OLD.revision_no
     AND coalesce(OLD.lifecycle_status,'active')='active' AND NEW.lifecycle_status IN ('superseded','void') THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.id=OLD.id AND NEW.order_id=OLD.order_id AND NEW.lead_id=OLD.lead_id
     AND NEW.plan_id=OLD.plan_id AND NEW.stage=OLD.stage AND NEW.invoice_number=OLD.invoice_number
     AND NEW.snapshot=OLD.snapshot AND NEW.input_hash=OLD.input_hash AND NEW.request_id=OLD.request_id
     AND NEW.send_request_id=OLD.send_request_id AND NEW.created_by=OLD.created_by AND NEW.issued_at=OLD.issued_at
     AND NEW.revision_of IS NOT DISTINCT FROM OLD.revision_of AND NEW.revision_no=OLD.revision_no
     AND NEW.lifecycle_status=OLD.lifecycle_status AND NEW.void_reason=OLD.void_reason
     AND NEW.voided_at=OLD.voided_at AND NEW.voided_by=OLD.voided_by AND NEW.superseded_by=OLD.superseded_by THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'OEM invoices are immutable' USING ERRCODE='read_only_sql_transaction';
END $$;
DROP TRIGGER IF EXISTS oem_invoices_immutable ON public.oem_invoices;
CREATE TRIGGER oem_invoices_immutable BEFORE UPDATE OR DELETE ON public.oem_invoices FOR EACH ROW EXECUTE FUNCTION public.prevent_oem_invoice_mutation();

CREATE TABLE IF NOT EXISTS public.oem_invoice_revision_requests (
  request_id uuid PRIMARY KEY, invoice_id uuid NOT NULL REFERENCES public.oem_invoices(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK(action IN ('correct','cancel_reissue','void')),
  result text NOT NULL, result_invoice_id uuid REFERENCES public.oem_invoices(id) ON DELETE RESTRICT,
  actor uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT, input jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.oem_invoice_revision_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oem_invoice_revision_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.oem_invoice_revision_requests TO service_role;

CREATE TABLE IF NOT EXISTS public.oem_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.oem_orders(id) ON DELETE RESTRICT,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  document_type text NOT NULL CHECK(document_type IN ('delivery_note','receipt')),
  document_number text NOT NULL UNIQUE, snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
  input_hash text NOT NULL CHECK(input_hash ~ '^[0-9a-f]{64}$'), request_id uuid NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id,document_type)
);
CREATE INDEX IF NOT EXISTS oem_documents_order_idx ON public.oem_documents(order_id,created_at DESC);
CREATE INDEX IF NOT EXISTS oem_documents_lead_idx ON public.oem_documents(lead_id,created_at DESC);
ALTER TABLE public.oem_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oem_documents FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.oem_documents TO service_role;
CREATE TABLE IF NOT EXISTS public.oem_document_requests (
  request_id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES public.oem_orders(id) ON DELETE RESTRICT,
  document_type text NOT NULL, document_id uuid REFERENCES public.oem_documents(id) ON DELETE RESTRICT,
  actor uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT, input jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.oem_document_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oem_document_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.oem_document_requests TO service_role;
CREATE OR REPLACE FUNCTION public.prevent_oem_document_request_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'OEM document request history is append-only' USING ERRCODE='read_only_sql_transaction'; END $$;
DROP TRIGGER IF EXISTS oem_document_requests_immutable ON public.oem_document_requests;
CREATE TRIGGER oem_document_requests_immutable BEFORE UPDATE OR DELETE ON public.oem_document_requests FOR EACH ROW EXECUTE FUNCTION public.prevent_oem_document_request_mutation();
CREATE OR REPLACE FUNCTION public.prevent_oem_invoice_revision_request_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'OEM invoice revision history is append-only' USING ERRCODE='read_only_sql_transaction'; END $$;
DROP TRIGGER IF EXISTS oem_invoice_revision_requests_immutable ON public.oem_invoice_revision_requests;
CREATE TRIGGER oem_invoice_revision_requests_immutable BEFORE UPDATE OR DELETE ON public.oem_invoice_revision_requests FOR EACH ROW EXECUTE FUNCTION public.prevent_oem_invoice_revision_request_mutation();
REVOKE UPDATE ON public.oem_invoices FROM service_role;
GRANT UPDATE(mail_status) ON public.oem_invoices TO service_role;
CREATE OR REPLACE FUNCTION public.prevent_oem_document_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'OEM documents are immutable' USING ERRCODE='read_only_sql_transaction'; END $$;
DROP TRIGGER IF EXISTS oem_documents_immutable ON public.oem_documents;
CREATE TRIGGER oem_documents_immutable BEFORE UPDATE OR DELETE ON public.oem_documents FOR EACH ROW EXECUTE FUNCTION public.prevent_oem_document_mutation();

CREATE OR REPLACE FUNCTION public.correct_oem_invoice(p_invoice_id uuid,p_request_id uuid,p_input jsonb,p_actor uuid)
RETURNS TABLE(result text,invoice_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.oem_invoices%ROWTYPE; n uuid; h text; status text; old_found boolean; scope_found boolean;
BEGIN
 IF p_invoice_id IS NULL OR p_request_id IS NULL OR p_actor IS NULL OR p_input IS NULL OR jsonb_typeof(p_input)<>'object' THEN RETURN QUERY SELECT 'invalid',NULL::uuid; RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.oem_mail_admins WHERE user_id=p_actor) THEN RETURN QUERY SELECT 'forbidden',NULL::uuid; RETURN; END IF;
 PERFORM 1 FROM public.oem_orders JOIN public.leads ON leads.id=oem_orders.lead_id AND leads.page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid WHERE oem_orders.id=(SELECT order_id FROM public.oem_invoices WHERE id=p_invoice_id) FOR UPDATE;
 scope_found := FOUND;
 SELECT * INTO old FROM public.oem_invoices WHERE id=p_invoice_id FOR UPDATE;
 old_found := FOUND;
 SELECT r.result,r.result_invoice_id INTO status,n FROM public.oem_invoice_revision_requests r WHERE r.request_id=p_request_id;
 IF FOUND THEN IF EXISTS(SELECT 1 FROM public.oem_invoice_revision_requests r WHERE r.request_id=p_request_id AND (r.invoice_id<>p_invoice_id OR r.actor<>p_actor OR r.action<>'correct' OR r.input<>p_input)) THEN RETURN QUERY SELECT 'conflict',NULL::uuid; ELSE RETURN QUERY SELECT status,n; END IF; RETURN; END IF;
 IF NOT scope_found OR NOT old_found OR old.lifecycle_status<>'active' THEN RETURN QUERY SELECT 'not_found',NULL::uuid; RETURN; END IF;
 IF old.mail_status IN ('pending','sending','sent','unknown') OR EXISTS(SELECT 1 FROM public.oem_conversation_messages m WHERE m.request_id=old.send_request_id AND m.status IN ('pending','sending','sent','unknown')) THEN RETURN QUERY SELECT 'mail_race',NULL::uuid; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.oem_payment_receipts WHERE plan_id=old.plan_id) OR EXISTS(SELECT 1 FROM public.oem_settlements WHERE order_id=old.order_id AND state<>'void') THEN RETURN QUERY SELECT 'financially_locked',NULL::uuid; RETURN; END IF;
 IF coalesce(p_input->>'stage','')<>old.stage OR coalesce((p_input->>'amountDue')::integer,-1) <> (old.snapshot->>'amountDue')::integer THEN RETURN QUERY SELECT 'amount_locked',NULL::uuid; RETURN; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_input) k WHERE k NOT IN ('stage','amountDue','description','dueDate','issuer')) THEN RETURN QUERY SELECT 'invalid',NULL::uuid; RETURN; END IF;
 IF p_input ? 'description' AND (jsonb_typeof(p_input->'description')<>'string' OR length(trim(p_input->>'description')) NOT BETWEEN 1 AND 2000) THEN RETURN QUERY SELECT 'invalid',NULL::uuid; RETURN; END IF;
 IF p_input ? 'dueDate' AND (jsonb_typeof(p_input->'dueDate')<>'string' OR (p_input->>'dueDate') !~ '^\d{4}-\d{2}-\d{2}$') THEN RETURN QUERY SELECT 'invalid',NULL::uuid; RETURN; END IF;
 IF p_input ? 'issuer' AND jsonb_typeof(p_input->'issuer')<>'object' THEN RETURN QUERY SELECT 'invalid',NULL::uuid; RETURN; END IF;
 h := encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
 UPDATE public.oem_invoices SET lifecycle_status='superseded',void_reason='訂正により差替',voided_at=now(),voided_by=p_actor WHERE id=old.id;
 INSERT INTO public.oem_invoices(order_id,lead_id,plan_id,stage,invoice_number,snapshot,input_hash,request_id,send_request_id,created_by,revision_of,revision_no)
   VALUES(old.order_id,old.lead_id,old.plan_id,old.stage,'INV-'||to_char((now() AT TIME ZONE 'Asia/Tokyo')::date,'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),old.snapshot || jsonb_strip_nulls(jsonb_build_object('description',coalesce(p_input->'description',old.snapshot->'description'),'dueDate',coalesce(p_input->'dueDate',old.snapshot->'dueDate'),'issuer',coalesce(p_input->'issuer',old.snapshot->'issuer'))),h,gen_random_uuid(),gen_random_uuid(),p_actor,old.id,old.revision_no+1) RETURNING id INTO n;
 UPDATE public.oem_invoices SET superseded_by=n WHERE id=old.id;
 INSERT INTO public.oem_invoice_revision_requests VALUES(p_request_id,old.id,'correct','corrected',n,p_actor,p_input,now());
 RETURN QUERY SELECT 'corrected',n;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN QUERY SELECT 'invalid',NULL::uuid;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_reissue_oem_invoice(p_invoice_id uuid,p_request_id uuid,p_reason text,p_actor uuid)
RETURNS TABLE(result text,invoice_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.oem_invoices%ROWTYPE; n uuid; status text; h text; old_found boolean; scope_found boolean;
BEGIN
 IF p_invoice_id IS NULL OR p_request_id IS NULL OR p_actor IS NULL OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 1 AND 2000 THEN RETURN QUERY SELECT 'invalid',NULL::uuid; RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.oem_mail_admins WHERE user_id=p_actor) THEN RETURN QUERY SELECT 'forbidden',NULL::uuid; RETURN; END IF;
 PERFORM 1 FROM public.oem_orders JOIN public.leads ON leads.id=oem_orders.lead_id AND leads.page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid WHERE oem_orders.id=(SELECT order_id FROM public.oem_invoices WHERE id=p_invoice_id) FOR UPDATE;
 scope_found := FOUND;
 SELECT * INTO old FROM public.oem_invoices WHERE id=p_invoice_id FOR UPDATE;
 old_found := FOUND;
 SELECT r.result,r.result_invoice_id INTO status,n FROM public.oem_invoice_revision_requests r WHERE r.request_id=p_request_id; IF FOUND THEN IF EXISTS(SELECT 1 FROM public.oem_invoice_revision_requests r WHERE r.request_id=p_request_id AND (r.invoice_id<>p_invoice_id OR r.actor<>p_actor OR r.action<>'cancel_reissue' OR r.input->>'reason'<>trim(p_reason))) THEN RETURN QUERY SELECT 'conflict',NULL::uuid; ELSE RETURN QUERY SELECT status,n; END IF; RETURN; END IF;
 IF NOT scope_found OR NOT old_found OR old.lifecycle_status<>'active' THEN RETURN QUERY SELECT 'not_found',NULL::uuid; RETURN; END IF;
 IF old.mail_status IN ('pending','sending','unknown') OR EXISTS(SELECT 1 FROM public.oem_conversation_messages m WHERE m.request_id=old.send_request_id AND m.status IN ('pending','sending','unknown')) OR EXISTS(SELECT 1 FROM public.oem_settlements WHERE order_id=old.order_id AND state<>'void') OR EXISTS(SELECT 1 FROM public.oem_payment_receipts WHERE plan_id=old.plan_id) THEN RETURN QUERY SELECT 'financially_locked',NULL::uuid; RETURN; END IF;
 h := encode(sha256(convert_to(old.snapshot::text||E'\n'||p_reason,'UTF8')),'hex');
 UPDATE public.oem_invoices SET lifecycle_status='void',void_reason=trim(p_reason),voided_at=now(),voided_by=p_actor WHERE id=old.id;
 INSERT INTO public.oem_invoices(order_id,lead_id,plan_id,stage,invoice_number,snapshot,input_hash,request_id,send_request_id,created_by,revision_of,revision_no)
   VALUES(old.order_id,old.lead_id,old.plan_id,old.stage,'INV-'||to_char((now() AT TIME ZONE 'Asia/Tokyo')::date,'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),old.snapshot,h,gen_random_uuid(),gen_random_uuid(),p_actor,old.id,old.revision_no+1) RETURNING id INTO n;
 UPDATE public.oem_invoices SET superseded_by=n WHERE id=old.id;
 INSERT INTO public.oem_invoice_revision_requests VALUES(p_request_id,old.id,'cancel_reissue','reissued',n,p_actor,jsonb_build_object('reason',trim(p_reason)),now());
 RETURN QUERY SELECT 'reissued',n;
END $$;

CREATE OR REPLACE FUNCTION public.issue_oem_document(p_order_id uuid,p_document_type text,p_request_id uuid,p_actor uuid,p_input jsonb)
RETURNS TABLE(result text,document_id uuid,snapshot jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.oem_orders%ROWTYPE; l public.leads%ROWTYPE; f public.oem_order_fulfillment%ROWTYPE; d public.oem_documents%ROWTYPE; s jsonb; h text; settlement public.oem_settlements%ROWTYPE; received bigint; gross bigint; request public.oem_document_requests%ROWTYPE;
BEGIN
 IF p_document_type IS NULL OR p_document_type NOT IN ('delivery_note','receipt') OR p_request_id IS NULL OR p_actor IS NULL OR p_input IS NULL OR jsonb_typeof(p_input)<>'object' THEN RETURN QUERY SELECT 'invalid',NULL::uuid,NULL::jsonb; RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.oem_mail_admins WHERE user_id=p_actor) THEN RETURN QUERY SELECT 'forbidden',NULL::uuid,NULL::jsonb; RETURN; END IF;
 SELECT * INTO o FROM public.oem_orders WHERE id=p_order_id FOR UPDATE; IF NOT FOUND OR o.status IN ('cancelled','issued','accepted') THEN RETURN QUERY SELECT 'state',NULL::uuid,NULL::jsonb; RETURN; END IF;
 SELECT * INTO l FROM public.leads WHERE id=o.lead_id AND page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid; IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::uuid,NULL::jsonb; RETURN; END IF;
 SELECT * INTO request FROM public.oem_document_requests WHERE request_id=p_request_id;
 IF FOUND THEN
  IF request.order_id<>p_order_id OR request.document_type<>p_document_type OR request.actor<>p_actor OR request.input IS DISTINCT FROM p_input THEN RETURN QUERY SELECT 'conflict',NULL::uuid,NULL::jsonb; RETURN; END IF;
  SELECT * INTO d FROM public.oem_documents WHERE id=request.document_id;
  RETURN QUERY SELECT 'duplicate',d.id,d.snapshot; RETURN;
 END IF;
 SELECT * INTO d FROM public.oem_documents WHERE order_id=p_order_id AND document_type=p_document_type;
 IF FOUND THEN INSERT INTO public.oem_document_requests VALUES(p_request_id,o.id,p_document_type,d.id,p_actor,p_input,now()); RETURN QUERY SELECT 'duplicate',d.id,d.snapshot; RETURN; END IF;
 SELECT * INTO f FROM public.oem_order_fulfillment WHERE order_id=o.id; IF NOT FOUND OR f.completed_quantity IS NULL OR f.completed_on IS NULL THEN RETURN QUERY SELECT 'evidence_required',NULL::uuid,NULL::jsonb; RETURN; END IF;
 SELECT * INTO settlement FROM public.oem_settlements WHERE order_id=o.id AND state<>'void' ORDER BY revision DESC LIMIT 1;
 IF settlement.id IS NOT NULL AND settlement.state<>'settled' THEN RETURN QUERY SELECT 'settlement_required',NULL::uuid,NULL::jsonb; RETURN; END IF;
 IF p_document_type='delivery_note' AND (f.shipped_on IS NULL OR o.status<>'shipped') THEN RETURN QUERY SELECT 'evidence_required',NULL::uuid,NULL::jsonb; RETURN; END IF;
 IF p_document_type='receipt' AND o.status NOT IN ('paid','shipped') THEN RETURN QUERY SELECT 'payment_required',NULL::uuid,NULL::jsonb; RETURN; END IF;
 IF p_document_type='receipt' AND NOT EXISTS(SELECT 1 FROM public.oem_payment_receipts r JOIN public.oem_payment_plans p ON p.id=r.plan_id WHERE p.order_id=o.id) THEN RETURN QUERY SELECT 'payment_required',NULL::uuid,NULL::jsonb; RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.oem_invoices i WHERE i.order_id=o.id AND i.lifecycle_status='active' AND jsonb_typeof(i.snapshot->'issuer')='object' AND length(trim(coalesce(i.snapshot->'issuer'->>'name','')))>0) THEN RETURN QUERY SELECT 'issuer_required',NULL::uuid,NULL::jsonb; RETURN; END IF;
 received:=public.oem_settlement_net_received(o.id);
 IF settlement.id IS NOT NULL THEN gross:=settlement.target_gross; ELSE SELECT (i.snapshot->>'grossTotal')::bigint INTO gross FROM public.oem_invoices i WHERE i.order_id=o.id AND i.lifecycle_status='active' AND i.stage='balance' AND (i.snapshot->>'grossTotal') ~ '^[0-9]+$' ORDER BY i.issued_at DESC,i.id DESC LIMIT 1; END IF;
 IF p_document_type='receipt' AND (gross IS NULL OR received<=0 OR received<>gross) THEN RETURN QUERY SELECT 'payment_required',NULL::uuid,NULL::jsonb; RETURN; END IF;
 s := jsonb_build_object('version',1,'orderNumber',o.order_number,'companyName',l.company_name,'contactName',l.contact_name,'email',l.email,'completedQuantity',f.completed_quantity,'quantityUnit',coalesce(f.quantity_unit,'個'),'completedOn',f.completed_on,'shippedOn',f.shipped_on,'carrier',f.carrier,'trackingNumber',f.tracking_number,'issuer',coalesce((SELECT i.snapshot->'issuer' FROM public.oem_invoices i WHERE i.order_id=o.id AND i.lifecycle_status='active' ORDER BY i.issued_at DESC LIMIT 1),'{}'::jsonb),'issuedDate',(now() AT TIME ZONE 'Asia/Tokyo')::date,'source','immutable_order_fulfillment');
 s:=s||jsonb_build_object('demo',coalesce(o.quote_snapshot->'demo','false'::jsonb));
 IF p_document_type='receipt' THEN s:=s||jsonb_build_object('receivedTotal',received,'settlementId',settlement.id,'paidEntries',(
  SELECT coalesce(jsonb_agg(jsonb_build_object('amount',e.amount,'paidOn',e.happened_on,'payerName',e.payer_name,'direction',e.direction) ORDER BY e.happened_on,e.id),'[]'::jsonb) FROM (
   SELECT r.id,r.amount,r.paid_on AS happened_on,r.payer_name,'receipt'::text AS direction FROM public.oem_payment_receipts r JOIN public.oem_payment_plans p ON p.id=r.plan_id WHERE p.order_id=o.id
   UNION ALL SELECT c.id,c.amount,c.happened_on,c.counterparty,c.direction FROM public.oem_settlement_cash c WHERE c.order_id=o.id
  ) e)); END IF;
 h := encode(sha256(convert_to(s::text,'UTF8')),'hex');
 INSERT INTO public.oem_documents(order_id,lead_id,document_type,document_number,snapshot,input_hash,request_id,created_by) VALUES(o.id,o.lead_id,p_document_type,upper(CASE WHEN p_document_type='receipt' THEN 'REC-' ELSE 'DEL-' END)||to_char((now() AT TIME ZONE 'Asia/Tokyo')::date,'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),s,h,p_request_id,p_actor) RETURNING * INTO d;
 INSERT INTO public.oem_document_requests VALUES(p_request_id,o.id,p_document_type,d.id,p_actor,p_input,now());
 RETURN QUERY SELECT 'issued',d.id,d.snapshot;
END $$;

CREATE OR REPLACE FUNCTION public.reserve_oem_invoice_send(p_invoice_id uuid,p_actor uuid)
RETURNS TABLE(result text,send_request_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.oem_invoices%ROWTYPE; scoped boolean; order_status text;
BEGIN
 IF p_invoice_id IS NULL OR p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.oem_mail_admins WHERE user_id=p_actor) THEN RETURN QUERY SELECT 'forbidden',NULL::uuid; RETURN; END IF;
 SELECT order_id INTO i.order_id FROM public.oem_invoices WHERE id=p_invoice_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::uuid; RETURN; END IF;
 PERFORM 1 FROM public.oem_orders o JOIN public.leads l ON l.id=o.lead_id AND l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid WHERE o.id=i.order_id FOR UPDATE; scoped:=FOUND;
 SELECT status INTO order_status FROM public.oem_orders WHERE id=i.order_id;
 SELECT * INTO i FROM public.oem_invoices WHERE id=p_invoice_id FOR UPDATE;
 IF NOT scoped OR i.lifecycle_status<>'active' THEN RETURN QUERY SELECT 'not_found',NULL::uuid; RETURN; END IF;
 IF (i.stage='deposit' AND order_status<>'accepted') OR (i.stage='balance' AND order_status<>'balance_due') THEN RETURN QUERY SELECT 'state',NULL::uuid; RETURN; END IF;
 IF i.mail_status IN ('pending','sending','sent','unknown') OR EXISTS(SELECT 1 FROM public.oem_conversation_messages m WHERE m.request_id=i.send_request_id AND m.status IN ('pending','sending','sent','unknown')) THEN RETURN QUERY SELECT 'already_attempted',i.send_request_id; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.oem_payment_receipts WHERE plan_id=i.plan_id) OR EXISTS(SELECT 1 FROM public.oem_settlements WHERE order_id=i.order_id AND state<>'void') THEN RETURN QUERY SELECT 'financially_locked',NULL::uuid; RETURN; END IF;
 UPDATE public.oem_invoices SET mail_status='pending' WHERE id=i.id;
 RETURN QUERY SELECT 'reserved',i.send_request_id;
END $$;

REVOKE ALL ON FUNCTION public.correct_oem_invoice(uuid,uuid,jsonb,uuid),public.cancel_reissue_oem_invoice(uuid,uuid,text,uuid),public.issue_oem_document(uuid,text,uuid,uuid,jsonb),public.reserve_oem_invoice_send(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.correct_oem_invoice(uuid,uuid,jsonb,uuid),public.cancel_reissue_oem_invoice(uuid,uuid,text,uuid),public.issue_oem_document(uuid,text,uuid,uuid,jsonb),public.reserve_oem_invoice_send(uuid,uuid) TO service_role;

-- Re-declare issuance after the revision columns exist. The active-stage predicate
-- prevents superseded history from producing false duplicate/conflict responses.
CREATE OR REPLACE FUNCTION public.issue_oem_invoice(p_order_id uuid,p_request_id uuid,p_input_hash text,p_stage text,p_due_date date,p_description text,p_taxable8 integer,p_taxable10 integer,p_non_taxable integer,p_issuer jsonb,p_actor uuid)
RETURNS TABLE(result text,invoice_id uuid,invoice_number text,send_request_id uuid,snapshot jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.oem_orders%ROWTYPE; l public.leads%ROWTYPE; p public.oem_payment_plans%ROWTYPE; old public.oem_invoices%ROWTYPE; snap jsonb; n text; sid uuid; dep bigint; net bigint; gross bigint; due bigint; t8 integer; t10 integer;
BEGIN
 IF p_stage NOT IN ('deposit','balance') OR p_request_id IS NULL OR p_input_hash IS NULL OR p_input_hash !~ '^[0-9a-f]{64}$' OR p_due_date IS NULL OR length(trim(coalesce(p_description,''))) NOT BETWEEN 1 AND 2000 OR p_taxable8 IS NULL OR p_taxable10 IS NULL OR p_non_taxable IS NULL OR p_taxable8<0 OR p_taxable10<0 OR p_non_taxable<0 OR p_issuer IS NULL OR jsonb_typeof(p_issuer)<>'object' THEN RETURN QUERY SELECT 'invalid',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.oem_mail_admins WHERE user_id=p_actor) THEN RETURN QUERY SELECT 'forbidden',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; RETURN; END IF;
 SELECT * INTO o FROM public.oem_orders WHERE id=p_order_id FOR UPDATE; IF NOT FOUND THEN RETURN QUERY SELECT 'state',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; RETURN; END IF;
 SELECT * INTO l FROM public.leads WHERE id=o.lead_id AND page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid; IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; RETURN; END IF;
 SELECT * INTO old FROM public.oem_invoices WHERE request_id=p_request_id; IF FOUND THEN IF old.input_hash=p_input_hash AND old.order_id=p_order_id AND old.stage=p_stage THEN RETURN QUERY SELECT 'duplicate',old.id,old.invoice_number,old.send_request_id,old.snapshot; ELSE RETURN QUERY SELECT 'conflict',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; END IF; RETURN; END IF;
 SELECT * INTO old FROM public.oem_invoices WHERE order_id=p_order_id AND stage=p_stage AND lifecycle_status='active'; IF FOUND THEN IF old.input_hash=p_input_hash THEN RETURN QUERY SELECT 'duplicate',old.id,old.invoice_number,old.send_request_id,old.snapshot; ELSE RETURN QUERY SELECT 'conflict',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; END IF; RETURN; END IF;
 IF o.status='cancelled' OR o.accepted_at IS NULL OR (p_stage='deposit' AND o.status<>'accepted') OR (p_stage='balance' AND o.status<>'balance_due') THEN RETURN QUERY SELECT 'state',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; RETURN; END IF;
 IF jsonb_typeof(p_issuer->'name')<>'string' OR length(trim(coalesce(p_issuer->>'name','')))<1 OR jsonb_typeof(p_issuer->'address')<>'string' OR length(trim(coalesce(p_issuer->>'address','')))<1 OR jsonb_typeof(p_issuer->'email')<>'string' OR p_issuer->>'email' !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RETURN QUERY SELECT 'invalid',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; RETURN; END IF;
 SELECT * INTO p FROM public.oem_payment_plans WHERE order_id=p_order_id AND stage=p_stage FOR UPDATE; SELECT coalesce(sum(r.amount),0) INTO dep FROM public.oem_payment_receipts r JOIN public.oem_payment_plans dp ON dp.id=r.plan_id WHERE dp.order_id=p_order_id AND dp.stage='deposit';
 net:=p_taxable8+p_taxable10+p_non_taxable; t8:=floor(p_taxable8*8/100.0); t10:=floor(p_taxable10*10/100.0); gross:=net+t8+t10; due:=CASE WHEN p_stage='deposit' THEN floor(gross/2.0) ELSE gross-coalesce(dep,0) END;
 IF net<1 OR gross>100000000 OR (p_stage='deposit' AND net<>o.formal_quote_amount) OR (p_stage='balance' AND (o.final_amount IS NULL OR net<>o.final_amount)) OR due<=0 THEN RETURN QUERY SELECT 'amount_mismatch',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; RETURN; END IF;
 IF p.id IS NOT NULL AND p.expected_amount<>due THEN RETURN QUERY SELECT 'plan_mismatch',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; RETURN; END IF;
 IF p.id IS NULL THEN INSERT INTO public.oem_payment_plans(order_id,stage,expected_amount,due_date,payer_name) VALUES(p_order_id,p_stage,due,p_due_date,l.company_name) RETURNING * INTO p; END IF;
 snap:=jsonb_build_object('version',1,'orderNumber',o.order_number,'stage',p_stage,'companyName',l.company_name,'contactName',l.contact_name,'email',l.email,'issuedDate',(now() AT TIME ZONE 'Asia/Tokyo')::date,'dueDate',p_due_date,'description',trim(p_description),'issuer',p_issuer,'taxable8',p_taxable8,'taxable10',p_taxable10,'nonTaxable',p_non_taxable,'tax8',t8,'tax10',t10,'netTotal',net,'grossTotal',gross,'depositReceived',coalesce(dep,0),'amountDue',due,'demo',coalesce((o.quote_snapshot->>'demo')::boolean,false)); n:='INV-'||to_char((now() AT TIME ZONE 'Asia/Tokyo')::date,'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)); sid:=gen_random_uuid();
 INSERT INTO public.oem_invoices(order_id,lead_id,plan_id,stage,invoice_number,snapshot,input_hash,request_id,send_request_id,created_by) VALUES(o.id,o.lead_id,p.id,p_stage,n,snap,p_input_hash,p_request_id,sid,p_actor) RETURNING id INTO old.id; INSERT INTO public.oem_lead_events(lead_id,event_type,details,created_by) VALUES(o.lead_id,'invoice_issued',jsonb_build_object('invoice_id',old.id,'invoice_number',n,'order_id',o.id,'stage',p_stage,'amount',due),p_actor); RETURN QUERY SELECT 'issued',old.id,n,sid,snap;
END $$;
COMMIT;
