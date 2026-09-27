-- Formal OEM orders and immutable customer agreement evidence.
BEGIN;

CREATE TABLE public.oem_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  order_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN (
    'issued','accepted','deposit_paid','in_production','balance_due','paid','shipped','cancelled'
  )),
  formal_quote_amount integer NOT NULL CHECK (formal_quote_amount > 0),
  deposit_amount integer NOT NULL CHECK (deposit_amount >= 0 AND deposit_amount <= formal_quote_amount),
  final_amount integer CHECK (final_amount IS NULL OR final_amount > 0),
  specification text NOT NULL CHECK (length(trim(specification)) > 0),
  quote_snapshot jsonb NOT NULL,
  quote_sha256 text NOT NULL CHECK (quote_sha256 ~ '^[0-9a-f]{64}$'),
  terms_version text NOT NULL,
  terms_title text NOT NULL,
  terms_body text NOT NULL,
  terms_sha256 text NOT NULL CHECK (terms_sha256 ~ '^[0-9a-f]{64}$'),
  access_token_hash text NOT NULL UNIQUE CHECK (access_token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, revision),
  CONSTRAINT oem_order_acceptance_state CHECK (
    (status = 'issued' AND accepted_at IS NULL)
    OR (status = 'cancelled')
    OR (status IN ('accepted','deposit_paid','in_production','balance_due','paid','shipped') AND accepted_at IS NOT NULL)
  ),
  CONSTRAINT oem_order_final_amount_state CHECK (
    status NOT IN ('balance_due','paid','shipped') OR final_amount IS NOT NULL
  )
);

CREATE TABLE public.oem_order_acceptances (
  order_id uuid PRIMARY KEY REFERENCES public.oem_orders(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL UNIQUE,
  company_name text NOT NULL,
  contact_name text NOT NULL,
  email text NOT NULL,
  terms_version text NOT NULL,
  terms_sha256 text NOT NULL CHECK (terms_sha256 ~ '^[0-9a-f]{64}$'),
  quote_sha256 text NOT NULL CHECK (quote_sha256 ~ '^[0-9a-f]{64}$'),
  ip_hash text NOT NULL CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  user_agent_hash text NOT NULL CHECK (user_agent_hash ~ '^[0-9a-f]{64}$'),
  accepted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_oem_orders_lead_created ON public.oem_orders(lead_id, created_at DESC);
CREATE INDEX idx_oem_orders_status ON public.oem_orders(status);
CREATE INDEX idx_oem_orders_expires ON public.oem_orders(expires_at) WHERE status = 'issued';

ALTER TABLE public.oem_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oem_order_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oem_orders, public.oem_order_acceptances FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.oem_orders, public.oem_order_acceptances TO service_role;

CREATE OR REPLACE FUNCTION public.accept_oem_order(
  p_token_hash text,
  p_request_id uuid,
  p_contact_name text,
  p_terms_version text,
  p_terms_sha256 text,
  p_quote_sha256 text,
  p_ip_hash text,
  p_user_agent_hash text
) RETURNS TABLE(result text, order_id uuid, order_number text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.oem_orders%ROWTYPE;
  v_lead public.leads%ROWTYPE;
  v_existing public.oem_order_acceptances%ROWTYPE;
BEGIN
  IF p_token_hash !~ '^[0-9a-f]{64}$' OR p_contact_name IS NULL OR length(trim(p_contact_name)) NOT BETWEEN 1 AND 100
     OR p_terms_version IS NULL OR p_terms_sha256 !~ '^[0-9a-f]{64}$' OR p_quote_sha256 !~ '^[0-9a-f]{64}$'
     OR p_ip_hash !~ '^[0-9a-f]{64}$' OR p_user_agent_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text; RETURN;
  END IF;

  SELECT * INTO v_existing FROM public.oem_order_acceptances WHERE request_id = p_request_id;
  IF FOUND THEN
    SELECT * INTO v_order FROM public.oem_orders WHERE id = v_existing.order_id;
    IF v_order.access_token_hash = p_token_hash AND v_existing.contact_name = trim(p_contact_name)
       AND v_existing.terms_version = p_terms_version AND v_existing.terms_sha256 = p_terms_sha256
       AND v_existing.quote_sha256 = p_quote_sha256 THEN
      RETURN QUERY SELECT 'accepted'::text, v_order.id, v_order.order_number; RETURN;
    END IF;
    RETURN QUERY SELECT 'conflict'::text, NULL::uuid, NULL::text; RETURN;
  END IF;

  SELECT * INTO v_order FROM public.oem_orders WHERE access_token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::text; RETURN; END IF;
  IF v_order.status <> 'issued' THEN
    IF v_order.accepted_at IS NOT NULL THEN RETURN QUERY SELECT 'accepted'::text, v_order.id, v_order.order_number; RETURN; END IF;
    RETURN QUERY SELECT 'unavailable'::text, NULL::uuid, NULL::text; RETURN;
  END IF;
  IF v_order.expires_at <= now() THEN RETURN QUERY SELECT 'expired'::text, NULL::uuid, NULL::text; RETURN; END IF;
  IF v_order.terms_version <> p_terms_version OR v_order.terms_sha256 <> p_terms_sha256 OR v_order.quote_sha256 <> p_quote_sha256 THEN
    RETURN QUERY SELECT 'changed'::text, NULL::uuid, NULL::text; RETURN;
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = v_order.lead_id;
  IF NOT FOUND OR v_lead.page_id <> '35e7d402-0443-4703-94a4-fc2873b8f933'::uuid THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::text; RETURN;
  END IF;

  INSERT INTO public.oem_order_acceptances(
    order_id,request_id,company_name,contact_name,email,terms_version,terms_sha256,quote_sha256,ip_hash,user_agent_hash
  ) VALUES (
    v_order.id,p_request_id,v_lead.company_name,trim(p_contact_name),v_lead.email,
    v_order.terms_version,v_order.terms_sha256,v_order.quote_sha256,p_ip_hash,p_user_agent_hash
  );
  UPDATE public.oem_orders SET status='accepted', accepted_at=now(), updated_at=now() WHERE id=v_order.id AND status='issued';
  UPDATE public.leads SET status='won' WHERE id=v_order.lead_id;
  INSERT INTO public.oem_lead_events(lead_id,event_type,details)
    VALUES(v_order.lead_id,'order_accepted',jsonb_build_object('order_id',v_order.id,'order_number',v_order.order_number,'terms_version',v_order.terms_version));
  RETURN QUERY SELECT 'accepted'::text, v_order.id, v_order.order_number;
END $$;

REVOKE ALL ON FUNCTION public.accept_oem_order(text,uuid,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_oem_order(text,uuid,text,text,text,text,text,text) TO service_role;

CREATE TRIGGER set_oem_orders_updated_at
  BEFORE UPDATE ON public.oem_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMIT;
