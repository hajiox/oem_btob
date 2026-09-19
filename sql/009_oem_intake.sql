-- Atomic OEM intake reservation. This migration intentionally keeps raw IP/email
-- out of the database: only HMAC digests produced by the server are accepted.
BEGIN;

CREATE TABLE IF NOT EXISTS public.oem_intake_requests (
  idempotency_key UUID PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.oem_intake_requests ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.oem_intake_rate_buckets (
  bucket_start TIMESTAMPTZ NOT NULL,
  dimension TEXT NOT NULL CHECK (dimension IN ('ip', 'email')),
  fingerprint TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_start, dimension, fingerprint)
);

ALTER TABLE public.oem_intake_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oem_intake_rate_buckets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.oem_intake_requests, public.oem_intake_rate_buckets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.oem_intake_requests, public.oem_intake_rate_buckets TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_oem_lead(
  p_idempotency_key UUID,
  p_payload_hash TEXT,
  p_email_hash TEXT,
  p_ip_hash TEXT,
  p_lead JSONB,
  p_mail_payloads JSONB,
  p_window_seconds INTEGER DEFAULT 3600,
  p_rate_limit INTEGER DEFAULT 5
)
RETURNS TABLE(status TEXT, lead_id UUID, retry_after_seconds INTEGER, reason TEXT, duplicate BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.oem_intake_requests%ROWTYPE;
  v_bucket TIMESTAMPTZ;
  v_ip_hits INTEGER;
  v_email_hits INTEGER;
  v_lead_id UUID;
  v_page_id UUID := '35e7d402-0443-4703-94a4-fc2873b8f933';
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN QUERY SELECT 'rejected', NULL::UUID, NULL::INTEGER, 'invalid_request', FALSE;
    RETURN;
  END IF;
  IF p_idempotency_key IS NULL OR p_payload_hash IS NULL OR p_email_hash IS NULL OR p_ip_hash IS NULL
     OR p_lead IS NULL OR p_mail_payloads IS NULL OR p_window_seconds < 1 OR p_rate_limit < 1
     OR p_lead->>'page_id' IS DISTINCT FROM v_page_id::TEXT
     OR jsonb_typeof(p_mail_payloads->'customer') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_mail_payloads->'admin') IS DISTINCT FROM 'object' THEN
    RETURN QUERY SELECT 'rejected', NULL::UUID, NULL::INTEGER, 'invalid_request', FALSE;
    RETURN;
  END IF;

  -- Idempotency is checked before rate limiting: a retry of a previously accepted
  -- request is safe and does not consume another rate-limit token.
  INSERT INTO public.oem_intake_requests(idempotency_key, payload_hash)
    VALUES (p_idempotency_key, p_payload_hash)
    ON CONFLICT (idempotency_key) DO NOTHING;
  SELECT * INTO v_existing FROM public.oem_intake_requests WHERE idempotency_key = p_idempotency_key FOR UPDATE;
  IF v_existing.accepted_at IS NOT NULL AND v_existing.lead_id IS NULL THEN
    RETURN QUERY SELECT 'rejected', NULL::UUID, NULL::INTEGER, 'invalid_request', FALSE;
    RETURN;
  END IF;
  -- A newly inserted row has no lead yet; it is the transaction's reservation.
  IF v_existing.lead_id IS NOT NULL OR v_existing.payload_hash <> p_payload_hash THEN
    IF v_existing.payload_hash <> p_payload_hash THEN
      RETURN QUERY SELECT 'rejected', v_existing.lead_id, NULL::INTEGER, 'idempotency_payload_mismatch', FALSE;
    ELSE
      RETURN QUERY SELECT 'duplicate', v_existing.lead_id, NULL::INTEGER, NULL::TEXT, TRUE;
    END IF;
    RETURN;
  END IF;

  v_bucket := to_timestamp(floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds);
  INSERT INTO public.oem_intake_rate_buckets(bucket_start, dimension, fingerprint, hits)
    VALUES (v_bucket, 'ip', p_ip_hash, 1)
    ON CONFLICT (bucket_start, dimension, fingerprint)
    DO UPDATE SET hits = public.oem_intake_rate_buckets.hits + 1
    RETURNING hits INTO v_ip_hits;
  INSERT INTO public.oem_intake_rate_buckets(bucket_start, dimension, fingerprint, hits)
    VALUES (v_bucket, 'email', p_email_hash, 1)
    ON CONFLICT (bucket_start, dimension, fingerprint)
    DO UPDATE SET hits = public.oem_intake_rate_buckets.hits + 1
    RETURNING hits INTO v_email_hits;
  IF v_ip_hits > p_rate_limit OR v_email_hits > p_rate_limit THEN
    DELETE FROM public.oem_intake_requests WHERE idempotency_key = p_idempotency_key;
    RETURN QUERY SELECT 'rejected', NULL::UUID,
      GREATEST(1, ceil(extract(epoch FROM (v_bucket + make_interval(secs => p_window_seconds) - clock_timestamp())))::INTEGER),
      'rate_limited', FALSE;
    RETURN;
  END IF;

  DELETE FROM public.oem_intake_rate_buckets
   WHERE bucket_start < clock_timestamp() - INTERVAL '2 days';
  INSERT INTO public.leads(page_id, company_name, contact_name, email, phone, selected_options, estimated_total_price, notes)
    VALUES (v_page_id, p_lead->>'company_name', p_lead->>'contact_name', p_lead->>'email',
      NULLIF(p_lead->>'phone', ''), COALESCE(p_lead->'selected_options', '[]'::JSONB),
      COALESCE((p_lead->>'estimated_total_price')::INTEGER, 0), p_lead->>'notes')
    RETURNING id INTO v_lead_id;

  UPDATE public.oem_intake_requests
     SET lead_id = v_lead_id, accepted_at = clock_timestamp()
   WHERE idempotency_key = p_idempotency_key;
  INSERT INTO public.oem_mail_deliveries(lead_id, kind, payload)
    VALUES (v_lead_id, 'customer', p_mail_payloads->'customer'), (v_lead_id, 'admin', p_mail_payloads->'admin')
    ON CONFLICT ON CONSTRAINT oem_mail_deliveries_lead_id_kind_key DO NOTHING;
  RETURN QUERY SELECT 'reserved', v_lead_id, NULL::INTEGER, NULL::TEXT, FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_oem_lead(UUID, TEXT, TEXT, TEXT, JSONB, JSONB, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_oem_lead(UUID, TEXT, TEXT, TEXT, JSONB, JSONB, INTEGER, INTEGER) TO service_role;
COMMIT;
