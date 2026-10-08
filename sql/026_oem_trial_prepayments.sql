-- Trial prepayment ledger and invoice snapshots. Additive migration; no existing order payment tables are changed.
BEGIN;
ALTER TABLE public.oem_trials ADD COLUMN IF NOT EXISTS payment_required boolean NOT NULL DEFAULT false;
CREATE TABLE public.oem_trial_prepayments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
 company_key text NOT NULL,
 identity_evidence text NOT NULL,
 claim_included boolean NOT NULL,
 taxable_amount integer NOT NULL CHECK (taxable_amount IN (5000,10000)),
 tax_amount integer NOT NULL CHECK (tax_amount IN (500,1000)),
 gross_amount integer NOT NULL CHECK (gross_amount IN (5500,11000)),
 status text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment','paid','void')),
 request_id uuid NOT NULL UNIQUE,
 snapshot jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 paid_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (gross_amount=taxable_amount+tax_amount),
 CHECK ((status='paid')=(paid_at IS NOT NULL))
);
CREATE TABLE public.oem_trial_prepayment_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 prepayment_id uuid NOT NULL REFERENCES public.oem_trial_prepayments(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL UNIQUE,
 amount integer NOT NULL CHECK (amount>0 AND amount<=100000000),
 paid_on date NOT NULL,
 payer_name text NOT NULL,
 note text,
 confirmed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.oem_trial_prepayment_invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 prepayment_id uuid NOT NULL UNIQUE REFERENCES public.oem_trial_prepayments(id) ON DELETE RESTRICT,
 lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
 invoice_number text NOT NULL UNIQUE,
 snapshot jsonb NOT NULL,
 request_id uuid NOT NULL UNIQUE,
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 issued_at timestamptz NOT NULL DEFAULT now(), lifecycle_status text NOT NULL DEFAULT 'active' CHECK(lifecycle_status IN ('active','void'))
);
CREATE INDEX oem_trial_prepayment_receipts_plan_idx ON public.oem_trial_prepayment_receipts(prepayment_id,created_at);
CREATE UNIQUE INDEX oem_trial_prepayment_active_lead_idx ON public.oem_trial_prepayments(lead_id) WHERE status<>'void';
CREATE INDEX oem_trial_prepayment_invoice_lead_idx ON public.oem_trial_prepayment_invoices(lead_id,issued_at DESC);
ALTER TABLE public.oem_trial_prepayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oem_trial_prepayment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oem_trial_prepayment_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oem_trial_prepayments,public.oem_trial_prepayment_receipts,public.oem_trial_prepayment_invoices FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.oem_trial_prepayments,public.oem_trial_prepayment_receipts,public.oem_trial_prepayment_invoices TO service_role;
CREATE FUNCTION public.prevent_oem_trial_prepayment_receipt_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'trial prepayment receipts are append-only'; END $$;
CREATE TRIGGER oem_trial_prepayment_receipts_immutable BEFORE UPDATE OR DELETE ON public.oem_trial_prepayment_receipts FOR EACH ROW EXECUTE FUNCTION public.prevent_oem_trial_prepayment_receipt_mutation();
CREATE FUNCTION public.prevent_oem_trial_prepayment_invoice_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'trial prepayment invoices are immutable'; END $$;
CREATE TRIGGER oem_trial_prepayment_invoices_immutable BEFORE UPDATE OR DELETE ON public.oem_trial_prepayment_invoices FOR EACH ROW EXECUTE FUNCTION public.prevent_oem_trial_prepayment_invoice_mutation();

