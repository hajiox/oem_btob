-- OEM-only case operations. No public intake path uses these tables.
BEGIN;

CREATE TABLE public.oem_lead_cases (
  lead_id uuid PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  internal_notes text,
  next_followup_at timestamptz,
  raw_material_condition text,
  trial_notes text,
  recipe_notes text,
  work_time_notes text,
  yield_notes text,
  issue_notes text,
  final_spec_revision text,
  customer_approval_evidence text,
  customer_approval_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oem_approval_pair CHECK ((customer_approval_evidence IS NULL) = (customer_approval_at IS NULL)),
  CONSTRAINT oem_approval_requires_spec CHECK (customer_approval_at IS NULL OR (length(trim(customer_approval_evidence)) > 0 AND length(trim(COALESCE(final_spec_revision,''))) > 0))
);

CREATE TABLE public.oem_lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oem_lead_events_lead_created_idx ON public.oem_lead_events(lead_id, created_at);
CREATE INDEX oem_lead_cases_followup_idx ON public.oem_lead_cases(next_followup_at);

ALTER TABLE public.oem_lead_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oem_lead_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY oem_case_read ON public.oem_lead_cases FOR SELECT USING (
  (SELECT auth.uid()) IS NOT NULL AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id=lead_id AND l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933')
);
CREATE POLICY oem_case_write ON public.oem_lead_cases FOR INSERT WITH CHECK (
  (SELECT auth.uid()) IS NOT NULL AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id=lead_id AND l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933')
);
CREATE POLICY oem_case_update ON public.oem_lead_cases FOR UPDATE USING ((SELECT auth.uid()) IS NOT NULL AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id=lead_id AND l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933')) WITH CHECK (EXISTS (SELECT 1 FROM public.leads l WHERE l.id=lead_id AND l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933'));
CREATE POLICY oem_event_read ON public.oem_lead_events FOR SELECT USING (
  (SELECT auth.uid()) IS NOT NULL AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id=lead_id AND l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933')
);
REVOKE ALL ON public.oem_lead_cases, public.oem_lead_events FROM anon;
REVOKE ALL ON public.oem_lead_cases, public.oem_lead_events FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.oem_lead_cases TO authenticated;
GRANT SELECT ON public.oem_lead_events TO authenticated;
GRANT ALL ON public.oem_lead_cases, public.oem_lead_events TO service_role;

CREATE OR REPLACE FUNCTION public.touch_oem_case() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER oem_case_updated BEFORE UPDATE ON public.oem_lead_cases FOR EACH ROW EXECUTE FUNCTION public.touch_oem_case();

CREATE OR REPLACE FUNCTION public.record_oem_case_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed jsonb := '{}'::jsonb; k text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.oem_lead_events(lead_id,event_type,details,created_by) VALUES (NEW.lead_id,'case_created',jsonb_build_object('after',to_jsonb(NEW)),auth.uid());
    RETURN NEW;
  END IF;
  FOREACH k IN ARRAY ARRAY['internal_notes','next_followup_at','raw_material_condition','trial_notes','recipe_notes','work_time_notes','yield_notes','issue_notes','final_spec_revision','customer_approval_evidence','customer_approval_at'] LOOP
    IF to_jsonb(OLD)->k IS DISTINCT FROM to_jsonb(NEW)->k THEN changed := changed || jsonb_build_object(k,jsonb_build_object('before',to_jsonb(OLD)->k,'after',to_jsonb(NEW)->k)); END IF;
  END LOOP;
  IF changed <> '{}'::jsonb THEN INSERT INTO public.oem_lead_events(lead_id,event_type,details,created_by) VALUES (NEW.lead_id,'case_updated',changed,auth.uid()); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER oem_case_event AFTER INSERT OR UPDATE ON public.oem_lead_cases FOR EACH ROW EXECUTE FUNCTION public.record_oem_case_event();

CREATE OR REPLACE FUNCTION public.invalidate_oem_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.final_spec_revision IS DISTINCT FROM OLD.final_spec_revision
     AND NEW.customer_approval_evidence IS NOT DISTINCT FROM OLD.customer_approval_evidence
     AND NEW.customer_approval_at IS NOT DISTINCT FROM OLD.customer_approval_at THEN
    NEW.customer_approval_evidence := NULL; NEW.customer_approval_at := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER oem_case_approval_invalidate BEFORE UPDATE ON public.oem_lead_cases FOR EACH ROW EXECUTE FUNCTION public.invalidate_oem_approval();

CREATE OR REPLACE FUNCTION public.record_oem_status_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.page_id='35e7d402-0443-4703-94a4-fc2873b8f933' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.oem_lead_events(lead_id,event_type,details,created_by) VALUES (NEW.id,'status_changed',jsonb_build_object('before',OLD.status,'after',NEW.status),auth.uid());
  END IF; RETURN NEW;
END $$;
CREATE TRIGGER oem_lead_status_event AFTER UPDATE OF status ON public.leads FOR EACH ROW EXECUTE FUNCTION public.record_oem_status_event();

-- Aggregate all filtered rows in the database, not a capped API response.
CREATE FUNCTION public.oem_lead_stats(p_page_id uuid DEFAULT NULL, p_status text DEFAULT NULL, p_search text DEFAULT '')
RETURNS TABLE(total bigint, new_count bigint, negotiating_count bigint, total_estimate bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT count(*),count(*) FILTER(WHERE l.status='new'),count(*) FILTER(WHERE l.status='negotiating'),COALESCE(sum(l.estimated_total_price),0)
 FROM public.leads l WHERE auth.uid() IS NOT NULL
 AND (p_page_id IS NULL OR l.page_id=p_page_id) AND (p_status IS NULL OR l.status=p_status)
 AND (p_search='' OR l.company_name ILIKE '%'||p_search||'%' OR l.contact_name ILIKE '%'||p_search||'%' OR l.email ILIKE '%'||p_search||'%');
$$;
REVOKE ALL ON FUNCTION public.oem_lead_stats(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.oem_lead_stats(uuid,text,text) TO authenticated;

COMMIT;
