-- Add an explicitly unestimated consultation intake without weakening the quote path.
BEGIN;
ALTER TABLE public.leads ADD COLUMN intake_kind TEXT NOT NULL DEFAULT 'quote';
ALTER TABLE public.leads ADD COLUMN consultation_theme TEXT;
ALTER TABLE public.leads ALTER COLUMN estimated_total_price DROP NOT NULL;
ALTER TABLE public.leads ADD CONSTRAINT oem_intake_kind CHECK (intake_kind IN ('quote','consultation'));
ALTER TABLE public.leads ADD CONSTRAINT oem_consultation_unestimated CHECK (
  (intake_kind='quote' AND estimated_total_price IS NOT NULL AND consultation_theme IS NULL)
  OR (intake_kind='consultation' AND page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::UUID
      AND page_id IS NOT NULL AND estimated_total_price IS NULL AND consultation_theme IS NOT NULL
      AND consultation_theme IN ('product_feasibility','ingredients','cost_lot','other'))
);
-- Existing v1 snapshots remain unchanged. Only new consultation snapshots use v2/null.
ALTER TABLE public.oem_tsg_notifications DROP CONSTRAINT oem_tsg_payload_contract;
ALTER TABLE public.oem_tsg_notifications ADD CONSTRAINT oem_tsg_payload_contract CHECK ((
  jsonb_typeof(payload)='object' AND payload->>'event'='consultation_received'
  AND payload->>'sourceKey'=source_key AND payload->>'leadId'=lead_id::TEXT
  AND length(coalesce(payload->>'companyName',''))>0
  AND length(coalesce(payload->>'productName',''))>0
  AND length(coalesce(payload->>'quantityLabel',''))>0
  AND ((payload->>'schemaVersion'='1' AND jsonb_typeof(payload->'estimatedTotalPrice')='number')
       OR (payload->>'schemaVersion'='2' AND jsonb_typeof(payload->'estimatedTotalPrice')='null'))
) IS TRUE);

-- Unestimated deliveries stay durable while the separately owned receiver is
-- being upgraded. Old workers continue to claim v1 deliveries only.
CREATE FUNCTION public.claim_oem_tsg_notification_batch(p_lead_id UUID, p_include_unestimated BOOLEAN)
RETURNS SETOF public.oem_tsg_notifications
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.oem_tsg_notifications;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RETURN; END IF;
  SELECT * INTO r FROM public.oem_tsg_notifications
   WHERE (p_lead_id IS NULL OR lead_id=p_lead_id)
     AND (payload->>'schemaVersion'='1' OR (p_include_unestimated IS TRUE AND payload->>'schemaVersion'='2'))
     AND ((status='pending' AND (next_attempt_at IS NULL OR next_attempt_at<=now()))
       OR (status='sending' AND (locked_until IS NULL OR locked_until<=now())))
   ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.oem_tsg_notifications SET status='sending',attempts=r.attempts+1,
    lease_token=gen_random_uuid(),locked_until=now()+interval '2 minutes',updated_at=now(),error_code=NULL WHERE id=r.id;
  RETURN QUERY SELECT * FROM public.oem_tsg_notifications WHERE id=r.id;
END;
$$;
CREATE OR REPLACE FUNCTION public.claim_oem_tsg_notification(p_lead_id UUID DEFAULT NULL)
RETURNS SETOF public.oem_tsg_notifications
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM public.claim_oem_tsg_notification_batch(p_lead_id,FALSE)
$$;
REVOKE ALL ON FUNCTION public.claim_oem_tsg_notification_batch(UUID,BOOLEAN) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_oem_tsg_notification_batch(UUID,BOOLEAN) TO service_role;

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
  v_kind TEXT := coalesce(p_lead->>'intake_kind','quote');
  v_theme TEXT := p_lead->>'consultation_theme';
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RETURN QUERY SELECT 'rejected',NULL::UUID,NULL::INTEGER,'invalid_request',FALSE; RETURN; END IF;
  IF p_idempotency_key IS NULL OR p_payload_hash IS NULL OR p_email_hash IS NULL OR p_ip_hash IS NULL
     OR p_lead IS NULL OR p_mail_payloads IS NULL OR p_window_seconds < 1 OR p_rate_limit < 1
     OR p_lead->>'page_id' IS DISTINCT FROM v_page_id::TEXT
     OR v_kind NOT IN ('quote','consultation')
     OR (v_kind='consultation' AND (v_theme IS NULL OR v_theme NOT IN ('product_feasibility','ingredients','cost_lot','other')
         OR jsonb_typeof(p_lead->'estimated_total_price') IS DISTINCT FROM 'null'))
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
  INSERT INTO public.leads(page_id,company_name,contact_name,email,phone,selected_options,estimated_total_price,notes,intake_kind,consultation_theme)
    VALUES(v_page_id,p_lead->>'company_name',p_lead->>'contact_name',p_lead->>'email',NULLIF(p_lead->>'phone',''),v_options,CASE WHEN v_kind='consultation' THEN NULL ELSE coalesce((p_lead->>'estimated_total_price')::INTEGER,0) END,p_lead->>'notes',v_kind,CASE WHEN v_kind='consultation' THEN v_theme END)
    RETURNING id,created_at,estimated_total_price INTO v_lead_id,v_received_at,v_price;
  UPDATE public.oem_intake_requests SET lead_id=v_lead_id,accepted_at=clock_timestamp() WHERE idempotency_key=p_idempotency_key;
  INSERT INTO public.oem_mail_deliveries(lead_id,kind,payload) VALUES(v_lead_id,'customer',p_mail_payloads->'customer'),(v_lead_id,'admin',p_mail_payloads->'admin') ON CONFLICT ON CONSTRAINT oem_mail_deliveries_lead_id_kind_key DO NOTHING;
  SELECT public.normalize_oem_tsg_text(x->>'answer','未指定') INTO v_product FROM jsonb_array_elements(v_options) x WHERE x->>'question'='商品' LIMIT 1;
  SELECT public.normalize_oem_tsg_text(x->>'answer','管理画面で確認') INTO v_quantity FROM jsonb_array_elements(v_options) x WHERE x->>'question'='OEM製造数' LIMIT 1;
  v_product := coalesce(v_product, '未指定');
  v_quantity := CASE WHEN v_kind='consultation' THEN '未定（相談のみ）' ELSE coalesce(v_quantity, '管理画面で確認') END;
  INSERT INTO public.oem_tsg_notifications(lead_id,source_key,payload)
    VALUES(v_lead_id,'oem:consultation:'||v_lead_id::TEXT||':received:v1',jsonb_build_object('schemaVersion',CASE WHEN v_kind='consultation' THEN 2 ELSE 1 END,'event','consultation_received','sourceKey','oem:consultation:'||v_lead_id::TEXT||':received:v1','leadId',v_lead_id,'receivedAt',v_received_at,'companyName',public.normalize_oem_tsg_text(p_lead->>'company_name','未指定'),'productName',v_product,'quantityLabel',v_quantity,'estimatedTotalPrice',v_price))
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