-- A never-used benefit reservation may be released after its unpaid contract is void.
-- Used benefits and historical trial records remain immutable.
CREATE OR REPLACE FUNCTION public.prevent_oem_trial_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE releasing boolean;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'benefit ledger is immutable'; END IF;
 releasing:=OLD.benefit_lead_id IS NOT NULL AND NEW.benefit_lead_id IS NULL
  AND OLD.included_used=0 AND NEW.included_used=0
  AND NOT EXISTS(SELECT 1 FROM oem_trials WHERE ledger_id=OLD.id)
  AND EXISTS(SELECT 1 FROM oem_trial_prepayments WHERE lead_id=OLD.benefit_lead_id AND company_key=OLD.company_key AND status='void')
  AND NOT EXISTS(SELECT 1 FROM oem_trial_prepayments WHERE company_key=OLD.company_key AND claim_included AND status<>'void');
 IF (to_jsonb(NEW)-ARRAY['included_used','benefit_lead_id','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['included_used','benefit_lead_id','updated_at'])
  OR NEW.included_used<OLD.included_used OR NEW.included_used>OLD.included_used+1
  OR (OLD.benefit_lead_id IS NOT NULL AND NEW.benefit_lead_id IS DISTINCT FROM OLD.benefit_lead_id AND NOT releasing)
 THEN RAISE EXCEPTION 'invalid benefit ledger transition'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.create_oem_trial_prepayment(p_lead_id uuid,p_actor uuid,p_company_key text,p_identity_evidence text,p_claim_included boolean,p_request_id uuid,p_issuer jsonb)
RETURNS TABLE(result text,prepayment_id uuid,invoice_id uuid,taxable_amount integer,tax_amount integer,gross_amount integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.oem_trial_prepayments%ROWTYPE; inv public.oem_trial_prepayment_invoices%ROWTYPE; lead_row public.leads%ROWTYPE; existing public.oem_trial_prepayments%ROWTYPE; amount integer; tax integer; gross integer; snapshot jsonb; num text;
BEGIN
 IF p_request_id IS NULL OR p_claim_included IS NULL OR p_issuer IS NULL OR jsonb_typeof(p_issuer) IS DISTINCT FROM 'object' OR jsonb_typeof(p_issuer->'name') IS DISTINCT FROM 'string' OR length(trim(coalesce(p_issuer->>'name','')))<1 OR jsonb_typeof(p_issuer->'address') IS DISTINCT FROM 'string' OR length(trim(coalesce(p_issuer->>'address','')))<1 OR jsonb_typeof(p_issuer->'email') IS DISTINCT FROM 'string' OR p_issuer->>'email' !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR jsonb_typeof(p_issuer->'bankName') IS DISTINCT FROM 'string' OR length(trim(coalesce(p_issuer->>'bankName','')))<1 OR jsonb_typeof(p_issuer->'branchName') IS DISTINCT FROM 'string' OR length(trim(coalesce(p_issuer->>'branchName','')))<1 OR jsonb_typeof(p_issuer->'accountType') IS DISTINCT FROM 'string' OR length(trim(coalesce(p_issuer->>'accountType','')))<1 OR jsonb_typeof(p_issuer->'accountNumber') IS DISTINCT FROM 'string' OR p_issuer->>'accountNumber' !~ '^[0-9]{1,30}$' OR jsonb_typeof(p_issuer->'accountHolder') IS DISTINCT FROM 'string' OR length(trim(coalesce(p_issuer->>'accountHolder','')))<1 OR coalesce(p_issuer->>'registrationNumber','')<>'' AND p_issuer->>'registrationNumber' !~ '^T[0-9]{13}$' OR length(trim(coalesce(p_company_key,''))) NOT BETWEEN 1 AND 200 OR length(trim(coalesce(p_identity_evidence,''))) NOT BETWEEN 1 AND 2000 THEN RETURN QUERY SELECT 'invalid',NULL::uuid,NULL::uuid,NULL::integer,NULL::integer,NULL::integer; RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM oem_mail_admins WHERE user_id=p_actor) OR NOT EXISTS(SELECT 1 FROM leads WHERE id=p_lead_id AND page_id='35e7d402-0443-4703-94a4-fc2873b8f933') THEN RETURN QUERY SELECT 'forbidden',NULL::uuid,NULL::uuid,NULL::integer,NULL::integer,NULL::integer; RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_lead_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('oem-trial-company:'||lower(trim(p_company_key)),0));
 SELECT * INTO lead_row FROM leads WHERE id=p_lead_id;
 SELECT * INTO existing FROM oem_trial_prepayments WHERE lead_id=p_lead_id AND status<>'void' FOR UPDATE;
 PERFORM 1 FROM oem_trial_ledgers WHERE company_key=lower(trim(p_company_key)) FOR UPDATE;
 IF existing.id IS NOT NULL THEN
  IF existing.request_id=p_request_id AND existing.company_key=lower(trim(p_company_key)) AND existing.identity_evidence=trim(p_identity_evidence) AND existing.claim_included=p_claim_included AND existing.snapshot->'issuer'=p_issuer THEN SELECT * INTO inv FROM oem_trial_prepayment_invoices WHERE oem_trial_prepayment_invoices.prepayment_id=existing.id; RETURN QUERY SELECT 'duplicate',existing.id,inv.id,existing.taxable_amount,existing.tax_amount,existing.gross_amount; ELSE RETURN QUERY SELECT 'conflict',NULL::uuid,NULL::uuid,NULL::integer,NULL::integer,NULL::integer; END IF; RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM oem_trials WHERE lead_id=p_lead_id AND NOT payment_required) THEN RETURN QUERY SELECT 'legacy_contract',NULL::uuid,NULL::uuid,NULL::integer,NULL::integer,NULL::integer; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM oem_trial_prepayments WHERE request_id=p_request_id) THEN RETURN QUERY SELECT 'conflict',NULL::uuid,NULL::uuid,NULL::integer,NULL::integer,NULL::integer; RETURN; END IF;
 IF p_claim_included AND EXISTS(SELECT 1 FROM oem_trial_ledgers WHERE company_key=lower(trim(p_company_key)) AND identity_evidence IS DISTINCT FROM trim(p_identity_evidence)) THEN RETURN QUERY SELECT 'identity_conflict',NULL::uuid,NULL::uuid,NULL::integer,NULL::integer,NULL::integer; RETURN; END IF;
 IF p_claim_included AND EXISTS(SELECT 1 FROM oem_trial_ledgers WHERE company_key=lower(trim(p_company_key)) AND benefit_lead_id IS NOT NULL AND benefit_lead_id<>p_lead_id) THEN RETURN QUERY SELECT 'benefit_conflict',NULL::uuid,NULL::uuid,NULL::integer,NULL::integer,NULL::integer; RETURN; END IF;
 IF p_claim_included THEN
  INSERT INTO oem_trial_ledgers(company_key,identity_evidence,confirmed_by,benefit_lead_id) VALUES(lower(trim(p_company_key)),trim(p_identity_evidence),p_actor,p_lead_id) ON CONFLICT(company_key) DO UPDATE SET benefit_lead_id=EXCLUDED.benefit_lead_id,updated_at=now() WHERE oem_trial_ledgers.benefit_lead_id IS NULL;
 END IF;
 amount:=CASE WHEN p_claim_included THEN 5000 ELSE 10000 END; tax:=amount/10; gross:=amount+tax;
 snapshot:=jsonb_build_object('version',1,'companyKey',lower(trim(p_company_key)),'identityEvidence',trim(p_identity_evidence),'claimIncluded',p_claim_included,'taxableAmount',amount,'taxAmount',tax,'grossAmount',gross,'issuer',p_issuer,'companyName',lead_row.company_name,'contactName',lead_row.contact_name,'taxRate',10,'specialIngredientNote','試作で特殊食材の使用の場合は別途お見積りとなります','trialOnly',true,'description',CASE WHEN p_claim_included THEN '初回試作費（2回までの試作契約）' ELSE '試作費（通常）' END);
 INSERT INTO oem_trial_prepayments(lead_id,company_key,identity_evidence,claim_included,taxable_amount,tax_amount,gross_amount,request_id,snapshot,created_by) VALUES(p_lead_id,lower(trim(p_company_key)),trim(p_identity_evidence),p_claim_included,amount,tax,gross,p_request_id,snapshot,p_actor) RETURNING * INTO p;
 num:='TRIAL-'||to_char(p.created_at,'YYYYMMDD')||'-'||upper(substr(replace(p.id::text,'-',''),1,10));
 INSERT INTO oem_trial_prepayment_invoices(prepayment_id,lead_id,invoice_number,snapshot,request_id,created_by) VALUES(p.id,p.lead_id,num,jsonb_build_object('version',1,'invoiceNumber',num,'leadId',p.lead_id,'description',p.snapshot->>'description','companyName',p.snapshot->>'companyName','contactName',p.snapshot->>'contactName','issuer',p.snapshot->'issuer','taxRate',10,'specialIngredientNote',p.snapshot->>'specialIngredientNote','trialOnly',true,'taxableAmount',amount,'taxAmount',tax,'grossAmount',gross,'companyKey',p.company_key,'issuedDate',to_char((now() AT TIME ZONE 'Asia/Tokyo')::date,'YYYY-MM-DD'),'dueDate',to_char((now() AT TIME ZONE 'Asia/Tokyo')::date+interval '14 days','YYYY-MM-DD')),p_request_id,p_actor) RETURNING * INTO inv;
 RETURN QUERY SELECT 'issued',p.id,inv.id,amount,tax,gross;
