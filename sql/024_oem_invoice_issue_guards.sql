-- Restore original invoice issuance guards while retaining revision history.
BEGIN;

CREATE OR REPLACE FUNCTION public.issue_oem_invoice(
  p_order_id uuid, p_request_id uuid, p_input_hash text, p_stage text, p_due_date date,
  p_description text, p_taxable8 integer, p_taxable10 integer, p_non_taxable integer,
  p_issuer jsonb, p_actor uuid
) RETURNS TABLE(result text, invoice_id uuid, invoice_number text, send_request_id uuid, snapshot jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.oem_orders%ROWTYPE; l public.leads%ROWTYPE; p public.oem_payment_plans%ROWTYPE;
  old public.oem_invoices%ROWTYPE; v8 integer; v10 integer; net integer; gross integer; due integer; dep bigint;
  snap jsonb; num text; send_id uuid; plan_found boolean; order_found boolean; dep_plan_exists boolean; dep_expected integer;
BEGIN
  IF p_stage IS NULL OR p_stage NOT IN ('deposit','balance') OR p_request_id IS NULL OR p_input_hash IS NULL OR p_input_hash !~ '^[0-9a-f]{64}$'
     OR p_due_date IS NULL OR p_description IS NULL OR length(trim(p_description)) NOT BETWEEN 1 AND 2000
     OR p_taxable8 IS NULL OR p_taxable10 IS NULL OR p_non_taxable IS NULL
     OR p_taxable8 < 0 OR p_taxable10 < 0 OR p_non_taxable < 0
     OR p_taxable8 > 100000000 OR p_taxable10 > 100000000 OR p_non_taxable > 100000000
     OR p_issuer IS NULL OR jsonb_typeof(p_issuer) <> 'object' THEN
    RETURN QUERY SELECT 'invalid',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oem_mail_admins WHERE user_id=p_actor) THEN
    RETURN QUERY SELECT 'forbidden',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO o FROM public.oem_orders WHERE id=p_order_id FOR UPDATE;
  order_found := FOUND;
  IF NOT order_found THEN RETURN QUERY SELECT 'state',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; RETURN; END IF;
  SELECT * INTO l FROM public.leads WHERE id=o.lead_id AND page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid;
  IF NOT FOUND OR l.email !~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RETURN QUERY SELECT 'not_found',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO old FROM public.oem_invoices WHERE request_id=p_request_id;
  IF FOUND THEN
    IF old.input_hash=p_input_hash AND old.order_id=p_order_id AND old.stage=p_stage THEN
      RETURN QUERY SELECT 'duplicate',old.id,old.invoice_number,old.send_request_id,old.snapshot; RETURN;
    END IF;
    RETURN QUERY SELECT 'conflict',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO old FROM public.oem_invoices WHERE order_id=p_order_id AND stage=p_stage AND lifecycle_status='active';
  IF FOUND THEN
    IF old.input_hash=p_input_hash THEN
      RETURN QUERY SELECT 'duplicate',old.id,old.invoice_number,old.send_request_id,old.snapshot; RETURN;
    END IF;
    RETURN QUERY SELECT 'conflict',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; RETURN;
  END IF;
  IF NOT order_found OR o.status='cancelled' OR o.accepted_at IS NULL OR
     (p_stage='deposit' AND o.status <> 'accepted') OR (p_stage='balance' AND o.status <> 'balance_due') THEN
    RETURN QUERY SELECT 'state',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; RETURN;
  END IF;
  IF jsonb_typeof(p_issuer->'name') IS DISTINCT FROM 'string' OR length(trim(coalesce(p_issuer->>'name',''))) NOT BETWEEN 1 AND 200
     OR jsonb_typeof(p_issuer->'address') IS DISTINCT FROM 'string' OR length(trim(coalesce(p_issuer->>'address',''))) NOT BETWEEN 1 AND 500
     OR jsonb_typeof(p_issuer->'email') IS DISTINCT FROM 'string' OR p_issuer->>'email' !~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
     OR jsonb_typeof(p_issuer->'bankName') IS DISTINCT FROM 'string' OR length(trim(coalesce(p_issuer->>'bankName',''))) NOT BETWEEN 1 AND 200
     OR jsonb_typeof(p_issuer->'branchName') IS DISTINCT FROM 'string' OR length(trim(coalesce(p_issuer->>'branchName',''))) NOT BETWEEN 1 AND 200
     OR jsonb_typeof(p_issuer->'accountType') IS DISTINCT FROM 'string' OR length(trim(coalesce(p_issuer->>'accountType',''))) NOT BETWEEN 1 AND 50
     OR jsonb_typeof(p_issuer->'accountNumber') IS DISTINCT FROM 'string' OR (p_issuer->>'accountNumber') !~ '^[0-9]{1,30}$'
     OR jsonb_typeof(p_issuer->'accountHolder') IS DISTINCT FROM 'string' OR length(trim(coalesce(p_issuer->>'accountHolder',''))) NOT BETWEEN 1 AND 200
     OR coalesce(p_issuer->>'registrationNumber','') <> '' AND p_issuer->>'registrationNumber' !~ '^T[0-9]{13}$' THEN
    RETURN QUERY SELECT 'invalid',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO p FROM public.oem_payment_plans WHERE order_id=p_order_id AND stage=p_stage FOR UPDATE;
  plan_found := FOUND;
  IF plan_found AND p.due_date IS DISTINCT FROM p_due_date THEN
    RETURN QUERY SELECT 'plan_mismatch',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; RETURN;
  END IF;
  v8 := floor(p_taxable8 * 8 / 100.0); v10 := floor(p_taxable10 * 10 / 100.0);
  net := p_taxable8+p_taxable10+p_non_taxable; gross := net+v8+v10;
  IF gross > 100000000 OR net < 1 OR (p_stage='deposit' AND net <> o.formal_quote_amount)
     OR (p_stage='balance' AND (o.final_amount IS NULL OR net <> o.final_amount)) THEN
    RETURN QUERY SELECT 'amount_mismatch',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; RETURN;
  END IF;
  SELECT coalesce(sum(r.amount),0) INTO dep FROM public.oem_payment_receipts r WHERE r.plan_id=(SELECT id FROM public.oem_payment_plans WHERE order_id=p_order_id AND stage='deposit');
  SELECT EXISTS(SELECT 1 FROM public.oem_payment_plans WHERE order_id=p_order_id AND stage='deposit'),
         coalesce((SELECT expected_amount FROM public.oem_payment_plans WHERE order_id=p_order_id AND stage='deposit'),0)
    INTO dep_plan_exists, dep_expected;
  IF plan_found AND EXISTS (SELECT 1 FROM public.oem_payment_receipts WHERE plan_id=p.id) THEN
    RETURN QUERY SELECT 'receipt_exists',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; RETURN;
  END IF;
  IF p_stage='balance' AND (NOT dep_plan_exists OR dep <= 0 OR dep <> dep_expected) THEN
    RETURN QUERY SELECT 'deposit_required',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; RETURN;
  END IF;
  due := CASE WHEN p_stage='deposit' THEN floor(gross/2.0) ELSE gross-coalesce(dep,0) END;
  IF due <= 0 THEN
    RETURN QUERY SELECT 'amount_mismatch',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; RETURN;
  END IF;
  IF plan_found AND p.expected_amount <> due THEN RETURN QUERY SELECT 'plan_mismatch',NULL::uuid,NULL::text,NULL::uuid,NULL::jsonb; RETURN; END IF;
  IF NOT plan_found THEN
    INSERT INTO public.oem_payment_plans(order_id,stage,expected_amount,due_date,payer_name)
      VALUES(p_order_id,p_stage,due,p_due_date,trim(l.company_name)) RETURNING * INTO p;
  END IF;
  snap := jsonb_build_object('version',1,'orderNumber',o.order_number,'stage',p_stage,'companyName',l.company_name,'contactName',l.contact_name,'email',l.email,'issuedDate',(now() AT TIME ZONE 'Asia/Tokyo')::date,'dueDate',p_due_date,'description',trim(p_description),'issuer',p_issuer,'taxable8',p_taxable8,'taxable10',p_taxable10,'nonTaxable',p_non_taxable,'tax8',v8,'tax10',v10,'netTotal',net,'grossTotal',gross,'depositReceived',coalesce(dep,0),'amountDue',due,'demo',coalesce((o.quote_snapshot->>'demo')::boolean,false));
  num := 'INV-'||to_char((now() AT TIME ZONE 'Asia/Tokyo')::date,'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)); send_id := gen_random_uuid();
  INSERT INTO public.oem_invoices(order_id,lead_id,plan_id,stage,invoice_number,snapshot,input_hash,request_id,send_request_id,created_by)
    VALUES(o.id,o.lead_id,p.id,p_stage,num,snap,p_input_hash,p_request_id,send_id,p_actor)
    RETURNING oem_invoices.id,oem_invoices.invoice_number,oem_invoices.send_request_id,oem_invoices.snapshot INTO old.id,old.invoice_number,old.send_request_id,old.snapshot;
  INSERT INTO public.oem_lead_events(lead_id,event_type,details,created_by)
    VALUES(o.lead_id,'invoice_issued',jsonb_build_object('invoice_id',old.id,'invoice_number',num,'order_id',o.id,'stage',p_stage,'amount',due),p_actor);
  RETURN QUERY SELECT 'issued',old.id,old.invoice_number,old.send_request_id,old.snapshot;
END $$;
REVOKE ALL ON FUNCTION public.issue_oem_invoice(uuid,uuid,text,text,date,text,integer,integer,integer,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_oem_invoice(uuid,uuid,text,text,date,text,integer,integer,integer,jsonb,uuid) TO service_role;

COMMIT;

