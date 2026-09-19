-- Additive OEM-only durable email queue. Existing LP mail is unchanged.
BEGIN;
CREATE TABLE public.oem_mail_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('customer','admin')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','unknown')),
  attempts integer NOT NULL DEFAULT 0,
  attempt_key uuid,
  first_attempt_at timestamptz,
  locked_at timestamptz,
  provider_id text,
  error_code text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lead_id,kind)
);
ALTER TABLE public.oem_mail_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oem_mail_deliveries FROM anon,authenticated;
GRANT ALL ON public.oem_mail_deliveries TO service_role;

CREATE FUNCTION public.claim_oem_mail(p_id uuid) RETURNS SETOF public.oem_mail_deliveries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.oem_mail_deliveries;
BEGIN
 SELECT * INTO r FROM public.oem_mail_deliveries WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.status='sent' THEN RETURN; END IF;
 IF r.status='sending' AND r.locked_at > now()-interval '5 minutes' THEN RETURN; END IF;
 -- Ambiguous results reuse the provider idempotency key within its 24h window.
 -- Outside that window require investigation instead of risking duplicate mail.
 IF r.status IN ('sending','unknown') AND r.first_attempt_at < now()-interval '23 hours' THEN
   UPDATE public.oem_mail_deliveries SET status='unknown',error_code='manual_check_required',updated_at=now() WHERE id=p_id;
   RETURN;
 END IF;
 UPDATE public.oem_mail_deliveries SET status='sending',attempts=attempts+1,
   attempt_key=CASE WHEN r.status IN ('pending','failed') THEN gen_random_uuid() ELSE r.attempt_key END,
   first_attempt_at=CASE WHEN r.status IN ('pending','failed') THEN now() ELSE r.first_attempt_at END,
   locked_at=now(),updated_at=now(),error_code=NULL WHERE id=p_id;
 RETURN QUERY SELECT * FROM public.oem_mail_deliveries WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.claim_oem_mail(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_oem_mail(uuid) TO service_role;
COMMIT;