END $$;
CREATE OR REPLACE FUNCTION public.record_oem_trial_prepayment_receipt(p_prepayment_id uuid,p_actor uuid,p_request_id uuid,p_amount integer,p_paid_on date,p_payer_name text,p_note text)
RETURNS TABLE(result text,prepayment_id uuid,received_amount integer,expected_amount integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.oem_trial_prepayments%ROWTYPE; r public.oem_trial_prepayment_receipts%ROWTYPE; received integer;
BEGIN
 IF p_prepayment_id IS NULL OR p_request_id IS NULL OR p_amount IS NULL OR p_amount<=0 OR p_amount>100000000 OR p_paid_on IS NULL OR p_paid_on>(now() AT TIME ZONE 'Asia/Tokyo')::date OR length(trim(coalesce(p_payer_name,''))) NOT BETWEEN 1 AND 300 OR length(coalesce(p_note,''))>2000 THEN RETURN QUERY SELECT 'invalid',NULL::uuid,NULL::integer,NULL::integer; RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM oem_mail_admins WHERE user_id=p_actor) THEN RETURN QUERY SELECT 'forbidden',NULL::uuid,NULL::integer,NULL::integer; RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0)); SELECT * INTO r FROM oem_trial_prepayment_receipts WHERE request_id=p_request_id;
 IF FOUND THEN SELECT * INTO p FROM oem_trial_prepayments WHERE id=r.prepayment_id; RETURN QUERY SELECT CASE WHEN r.prepayment_id=p_prepayment_id AND r.amount=p_amount AND r.paid_on=p_paid_on AND r.payer_name=trim(p_payer_name) AND coalesce(r.note,'')=coalesce(nullif(trim(p_note),''),'') THEN 'duplicate' ELSE 'conflict' END,r.prepayment_id,(SELECT coalesce(sum(amount),0)::integer FROM oem_trial_prepayment_receipts WHERE oem_trial_prepayment_receipts.prepayment_id=r.prepayment_id),p.gross_amount; RETURN; END IF;
 SELECT * INTO p FROM oem_trial_prepayments WHERE id=p_prepayment_id FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::uuid,NULL::integer,NULL::integer; RETURN; END IF;
 IF p.status='void' THEN RETURN QUERY SELECT 'state',p.id,0,p.gross_amount; RETURN; END IF;
 SELECT coalesce(sum(amount),0) INTO received FROM oem_trial_prepayment_receipts WHERE oem_trial_prepayment_receipts.prepayment_id=p.id;
 IF received+p_amount>p.gross_amount THEN RETURN QUERY SELECT 'overpayment',p.id,received,p.gross_amount; RETURN; END IF;
 INSERT INTO oem_trial_prepayment_receipts(prepayment_id,request_id,amount,paid_on,payer_name,note,confirmed_by) VALUES(p.id,p_request_id,p_amount,p_paid_on,trim(p_payer_name),nullif(trim(p_note),''),p_actor);
 received:=received+p_amount;
 IF received=p.gross_amount THEN UPDATE oem_trial_prepayments SET status='paid',paid_at=now(),updated_at=now() WHERE id=p.id; RETURN QUERY SELECT 'paid',p.id,received,p.gross_amount; ELSE RETURN QUERY SELECT 'partial',p.id,received,p.gross_amount; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.void_oem_trial_prepayment(p_prepayment_id uuid,p_actor uuid,p_reason text)
