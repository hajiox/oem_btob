-- Customer progress portal and safe reorder draft ledger.
-- Bearer tokens are only stored as SHA-256 digests. No email is sent here.
BEGIN;

CREATE TABLE public.oem_progress_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  renewed_from uuid REFERENCES public.oem_progress_links(id) ON DELETE SET NULL,
  CONSTRAINT oem_progress_link_expiry CHECK (expires_at > issued_at)
);

CREATE TABLE public.oem_reorder_requests (
  request_id uuid PRIMARY KEY,
  source_order_id uuid NOT NULL REFERENCES public.oem_orders(id) ON DELETE RESTRICT,
  source_lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  new_lead_id uuid NOT NULL UNIQUE REFERENCES public.leads(id) ON DELETE RESTRICT,
  actor_type text NOT NULL CHECK (actor_type IN ('admin','customer')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_binding text NOT NULL CHECK (length(actor_binding) BETWEEN 1 AND 64),
  selection_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(selection_snapshot) = 'object'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','converted','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oem_progress_links_lead_idx ON public.oem_progress_links(lead_id, issued_at DESC);
CREATE INDEX oem_progress_links_expiry_idx ON public.oem_progress_links(expires_at) WHERE revoked_at IS NULL;
CREATE INDEX oem_reorder_requests_source_idx ON public.oem_reorder_requests(source_order_id, created_at DESC);

ALTER TABLE public.oem_progress_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oem_reorder_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oem_progress_links, public.oem_reorder_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.oem_progress_links TO service_role;
GRANT SELECT, INSERT ON public.oem_reorder_requests TO service_role;

CREATE OR REPLACE FUNCTION public.freeze_oem_progress_link_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id<>OLD.id OR NEW.lead_id<>OLD.lead_id OR NEW.token_hash<>OLD.token_hash OR NEW.issued_by IS DISTINCT FROM OLD.issued_by
     OR NEW.issued_at<>OLD.issued_at OR NEW.expires_at<>OLD.expires_at OR NEW.renewed_from IS DISTINCT FROM OLD.renewed_from
     OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    IF NEW.revoked_at IS NOT DISTINCT FROM OLD.revoked_at THEN RAISE EXCEPTION 'progress link identity is immutable' USING ERRCODE='read_only_sql_transaction'; END IF;
    IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN RAISE EXCEPTION 'progress link revocation is immutable' USING ERRCODE='read_only_sql_transaction'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER oem_progress_link_immutable BEFORE UPDATE OR DELETE ON public.oem_progress_links
FOR EACH ROW EXECUTE FUNCTION public.freeze_oem_progress_link_identity();

CREATE OR REPLACE FUNCTION public.freeze_oem_reorder_request() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'reorder request ledger is immutable' USING ERRCODE='read_only_sql_transaction'; END $$;
CREATE TRIGGER oem_reorder_request_immutable BEFORE UPDATE OR DELETE ON public.oem_reorder_requests
FOR EACH ROW EXECUTE FUNCTION public.freeze_oem_reorder_request();

CREATE OR REPLACE FUNCTION public.manage_oem_progress_link(
  p_action text, p_lead_id uuid, p_actor uuid, p_token_hash text, p_expires_at timestamptz,
  p_link_id uuid DEFAULT NULL
) RETURNS TABLE(result text, link_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing public.oem_progress_links%ROWTYPE; created public.oem_progress_links%ROWTYPE;
BEGIN
  IF p_action NOT IN ('issue','revoke','renew') OR p_actor IS NULL OR
     NOT EXISTS (SELECT 1 FROM public.oem_mail_admins WHERE user_id = p_actor) THEN
    RETURN QUERY SELECT 'forbidden', NULL::uuid; RETURN;
  END IF;
  IF p_lead_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id=p_lead_id AND l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid
  ) THEN RETURN QUERY SELECT 'not_found', NULL::uuid; RETURN; END IF;
  IF p_action IN ('issue','renew') AND (p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' OR p_expires_at IS NULL OR p_expires_at <= now() OR p_expires_at > now() + interval '90 days') THEN
    RETURN QUERY SELECT 'invalid', NULL::uuid; RETURN;
  END IF;
  IF p_action = 'issue' THEN
    INSERT INTO public.oem_progress_links(lead_id,token_hash,issued_by,expires_at)
      VALUES(p_lead_id,p_token_hash,p_actor,p_expires_at) RETURNING * INTO created;
    INSERT INTO public.oem_lead_events(lead_id,event_type,details,created_by)
      VALUES(p_lead_id,'progress_link_issued',jsonb_build_object('link_id',created.id,'expires_at',created.expires_at),p_actor);
    RETURN QUERY SELECT 'issued', created.id; RETURN;
  END IF;
  SELECT * INTO existing FROM public.oem_progress_links WHERE id=p_link_id AND lead_id=p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found', NULL::uuid; RETURN; END IF;
  IF p_action='revoke' THEN
    UPDATE public.oem_progress_links SET revoked_at=coalesce(revoked_at,now()) WHERE id=existing.id;
    INSERT INTO public.oem_lead_events(lead_id,event_type,details,created_by)
      VALUES(p_lead_id,'progress_link_revoked',jsonb_build_object('link_id',existing.id),p_actor);
    RETURN QUERY SELECT 'revoked',existing.id; RETURN;
  END IF;
  INSERT INTO public.oem_progress_links(lead_id,token_hash,issued_by,expires_at,renewed_from)
    VALUES(p_lead_id,p_token_hash,p_actor,p_expires_at,existing.id) RETURNING * INTO created;
  UPDATE public.oem_progress_links SET revoked_at=coalesce(revoked_at,now()) WHERE id=existing.id;
  INSERT INTO public.oem_lead_events(lead_id,event_type,details,created_by)
    VALUES(p_lead_id,'progress_link_renewed',jsonb_build_object('link_id',created.id,'previous_link_id',existing.id,'expires_at',created.expires_at),p_actor);
  RETURN QUERY SELECT 'renewed',created.id;
END $$;

CREATE OR REPLACE FUNCTION public.get_oem_progress_portal(p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE link public.oem_progress_links%ROWTYPE; l public.leads%ROWTYPE; o public.oem_orders%ROWTYPE;
  f public.oem_order_fulfillment%ROWTYPE; s public.oem_settlements%ROWTYPE; received bigint; settlement_received bigint; settlement_refunded bigint;
  amount_kind text; agreed_amount bigint; remaining bigint; inv jsonb; invoice_gross bigint; can_reorder boolean;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO link FROM public.oem_progress_links WHERE token_hash=p_token_hash AND revoked_at IS NULL AND expires_at>now();
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO l FROM public.leads WHERE id=link.lead_id AND page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO o FROM public.oem_orders WHERE lead_id=l.id ORDER BY revision DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('linkExpiresAt',link.expires_at,'companyName',l.company_name,'contactName',l.contact_name,'order',NULL); END IF;
  IF o.status='cancelled' THEN RETURN jsonb_build_object('linkExpiresAt',link.expires_at,'companyName',l.company_name,'contactName',l.contact_name,'order',NULL); END IF;
  SELECT * INTO f FROM public.oem_order_fulfillment WHERE order_id=o.id;
  SELECT * INTO s FROM public.oem_settlements WHERE order_id=o.id AND state<>'void' ORDER BY revision DESC LIMIT 1;
  SELECT coalesce(sum(r.amount),0) INTO received FROM public.oem_payment_receipts r JOIN public.oem_payment_plans p ON p.id=r.plan_id WHERE p.order_id=o.id;
  SELECT coalesce(sum(c.amount) FILTER (WHERE c.direction='receipt'),0),coalesce(sum(c.amount) FILTER (WHERE c.direction='refund'),0) INTO settlement_received,settlement_refunded FROM public.oem_settlement_cash c WHERE c.order_id=o.id;
  SELECT (i.snapshot->>'grossTotal')::bigint INTO invoice_gross FROM public.oem_invoices i
    WHERE i.order_id=o.id AND i.lifecycle_status='active' AND (i.snapshot->>'grossTotal') ~ '^[0-9]+$'
    ORDER BY CASE WHEN i.stage='balance' THEN 0 ELSE 1 END, i.issued_at DESC, i.id DESC LIMIT 1;
  IF s.id IS NOT NULL AND s.state IN ('confirmed','settled') THEN
    amount_kind := CASE WHEN s.state='settled' THEN '精算確定額（税込）' ELSE '精算合意額（税込）' END;
    agreed_amount := s.target_gross; remaining := agreed_amount - (received + settlement_received - settlement_refunded);
  ELSIF invoice_gross IS NOT NULL THEN
    amount_kind := '請求書税込合計'; agreed_amount := invoice_gross; remaining := agreed_amount - received;
  ELSE
    amount_kind := CASE WHEN o.final_amount IS NOT NULL THEN '確定額（税別・請求書未発行）' ELSE '正式見積額（未確定・税別）' END;
    agreed_amount := NULL; remaining := NULL;
  END IF;
  can_reorder := o.status='shipped' AND ((s.id IS NOT NULL AND s.state='settled' AND s.target_gross=public.oem_settlement_net_received(o.id)) OR (s.id IS NULL AND invoice_gross IS NOT NULL AND received>=invoice_gross));
  -- Invoice routes require their own bearer token and are intentionally not exposed
  -- from this projection until a current, safe document token is available.
  inv := '[]'::jsonb;
  RETURN jsonb_build_object(
    'linkExpiresAt',link.expires_at,'companyName',l.company_name,'contactName',l.contact_name,
    'order',jsonb_build_object('id',o.id,'orderNumber',o.order_number,'status',o.status,'specification',o.specification,
      'selectedOptions','[]'::jsonb,'amountKind',amount_kind,'agreedAmount',agreed_amount,'canReorder',can_reorder,
      'receivedAmount',greatest(received + settlement_received - settlement_refunded,0),'outstandingAmount',CASE WHEN remaining IS NULL THEN NULL ELSE greatest(remaining,0) END,
      'paymentState',CASE WHEN s.id IS NOT NULL AND s.state='settled' THEN '精算完了' WHEN s.id IS NOT NULL THEN '精算確認中' WHEN agreed_amount IS NULL THEN '請求前／精算確認中' WHEN received=0 THEN '未入金' WHEN received<agreed_amount THEN '入金一部確認' ELSE '銀行入金確認済み' END,
      'productionDueDate',f.production_due_date,'shipmentDueDate',f.shipment_due_date,'plannedQuantity',f.planned_quantity,'quantityUnit',f.quantity_unit,
      'completedQuantity',f.completed_quantity,'completedOn',f.completed_on,'shippedOn',f.shipped_on,'carrier',f.carrier,'trackingNumber',f.tracking_number,
      'settlementState',coalesce(s.state,'none'),'documents',inv)
  );
END $$;

CREATE OR REPLACE FUNCTION public.request_oem_reorder(
  p_token_hash text, p_source_order_id uuid, p_request_id uuid, p_selection jsonb, p_actor uuid DEFAULT NULL
) RETURNS TABLE(result text, new_lead_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE link public.oem_progress_links%ROWTYPE; source public.oem_orders%ROWTYPE; oldlead public.leads%ROWTYPE; newlead public.leads%ROWTYPE; existing public.oem_reorder_requests%ROWTYPE; settle public.oem_settlements%ROWTYPE; safe_selection jsonb; selection_options jsonb; selection_spec text; actor_binding_v text; source_gross bigint;
BEGIN
  IF p_request_id IS NULL OR p_source_order_id IS NULL OR p_selection IS NULL OR jsonb_typeof(p_selection)<>'object' OR length(p_selection::text)>20000 THEN RETURN QUERY SELECT 'invalid',NULL::uuid; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_selection) k WHERE k NOT IN ('selectedOptions','specification')) OR
     NOT (p_selection ? 'selectedOptions') OR jsonb_typeof(p_selection->'selectedOptions')<>'array' OR
     (p_selection ? 'specification' AND (jsonb_typeof(p_selection->'specification')<>'string' OR length(p_selection->>'specification')>10000)) THEN
    RETURN QUERY SELECT 'invalid',NULL::uuid; RETURN;
  END IF;
  IF p_actor IS NULL THEN
    SELECT * INTO link FROM public.oem_progress_links WHERE token_hash=p_token_hash AND revoked_at IS NULL AND expires_at>now();
    IF NOT FOUND THEN RETURN QUERY SELECT 'unavailable',NULL::uuid; RETURN; END IF;
    SELECT * INTO source FROM public.oem_orders WHERE id=p_source_order_id AND lead_id=link.lead_id FOR SHARE;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.oem_mail_admins WHERE user_id=p_actor) THEN RETURN QUERY SELECT 'forbidden',NULL::uuid; RETURN; END IF;
    SELECT * INTO source FROM public.oem_orders WHERE id=p_source_order_id FOR SHARE;
  END IF;
  IF NOT FOUND OR source.status='cancelled' THEN RETURN QUERY SELECT 'state',NULL::uuid; RETURN; END IF;
  SELECT * INTO settle FROM public.oem_settlements WHERE order_id=source.id AND state<>'void' ORDER BY revision DESC LIMIT 1;
  -- Reorder is deliberately conservative: shipment and full settlement are both required.
  IF source.status<>'shipped' THEN RETURN QUERY SELECT 'state',NULL::uuid; RETURN; END IF;
  IF settle.id IS NOT NULL THEN
    IF settle.state IN ('draft','confirmed') THEN RETURN QUERY SELECT 'blocked',NULL::uuid; RETURN; END IF;
    IF settle.state<>'settled' OR settle.target_gross<>public.oem_settlement_net_received(source.id) THEN RETURN QUERY SELECT 'state',NULL::uuid; RETURN; END IF;
  ELSE
    SELECT (i.snapshot->>'grossTotal')::bigint INTO source_gross FROM public.oem_invoices i WHERE i.order_id=source.id AND i.lifecycle_status='active' AND (i.snapshot->>'grossTotal') ~ '^[0-9]+$' ORDER BY CASE WHEN i.stage='balance' THEN 0 ELSE 1 END, i.issued_at DESC, i.id DESC LIMIT 1;
    IF source_gross IS NULL OR public.oem_settlement_net_received(source.id)<source_gross THEN RETURN QUERY SELECT 'state',NULL::uuid; RETURN; END IF;
  END IF;
  actor_binding_v := CASE WHEN p_actor IS NULL THEN p_token_hash ELSE p_actor::text END;
  IF actor_binding_v IS NULL OR length(actor_binding_v) NOT BETWEEN 1 AND 64 THEN RETURN QUERY SELECT 'invalid',NULL::uuid; RETURN; END IF;
  -- Options are copied from the immutable source quote. Client-supplied options
  -- are intentionally ignored, and only canonical public labels are retained.
  selection_options := coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'question', CASE WHEN jsonb_typeof(x->'question')='string' AND length(x->>'question')<=200 THEN x->>'question' END,
    'answer', CASE WHEN jsonb_typeof(x->'answer')='string' AND length(x->>'answer')<=500 THEN x->>'answer' END,
    'key', CASE WHEN jsonb_typeof(x->'key')='string' AND length(x->>'key')<=100 THEN x->>'key' END,
    'product', CASE WHEN jsonb_typeof(x->'product')='string' AND length(x->>'product')<=200 THEN x->>'product' END)))
    FROM jsonb_array_elements(coalesce(source.quote_snapshot->'selectedOptions','[]'::jsonb)) x WHERE jsonb_typeof(x)='object'),'[]'::jsonb);
  selection_spec := nullif(trim(p_selection->>'specification'),'');
  safe_selection := jsonb_build_object('selectedOptions',selection_options,'specification',coalesce(selection_spec,''));
  -- Serialize same-key retries before reading the idempotency ledger.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  SELECT * INTO existing FROM public.oem_reorder_requests WHERE request_id=p_request_id;
  IF FOUND THEN
    IF existing.source_order_id=p_source_order_id AND existing.actor_binding=actor_binding_v AND existing.selection_snapshot=safe_selection THEN RETURN QUERY SELECT 'duplicate',existing.new_lead_id; ELSE RETURN QUERY SELECT 'conflict',NULL::uuid; END IF; RETURN;
  END IF;
  SELECT * INTO oldlead FROM public.leads WHERE id=source.lead_id AND page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::uuid; RETURN; END IF;
  INSERT INTO public.leads(page_id,company_name,contact_name,email,phone,selected_options,estimated_total_price,notes,status)
    VALUES(oldlead.page_id,oldlead.company_name,oldlead.contact_name,oldlead.email,oldlead.phone,
      selection_options,0,
      '再注文下書き。元発注の価格・承認・入金・特典・有効期限は引き継がない。', 'negotiating') RETURNING * INTO newlead;
  INSERT INTO public.oem_lead_cases(lead_id,final_spec_revision) VALUES(newlead.id,coalesce(selection_spec,source.specification));
  INSERT INTO public.oem_reorder_requests(request_id,source_order_id,source_lead_id,new_lead_id,actor_type,actor_id,actor_binding,selection_snapshot)
    VALUES(p_request_id,source.id,oldlead.id,newlead.id,CASE WHEN p_actor IS NULL THEN 'customer' ELSE 'admin' END,p_actor,actor_binding_v,safe_selection);
  INSERT INTO public.oem_lead_events(lead_id,event_type,details,created_by)
    VALUES(newlead.id,'reorder_draft_requested',jsonb_build_object('request_id',p_request_id,'source_order_id',source.id,'source_order_number',source.order_number,'selection',safe_selection),p_actor);
  RETURN QUERY SELECT 'created',newlead.id;
END $$;

REVOKE ALL ON FUNCTION public.manage_oem_progress_link(text,uuid,uuid,text,timestamptz,uuid),public.get_oem_progress_portal(text),public.request_oem_reorder(text,uuid,uuid,jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_oem_progress_link(text,uuid,uuid,text,timestamptz,uuid),public.get_oem_progress_portal(text),public.request_oem_reorder(text,uuid,uuid,jsonb,uuid) TO service_role;
COMMIT;
