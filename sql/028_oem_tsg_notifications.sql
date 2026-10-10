-- Durable, service-role-only outbox for notifying TSG of newly received OEM consultations.
-- This migration deliberately creates rows only for consultations accepted after it is installed.
BEGIN;

CREATE TABLE public.oem_tsg_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL UNIQUE REFERENCES public.leads(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','blocked')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_token UUID,
  locked_until TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  post_id UUID,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT oem_tsg_payload_contract CHECK (
    jsonb_typeof(payload) = 'object'
    AND payload->>'schemaVersion' = '1'
    AND payload->>'event' = 'consultation_received'
    AND payload->>'sourceKey' = source_key
    AND payload->>'leadId' = lead_id::TEXT
    AND length(coalesce(payload->>'companyName', '')) > 0
    AND length(coalesce(payload->>'productName', '')) > 0
    AND length(coalesce(payload->>'quantityLabel', '')) > 0
  )
);

CREATE INDEX oem_tsg_notifications_due_idx
  ON public.oem_tsg_notifications(status, next_attempt_at, locked_until);

CREATE OR REPLACE FUNCTION public.normalize_oem_tsg_text(p_value TEXT, p_fallback TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(nullif(left(trim(regexp_replace(coalesce(p_value, ''), '[[:cntrl:]]+', ' ', 'g')), 200), ''), p_fallback)
$$;

ALTER TABLE public.oem_tsg_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oem_tsg_notifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.oem_tsg_notifications TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_oem_tsg_payload_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.lead_id IS DISTINCT FROM OLD.lead_id
     OR NEW.source_key IS DISTINCT FROM OLD.source_key THEN
    RAISE EXCEPTION 'OEM TSG notification identity/payload is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER oem_tsg_notifications_immutable
  BEFORE UPDATE ON public.oem_tsg_notifications
  FOR EACH ROW EXECUTE FUNCTION public.prevent_oem_tsg_payload_change();

CREATE OR REPLACE FUNCTION public.claim_oem_tsg_notification(p_lead_id UUID DEFAULT NULL)
RETURNS SETOF public.oem_tsg_notifications
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.oem_tsg_notifications;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RETURN; END IF;
  SELECT * INTO r
    FROM public.oem_tsg_notifications
   WHERE (p_lead_id IS NULL OR lead_id = p_lead_id)
     AND (
       (status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= now()))
       OR (status = 'sending' AND (locked_until IS NULL OR locked_until <= now()))
     )
   ORDER BY created_at, id
   FOR UPDATE SKIP LOCKED
   LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.oem_tsg_notifications
     SET status = 'sending', attempts = r.attempts + 1,
         lease_token = gen_random_uuid(), locked_until = now() + interval '2 minutes',
         updated_at = now(), error_code = NULL
   WHERE id = r.id;
  RETURN QUERY SELECT * FROM public.oem_tsg_notifications WHERE id = r.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_oem_tsg_notification(
  p_id UUID,
  p_lease_token UUID,
  p_post_id UUID DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_retryable BOOLEAN DEFAULT TRUE
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_attempts INTEGER;
  v_error TEXT := left(regexp_replace(coalesce(p_error_code, 'unknown_error'), '[\r\n]', ' ', 'g'), 200);
  v_delay INTEGER;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_id IS NULL OR p_lease_token IS NULL THEN RETURN FALSE; END IF;
  SELECT attempts INTO v_attempts
    FROM public.oem_tsg_notifications
   WHERE id = p_id AND lease_token = p_lease_token AND status = 'sending'
   FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF p_post_id IS NOT NULL THEN
    UPDATE public.oem_tsg_notifications
       SET status = 'sent', post_id = p_post_id, error_code = NULL,
           locked_until = NULL, next_attempt_at = NULL, updated_at = now()
     WHERE id = p_id AND lease_token = p_lease_token AND status = 'sending';
  ELSIF p_retryable THEN
    v_delay := LEAST(3600, 60 * power(2, LEAST(6, greatest(0, v_attempts - 1))))::INTEGER;
    UPDATE public.oem_tsg_notifications
       SET status = 'pending', error_code = v_error, locked_until = NULL,
           next_attempt_at = now() + make_interval(secs => v_delay), updated_at = now()
     WHERE id = p_id AND lease_token = p_lease_token AND status = 'sending';
  ELSE
    UPDATE public.oem_tsg_notifications
       SET status = 'blocked', error_code = v_error, locked_until = NULL,
           next_attempt_at = NULL, updated_at = now()
     WHERE id = p_id AND lease_token = p_lease_token AND status = 'sending';
  END IF;
  RETURN FOUND;
END;
$$;

-- Replace the existing function with the same signature and preserve all prior intake behavior.
CREATE OR REPLACE FUNCTION public.reserve_oem_lead(
  p_idempotency_key UUID, p_payload_hash TEXT, p_email_hash TEXT, p_ip_hash TEXT,
  p_lead JSONB, p_mail_payloads JSONB, p_window_seconds INTEGER DEFAULT 3600,
  p_rate_limit INTEGER DEFAULT 5
)
RETURNS TABLE(status TEXT, lead_id UUID, retry_after_seconds INTEGER, reason TEXT, duplicate BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing public.oem_intake_requests%ROWTYPE;
  v_bucket TIMESTAMPTZ; v_ip_hits INTEGER; v_email_hits INTEGER;
  v_lead_id UUID; v_received_at TIMESTAMPTZ;
  v_page_id UUID := '35e7d402-0443-4703-94a4-fc2873b8f933';
  v_options JSONB := CASE WHEN jsonb_typeof(p_lead->'selected_options') = 'array' THEN p_lead->'selected_options' ELSE '[]'::jsonb END;
  v_product TEXT; v_quantity TEXT; v_price INTEGER;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RETURN QUERY SELECT 'rejected',NULL::UUID,NULL::INTEGER,'invalid_request',FALSE; RETURN; END IF;
  IF p_idempotency_key IS NULL OR p_payload_hash IS NULL OR p_email_hash IS NULL OR p_ip_hash IS NULL
     OR p_lead IS NULL OR p_mail_payloads IS NULL OR p_window_seconds < 1 OR p_rate_limit < 1
     OR p_lead->>'page_id' IS DISTINCT FROM v_page_id::TEXT
     OR jsonb_typeof(p_mail_payloads->'customer') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_mail_payloads->'admin') IS DISTINCT FROM 'object' THEN
    RETURN QUERY SELECT 'rejected',NULL::UUID,NULL::INTEGER,'invalid_request',FALSE; RETURN;
  END IF;
  INSERT INTO public.oem_intake_requests(idempotency_key,payload_hash) VALUES(p_idempotency_key,p_payload_hash) ON CONFLICT DO NOTHING;
  SELECT * INTO v_existing FROM public.oem_intake_requests WHERE idempotency_key=p_idempotency_key FOR UPDATE;
  IF v_existing.accepted_at IS NOT NULL AND v_existing.lead_id IS NULL THEN RETURN QUERY SELECT 'rejected',NULL::UUID,NULL::INTEGER,'invalid_request',FALSE; RETURN; END IF;
  IF v_existing.lead_id IS NOT NULL OR v_existing.payload_hash <> p_payload_hash THEN
    IF v_existing.payload_hash <> p_payload_hash THEN RETURN QUERY SELECT 'rejected',v_existing.lead_id,NULL::INTEGER,'idempotency_payload_mismatch',FALSE;
    ELSE RETURN QUERY SELECT 'duplicate',v_existing.lead_id,NULL::INTEGER,NULL::TEXT,TRUE; END IF; RETURN;
  END IF;
  v_bucket := to_timestamp(floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds);
  INSERT INTO public.oem_intake_rate_buckets(bucket_start,dimension,fingerprint,hits) VALUES(v_bucket,'ip',p_ip_hash,1)
    ON CONFLICT(bucket_start,dimension,fingerprint) DO UPDATE SET hits=public.oem_intake_rate_buckets.hits+1 RETURNING hits INTO v_ip_hits;
  INSERT INTO public.oem_intake_rate_buckets(bucket_start,dimension,fingerprint,hits) VALUES(v_bucket,'email',p_email_hash,1)
    ON CONFLICT(bucket_start,dimension,fingerprint) DO UPDATE SET hits=public.oem_intake_rate_buckets.hits+1 RETURNING hits INTO v_email_hits;
  IF v_ip_hits > p_rate_limit OR v_email_hits > p_rate_limit THEN
    DELETE FROM public.oem_intake_requests WHERE idempotency_key=p_idempotency_key;
    RETURN QUERY SELECT 'rejected',NULL::UUID,GREATEST(1,ceil(extract(epoch FROM (v_bucket+make_interval(secs=>p_window_seconds)-clock_timestamp())))::INTEGER),'rate_limited',FALSE; RETURN;
  END IF;
  DELETE FROM public.oem_intake_rate_buckets WHERE bucket_start < clock_timestamp()-INTERVAL '2 days';
  INSERT INTO public.leads(page_id,company_name,contact_name,email,phone,selected_options,estimated_total_price,notes)
    VALUES(v_page_id,p_lead->>'company_name',p_lead->>'contact_name',p_lead->>'email',NULLIF(p_lead->>'phone',''),v_options,coalesce((p_lead->>'estimated_total_price')::INTEGER,0),p_lead->>'notes')
    RETURNING id,created_at,estimated_total_price INTO v_lead_id,v_received_at,v_price;
  UPDATE public.oem_intake_requests SET lead_id=v_lead_id,accepted_at=clock_timestamp() WHERE idempotency_key=p_idempotency_key;
  INSERT INTO public.oem_mail_deliveries(lead_id,kind,payload) VALUES(v_lead_id,'customer',p_mail_payloads->'customer'),(v_lead_id,'admin',p_mail_payloads->'admin') ON CONFLICT ON CONSTRAINT oem_mail_deliveries_lead_id_kind_key DO NOTHING;
  SELECT public.normalize_oem_tsg_text(x->>'answer','未指定') INTO v_product FROM jsonb_array_elements(v_options) x WHERE x->>'question'='商品' LIMIT 1;
  SELECT public.normalize_oem_tsg_text(x->>'answer','管理画面で確認') INTO v_quantity FROM jsonb_array_elements(v_options) x WHERE x->>'question'='OEM製造数' LIMIT 1;
  v_product := coalesce(v_product, '未指定');
  v_quantity := coalesce(v_quantity, '管理画面で確認');
  INSERT INTO public.oem_tsg_notifications(lead_id,source_key,payload)
    VALUES(v_lead_id,'oem:consultation:'||v_lead_id::TEXT||':received:v1',jsonb_build_object('schemaVersion',1,'event','consultation_received','sourceKey','oem:consultation:'||v_lead_id::TEXT||':received:v1','leadId',v_lead_id,'receivedAt',v_received_at,'companyName',public.normalize_oem_tsg_text(p_lead->>'company_name','未指定'),'productName',v_product,'quantityLabel',v_quantity,'estimatedTotalPrice',v_price))
    ON CONFLICT ON CONSTRAINT oem_tsg_notifications_lead_id_key DO NOTHING;
  RETURN QUERY SELECT 'reserved',v_lead_id,NULL::INTEGER,NULL::TEXT,FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_oem_tsg_notification(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_oem_tsg_notification(UUID,UUID,UUID,TEXT,BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_oem_lead(UUID,TEXT,TEXT,TEXT,JSONB,JSONB,INTEGER,INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_oem_tsg_notification(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_oem_tsg_notification(UUID,UUID,UUID,TEXT,BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_oem_lead(UUID,TEXT,TEXT,TEXT,JSONB,JSONB,INTEGER,INTEGER) TO service_role;
COMMIT;