RETURNS TABLE(result text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p public.oem_trial_prepayments%ROWTYPE; BEGIN
 IF NOT EXISTS(SELECT 1 FROM oem_mail_admins WHERE user_id=p_actor) OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 1 AND 1000 THEN RETURN QUERY SELECT 'invalid'; RETURN; END IF;
 SELECT * INTO p FROM oem_trial_prepayments WHERE id=p_prepayment_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'; RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('oem-trial-company:'||p.company_key,0));
 SELECT * INTO p FROM oem_trial_prepayments WHERE id=p_prepayment_id FOR UPDATE; IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'; RETURN; END IF;
 IF p.status<>'awaiting_payment' OR EXISTS(SELECT 1 FROM oem_trial_prepayment_receipts WHERE oem_trial_prepayment_receipts.prepayment_id=p.id) THEN RETURN QUERY SELECT 'state'; RETURN; END IF;
 UPDATE oem_trial_prepayments SET status='void',updated_at=now(),snapshot=snapshot||jsonb_build_object('voidReason',trim(p_reason),'voidedAt',now()) WHERE id=p.id;
 UPDATE oem_trial_ledgers SET benefit_lead_id=NULL,updated_at=now() WHERE company_key=p.company_key AND benefit_lead_id=p.lead_id AND included_used=0; RETURN QUERY SELECT 'void'; END $$;
REVOKE ALL ON FUNCTION public.void_oem_trial_prepayment(uuid,uuid,text),public.create_oem_trial_prepayment(uuid,uuid,text,text,boolean,uuid,jsonb),public.record_oem_trial_prepayment_receipt(uuid,uuid,uuid,integer,date,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.void_oem_trial_prepayment(uuid,uuid,text),public.create_oem_trial_prepayment(uuid,uuid,text,text,boolean,uuid,jsonb),public.record_oem_trial_prepayment_receipt(uuid,uuid,uuid,integer,date,text,text) TO service_role;

-- New engagements require payment. Continuations of pre-migration trial contracts retain their original billing conditions.
CREATE OR REPLACE FUNCTION public.create_oem_trial(p_lead_id uuid,p_actor uuid,p_company_key text,p_identity_evidence text,p_claim_included boolean,p_label text,p_notes text,p_request_id uuid)
RETURNS TABLE(result text,trial_id uuid,trial_number integer,fee_advisory integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.oem_trial_ledgers%ROWTYPE; t public.oem_trials%ROWTYPE; p public.oem_trial_prepayments%ROWTYPE; n integer; pn integer; free boolean; legacy boolean; input jsonb;
BEGIN
 IF p_request_id IS NULL OR p_claim_included IS NULL OR length(trim(coalesce(p_company_key,''))) NOT BETWEEN 1 AND 200 OR length(trim(coalesce(p_identity_evidence,''))) NOT BETWEEN 1 AND 2000 OR length(coalesce(p_label,''))>500 OR length(coalesce(p_notes,''))>2000 THEN RETURN QUERY SELECT 'invalid',NULL::uuid,NULL::integer,NULL::integer; RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM oem_mail_admins WHERE user_id=p_actor) OR NOT EXISTS(SELECT 1 FROM leads WHERE id=p_lead_id AND page_id='35e7d402-0443-4703-94a4-fc2873b8f933') THEN RETURN QUERY SELECT 'forbidden',NULL::uuid,NULL::integer,NULL::integer; RETURN; END IF;
 input:=jsonb_build_object('companyKey',lower(trim(p_company_key)),'identityEvidence',trim(p_identity_evidence),'claimIncluded',p_claim_included,'label',coalesce(nullif(trim(p_label),''),''),'notes',coalesce(nullif(trim(p_notes),''),''));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0)); SELECT * INTO t FROM oem_trials WHERE request_id=p_request_id;
 IF FOUND THEN IF t.lead_id=p_lead_id AND t.created_by=p_actor AND t.request_snapshot=input THEN RETURN QUERY SELECT 'duplicate',t.id,t.project_number,t.fee_advisory; ELSE RETURN QUERY SELECT 'conflict',NULL::uuid,NULL::integer,NULL::integer; END IF; RETURN; END IF;
 SELECT * INTO p FROM oem_trial_prepayments WHERE lead_id=p_lead_id AND status<>'void' FOR UPDATE;
 legacy:=p.id IS NULL AND EXISTS(SELECT 1 FROM oem_trials WHERE lead_id=p_lead_id AND NOT payment_required);
 IF NOT legacy AND (p.id IS NULL OR p.status<>'paid' OR p.company_key<>lower(trim(p_company_key)) OR p.identity_evidence<>trim(p_identity_evidence) OR p.claim_included<>p_claim_included) THEN RETURN QUERY SELECT 'payment_required',NULL::uuid,NULL::integer,NULL::integer; RETURN; END IF;
 PERFORM 1 FROM leads WHERE id=p_lead_id FOR UPDATE;
 INSERT INTO oem_trial_ledgers(company_key,identity_evidence,confirmed_by) VALUES(lower(trim(p_company_key)),trim(p_identity_evidence),p_actor) ON CONFLICT(company_key) DO NOTHING;
 SELECT * INTO l FROM oem_trial_ledgers WHERE company_key=lower(trim(p_company_key)) FOR UPDATE;
 IF l.identity_evidence IS DISTINCT FROM trim(p_identity_evidence) OR EXISTS(SELECT 1 FROM oem_trials WHERE lead_id=p_lead_id AND ledger_id<>l.id) THEN RETURN QUERY SELECT 'identity_conflict',NULL::uuid,NULL::integer,NULL::integer; RETURN; END IF;
 IF p_claim_included AND l.benefit_lead_id IS NOT NULL AND l.benefit_lead_id<>p_lead_id THEN RETURN QUERY SELECT 'benefit_conflict',NULL::uuid,NULL::integer,NULL::integer; RETURN; END IF;
 SELECT coalesce(max(ot.trial_number),0)+1 INTO n FROM oem_trials ot WHERE ot.ledger_id=l.id; SELECT coalesce(max(ot.project_number),0)+1 INTO pn FROM oem_trials ot WHERE ot.lead_id=p_lead_id;
 free:=p_claim_included AND pn<=2 AND l.included_used<2;
 INSERT INTO oem_trials(ledger_id,lead_id,trial_number,project_number,identity_evidence,label,result_notes,fee_advisory,included_claimed,request_id,request_snapshot,created_by,payment_required) VALUES(l.id,p_lead_id,n,pn,trim(p_identity_evidence),nullif(trim(p_label),''),nullif(trim(p_notes),''),CASE WHEN (legacy AND free) OR (NOT legacy AND pn<=2) THEN 0 ELSE 3000 END,free,p_request_id,input,p_actor,NOT legacy) RETURNING * INTO t;
 IF free THEN UPDATE oem_trial_ledgers SET included_used=included_used+1,benefit_lead_id=p_lead_id,updated_at=now() WHERE id=l.id; END IF;
 INSERT INTO oem_trial_events(trial_id,action,actor,notes,version) VALUES(t.id,'created',p_actor,t.result_notes,0);
 RETURN QUERY SELECT 'created',t.id,t.project_number,t.fee_advisory;
