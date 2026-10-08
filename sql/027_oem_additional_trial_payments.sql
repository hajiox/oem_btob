-- Independent additional-trial receivables. SQL026 and manufacturing payments remain unchanged.
BEGIN;

CREATE TABLE public.oem_additional_trial_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id uuid NOT NULL UNIQUE REFERENCES public.oem_trials(id) ON DELETE RESTRICT,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  prepayment_id uuid NOT NULL REFERENCES public.oem_trial_prepayments(id) ON DELETE RESTRICT,
  taxable_amount integer NOT NULL CHECK (taxable_amount = 3000),
  tax_amount integer NOT NULL CHECK (tax_amount = 300),
  gross_amount integer NOT NULL CHECK (gross_amount = 3300),
  status text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment','paid','void')),
  invoice_number text NOT NULL UNIQUE CHECK (invoice_number ~ '^EXTRA-[0-9]{8}-[A-Z0-9]{8}$'),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  void_reason text,
  CHECK ((status = 'paid') = (paid_at IS NOT NULL)),
  CHECK (status <> 'void' OR length(trim(coalesce(void_reason,''))) BETWEEN 1 AND 1000)
);

CREATE TABLE public.oem_additional_trial_payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.oem_additional_trial_payments(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL UNIQUE,
  amount integer NOT NULL CHECK (amount > 0 AND amount <= 100000000),
  paid_on date NOT NULL CHECK (paid_on <= ((now() AT TIME ZONE 'Asia/Tokyo')::date)),
  payer_name text NOT NULL CHECK (length(trim(payer_name)) BETWEEN 1 AND 300),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  confirmed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX oem_additional_trial_payment_lead_idx ON public.oem_additional_trial_payments(lead_id, created_at);
CREATE INDEX oem_additional_trial_receipts_payment_idx ON public.oem_additional_trial_payment_receipts(payment_id, created_at);

ALTER TABLE public.oem_additional_trial_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oem_additional_trial_payment_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oem_additional_trial_payments, public.oem_additional_trial_payment_receipts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.oem_additional_trial_payments, public.oem_additional_trial_payment_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_oem_additional_trial_payment_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.id = OLD.id
     AND NEW.trial_id = OLD.trial_id
     AND NEW.lead_id = OLD.lead_id
     AND NEW.prepayment_id = OLD.prepayment_id
     AND NEW.taxable_amount = OLD.taxable_amount
     AND NEW.tax_amount = OLD.tax_amount
     AND NEW.gross_amount = OLD.gross_amount
     AND NEW.invoice_number = OLD.invoice_number
     AND NEW.snapshot = OLD.snapshot
     AND NEW.created_by = OLD.created_by
     AND NEW.created_at = OLD.created_at
     AND ((OLD.status = NEW.status AND NEW.paid_at IS NOT DISTINCT FROM OLD.paid_at AND NEW.void_reason IS NOT DISTINCT FROM OLD.void_reason)
       OR (OLD.status = 'awaiting_payment' AND NEW.status = 'paid' AND NEW.paid_at IS NOT NULL AND NEW.void_reason IS NULL)
       OR (OLD.status = 'awaiting_payment' AND NEW.status = 'void' AND NEW.paid_at IS NULL AND length(trim(coalesce(NEW.void_reason,''))) BETWEEN 1 AND 1000)) THEN RETURN NEW;
  END IF;
  RAISE EXCEPTION 'additional trial payment snapshots are immutable' USING ERRCODE = 'read_only_sql_transaction';
END $$;
CREATE TRIGGER oem_additional_trial_payment_immutable
BEFORE UPDATE OR DELETE ON public.oem_additional_trial_payments
FOR EACH ROW EXECUTE FUNCTION public.prevent_oem_additional_trial_payment_mutation();

CREATE OR REPLACE FUNCTION public.prevent_oem_additional_trial_receipt_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'additional trial payment receipts are append-only' USING ERRCODE = 'read_only_sql_transaction'; END $$;
CREATE TRIGGER oem_additional_trial_receipts_append_only
BEFORE UPDATE OR DELETE ON public.oem_additional_trial_payment_receipts
FOR EACH ROW EXECUTE FUNCTION public.prevent_oem_additional_trial_receipt_mutation();

CREATE OR REPLACE FUNCTION public.create_oem_additional_trial_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.oem_trial_prepayments%ROWTYPE; pinv public.oem_trial_prepayment_invoices%ROWTYPE; l public.leads%ROWTYPE;
  num text; snap jsonb; issued date; due date;
BEGIN
  IF NEW.payment_required IS NOT TRUE OR NEW.fee_advisory <> 3000 THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oem_mail_admins WHERE user_id=NEW.created_by) THEN
    RAISE EXCEPTION 'additional trial invoice actor is not an OEM administrator' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO l FROM public.leads WHERE id = NEW.lead_id AND page_id = '35e7d402-0443-4703-94a4-fc2873b8f933'::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'additional trial lead is outside the OEM account' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT * INTO p FROM public.oem_trial_prepayments WHERE lead_id = NEW.lead_id AND status = 'paid' ORDER BY paid_at DESC NULLS LAST, created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'paid initial trial prepayment is required for additional trial invoice' USING ERRCODE = 'check_violation'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.oem_trial_ledgers tl
    WHERE tl.id=NEW.ledger_id AND lower(tl.company_key)=lower(p.company_key) AND tl.identity_evidence=p.identity_evidence
  ) THEN RAISE EXCEPTION 'additional trial identity does not match the paid initial prepayment' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO pinv FROM public.oem_trial_prepayment_invoices WHERE prepayment_id = p.id AND lifecycle_status = 'active' ORDER BY issued_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'active initial trial prepayment invoice is required for additional trial invoice' USING ERRCODE = 'check_violation'; END IF;
  issued := (now() AT TIME ZONE 'Asia/Tokyo')::date; due := issued + 14;
  num := 'EXTRA-' || to_char(issued, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  snap := jsonb_build_object(
    'version', 1, 'invoiceNumber', num, 'trialId', NEW.id, 'leadId', NEW.lead_id,
    'companyName', COALESCE(pinv.snapshot->>'companyName', l.company_name), 'contactName', COALESCE(pinv.snapshot->>'contactName', l.contact_name), 'email', l.email,
    'companyKey', p.company_key,
    'trialNumber', NEW.trial_number, 'projectNumber', NEW.project_number,
    'description', '追加試作費（試作' || NEW.project_number || '回目）', 'taxRate', 10, 'taxableAmount', 3000, 'taxAmount', 300,
    'grossAmount', 3300, 'issuedDate', issued, 'dueDate', due,
    'issuer', COALESCE(pinv.snapshot->'issuer', p.snapshot->'issuer', '{}'::jsonb),
    'specialIngredientNote', COALESCE(pinv.snapshot->>'specialIngredientNote', p.snapshot->>'specialIngredientNote', ''),
    'trialOnly', true, 'additionalTrial', true, 'sourcePrepaymentId', p.id
  );
  INSERT INTO public.oem_additional_trial_payments(trial_id,lead_id,prepayment_id,taxable_amount,tax_amount,gross_amount,invoice_number,snapshot,created_by)
    VALUES(NEW.id, NEW.lead_id, p.id, 3000, 300, 3300, num, snap, NEW.created_by);
  RETURN NEW;
END $$;
CREATE TRIGGER oem_trial_additional_payment_after_insert
AFTER INSERT ON public.oem_trials
FOR EACH ROW EXECUTE FUNCTION public.create_oem_additional_trial_payment();

CREATE OR REPLACE FUNCTION public.record_oem_additional_trial_receipt(
  p_payment_id uuid, p_actor uuid, p_request_id uuid, p_amount integer, p_paid_on date, p_payer_name text, p_note text
) RETURNS TABLE(result text, payment_id uuid, received_amount integer, expected_amount integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.oem_additional_trial_payments%ROWTYPE; r public.oem_additional_trial_payment_receipts%ROWTYPE; received integer;
BEGIN
  IF p_payment_id IS NULL OR p_request_id IS NULL OR p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000000
     OR p_paid_on IS NULL OR p_paid_on > (now() AT TIME ZONE 'Asia/Tokyo')::date
     OR length(trim(coalesce(p_payer_name,''))) NOT BETWEEN 1 AND 300 OR length(coalesce(p_note,'')) > 2000 THEN
    RETURN QUERY SELECT 'invalid', NULL::uuid, NULL::integer, NULL::integer; RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oem_mail_admins WHERE user_id = p_actor) THEN
    RETURN QUERY SELECT 'forbidden', NULL::uuid, NULL::integer, NULL::integer; RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  SELECT * INTO r FROM public.oem_additional_trial_payment_receipts WHERE request_id = p_request_id;
  IF FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.oem_additional_trial_payments ap JOIN public.leads l ON l.id=ap.lead_id AND l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid WHERE ap.id=r.payment_id) THEN
      RETURN QUERY SELECT 'forbidden', NULL::uuid, NULL::integer, NULL::integer; RETURN;
    END IF;
    SELECT * INTO p FROM public.oem_additional_trial_payments WHERE id = r.payment_id;
    RETURN QUERY SELECT CASE WHEN r.payment_id = p_payment_id AND r.amount = p_amount AND r.paid_on = p_paid_on AND r.payer_name = trim(p_payer_name) AND coalesce(r.note,'') = coalesce(nullif(trim(p_note),''),'') THEN 'duplicate' ELSE 'conflict' END, r.payment_id, (SELECT coalesce(sum(amount),0)::integer FROM public.oem_additional_trial_payment_receipts ar WHERE ar.payment_id = r.payment_id), p.gross_amount;
    RETURN;
  END IF;
  SELECT * INTO p FROM public.oem_additional_trial_payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found', NULL::uuid, NULL::integer, NULL::integer; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id=p.lead_id AND l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid) THEN
    RETURN QUERY SELECT 'forbidden', NULL::uuid, NULL::integer, NULL::integer; RETURN;
  END IF;
  IF p.status IN ('void','paid') THEN
    RETURN QUERY SELECT 'state', p.id, (SELECT coalesce(sum(amount),0)::integer FROM public.oem_additional_trial_payment_receipts ar WHERE ar.payment_id=p.id), p.gross_amount; RETURN;
  END IF;
  SELECT coalesce(sum(amount),0)::integer INTO received FROM public.oem_additional_trial_payment_receipts WHERE public.oem_additional_trial_payment_receipts.payment_id = p.id;
  IF received + p_amount > p.gross_amount THEN RETURN QUERY SELECT 'overpayment', p.id, received, p.gross_amount; RETURN; END IF;
  INSERT INTO public.oem_additional_trial_payment_receipts(payment_id,request_id,amount,paid_on,payer_name,note,confirmed_by)
    VALUES(p.id,p_request_id,p_amount,p_paid_on,trim(p_payer_name),coalesce(nullif(trim(p_note),''),''),p_actor);
  received := received + p_amount;
  IF received = p.gross_amount THEN UPDATE public.oem_additional_trial_payments SET status='paid',paid_at=now() WHERE id=p.id; RETURN QUERY SELECT 'paid',p.id,received,p.gross_amount; RETURN; END IF;
  RETURN QUERY SELECT 'partial',p.id,received,p.gross_amount;