END $$;
CREATE OR REPLACE FUNCTION public.record_oem_trial_result(p_trial_id uuid,p_actor uuid,p_result text,p_notes text,p_expected_version integer)
RETURNS TABLE(result text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE t public.oem_trials%ROWTYPE; p public.oem_trial_prepayments%ROWTYPE; BEGIN
 IF p_result IS NULL OR p_result NOT IN ('pass','fail','needs_revision','cancelled') OR p_expected_version IS NULL OR p_expected_version<0 OR length(coalesce(p_notes,''))>2000 THEN RETURN QUERY SELECT 'invalid'; RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM oem_mail_admins WHERE user_id=p_actor) THEN RETURN QUERY SELECT 'forbidden'; RETURN; END IF;
 SELECT t0.* INTO t FROM oem_trials t0 JOIN leads l ON l.id=t0.lead_id AND l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933' WHERE t0.id=p_trial_id FOR UPDATE OF t0;
 IF NOT FOUND THEN RETURN QUERY SELECT 'forbidden'; RETURN; END IF;
 SELECT * INTO p FROM oem_trial_prepayments WHERE lead_id=t.lead_id AND status<>'void';
 IF t.payment_required AND (NOT FOUND OR p.status<>'paid') THEN RETURN QUERY SELECT 'payment_required'; RETURN; END IF;
 IF t.version<>p_expected_version OR t.status<>'pending' THEN RETURN QUERY SELECT 'conflict'; RETURN; END IF;
 UPDATE oem_trials SET result=p_result,status=CASE WHEN p_result='cancelled' THEN 'cancelled' ELSE 'completed' END,result_notes=nullif(trim(p_notes),''),completed_at=now(),version=version+1,updated_at=now() WHERE id=t.id;
 INSERT INTO oem_trial_events(trial_id,action,actor,result,notes,version) VALUES(t.id,'completed',p_actor,p_result,nullif(trim(p_notes),''),t.version+1);
 RETURN QUERY SELECT 'saved'; END $$;
REVOKE ALL ON FUNCTION public.create_oem_trial(uuid,uuid,text,text,boolean,text,text,uuid),public.record_oem_trial_result(uuid,uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_oem_trial(uuid,uuid,text,text,boolean,text,text,uuid),public.record_oem_trial_result(uuid,uuid,text,text,integer) TO service_role;
COMMIT;