END $$;

CREATE OR REPLACE FUNCTION public.void_oem_additional_trial_payment(p_payment_id uuid, p_actor uuid, p_reason text)
RETURNS TABLE(result text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.oem_additional_trial_payments%ROWTYPE; received integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.oem_mail_admins WHERE user_id=p_actor) OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 1 AND 1000 THEN RETURN QUERY SELECT 'invalid'; RETURN; END IF;
  SELECT * INTO p FROM public.oem_additional_trial_payments WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id=p.lead_id AND l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid) THEN RETURN QUERY SELECT 'forbidden'; RETURN; END IF;
  SELECT coalesce(sum(amount),0)::integer INTO received FROM public.oem_additional_trial_payment_receipts ar WHERE ar.payment_id=p.id;
  IF p.status <> 'awaiting_payment' OR received <> 0 THEN RETURN QUERY SELECT 'state'; RETURN; END IF;
  UPDATE public.oem_additional_trial_payments SET status='void',void_reason=trim(p_reason) WHERE id=p.id;
  RETURN QUERY SELECT 'void';
END $$;

REVOKE ALL ON FUNCTION public.record_oem_additional_trial_receipt(uuid,uuid,uuid,integer,date,text,text), public.void_oem_additional_trial_payment(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_oem_additional_trial_receipt(uuid,uuid,uuid,integer,date,text,text), public.void_oem_additional_trial_payment(uuid,uuid,text) TO service_role;

COMMIT;
