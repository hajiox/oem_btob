BEGIN;
CREATE TABLE public.oem_reply_generations (
 request_id uuid PRIMARY KEY, lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
 created_by uuid NOT NULL REFERENCES auth.users(id), request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[0-9a-f]{64}$'),
 template_id text NOT NULL CHECK(template_id IN ('acknowledge','materials','trial','payment','progress','shipping','settlement')),
 model text NOT NULL CHECK(model ~ '^gemini-[a-z0-9.-]{1,70}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','failed')),
 subject text CHECK(length(subject)<=200), text_body text CHECK(length(text_body)<=10000),
 warnings jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(warnings)='array' AND jsonb_array_length(warnings)<=6),
 failure_code text CHECK(length(failure_code)<=64), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status<>'ready' OR (length(text_body)>0 AND length(subject)>0))
);
CREATE INDEX oem_reply_generations_lead_idx ON public.oem_reply_generations(lead_id,created_at DESC);
CREATE INDEX oem_reply_generations_actor_idx ON public.oem_reply_generations(created_by,created_at DESC);

ALTER TABLE public.oem_conversation_drafts
 ADD COLUMN reply_template_id text,
 ADD COLUMN reply_context_hash text,
 ADD CONSTRAINT oem_conversation_drafts_reply_template_chk CHECK (reply_template_id IS NULL OR reply_template_id IN ('acknowledge','materials','trial','payment','progress','shipping','settlement')),
 ADD CONSTRAINT oem_conversation_drafts_reply_provenance_pair_chk CHECK ((reply_template_id IS NULL) = (reply_context_hash IS NULL)),
 ADD CONSTRAINT oem_conversation_drafts_reply_context_hash_chk CHECK (reply_context_hash IS NULL OR reply_context_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE public.oem_reply_generations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oem_reply_generations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.oem_reply_generations TO service_role;

CREATE FUNCTION public.guard_oem_reply_generation() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'reply generation audit is immutable' USING ERRCODE='check_violation'; END IF;
 IF OLD.status<>'pending' OR NEW.status NOT IN ('ready','failed') OR
 (to_jsonb(OLD)-ARRAY['status','subject','text_body','warnings','failure_code','updated_at']) IS DISTINCT FROM
 (to_jsonb(NEW)-ARRAY['status','subject','text_body','warnings','failure_code','updated_at']) THEN
  RAISE EXCEPTION 'reply generation audit is immutable' USING ERRCODE='check_violation';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_oem_reply_generation BEFORE UPDATE OR DELETE ON public.oem_reply_generations FOR EACH ROW EXECUTE FUNCTION public.guard_oem_reply_generation();

CREATE FUNCTION public.begin_oem_reply_generation(p_id uuid,p_lead uuid,p_actor uuid,p_hash text,p_snapshot text,p_template text,p_model text)
RETURNS TABLE(result text,generation jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior public.oem_reply_generations;
BEGIN
 IF p_id IS NULL OR p_actor IS NULL OR p_lead IS NULL OR p_hash IS NULL OR p_hash!~'^[0-9a-f]{64}$' OR p_snapshot IS NULL OR p_snapshot!~'^[0-9a-f]{64}$' OR p_template IS NULL OR p_template NOT IN ('acknowledge','materials','trial','payment','progress','shipping','settlement') OR p_model IS NULL OR p_model!~'^gemini-[a-z0-9.-]{1,70}$' THEN RETURN QUERY SELECT 'invalid',NULL::jsonb; RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.oem_mail_admins WHERE user_id=p_actor) OR NOT EXISTS(SELECT 1 FROM public.leads WHERE id=p_lead AND page_id='35e7d402-0443-4703-94a4-fc2873b8f933') THEN RETURN QUERY SELECT 'forbidden',NULL::jsonb; RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('oem-reply-ai:'||p_actor::text,0));
 SELECT * INTO prior FROM public.oem_reply_generations WHERE request_id=p_id FOR UPDATE;
 IF FOUND THEN
  IF prior.created_by<>p_actor OR prior.lead_id<>p_lead OR prior.request_hash<>p_hash OR prior.snapshot_hash<>p_snapshot OR prior.template_id<>p_template OR prior.model<>p_model THEN RETURN QUERY SELECT 'conflict',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT prior.status,to_jsonb(prior); RETURN;
 END IF;
 IF (SELECT count(*) FROM public.oem_reply_generations WHERE created_by=p_actor AND created_at>now()-interval '1 hour')>=20 THEN RETURN QUERY SELECT 'rate_limit',NULL::jsonb; RETURN; END IF;
 INSERT INTO public.oem_reply_generations(request_id,lead_id,created_by,request_hash,snapshot_hash,template_id,model) VALUES(p_id,p_lead,p_actor,p_hash,p_snapshot,p_template,p_model);
 RETURN QUERY SELECT 'claimed',NULL::jsonb;
END $$;
CREATE FUNCTION public.finish_oem_reply_generation(p_id uuid,p_actor uuid,p_status text,p_subject text,p_text text,p_warnings jsonb,p_failure text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.oem_mail_admins WHERE user_id=p_actor) OR p_status IS NULL OR p_status NOT IN ('ready','failed') OR p_warnings IS NULL OR jsonb_typeof(p_warnings)<>'array' OR jsonb_array_length(p_warnings)>6 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_warnings) x WHERE jsonb_typeof(x)<>'string' OR length(x#>>'{}')>200) OR (p_status='ready' AND (p_subject IS NULL OR length(p_subject)=0 OR length(p_subject)>200 OR p_subject~E'[\r\n]' OR p_text IS NULL OR length(p_text)=0 OR length(p_text)>10000)) OR length(p_failure)>64 THEN RETURN false; END IF;
 UPDATE public.oem_reply_generations g SET status=p_status,subject=CASE WHEN p_status='ready' THEN p_subject END,text_body=CASE WHEN p_status='ready' THEN p_text END,warnings=p_warnings,failure_code=p_failure,updated_at=clock_timestamp()
 WHERE g.request_id=p_id AND g.created_by=p_actor AND g.status='pending' AND EXISTS(SELECT 1 FROM public.leads l WHERE l.id=g.lead_id AND l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933');
 RETURN FOUND;
END $$;

CREATE FUNCTION public.save_oem_conversation_draft(p_lead uuid,p_actor uuid,p_subject text,p_text text,p_expected timestamptz,p_reply_template text,p_reply_context text)
RETURNS TABLE(result text,updated_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.oem_conversation_drafts; stamp timestamptz;
BEGIN
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.oem_mail_admins WHERE user_id=p_actor) OR NOT EXISTS(SELECT 1 FROM public.leads WHERE id=p_lead AND page_id='35e7d402-0443-4703-94a4-fc2873b8f933') THEN RETURN QUERY SELECT 'forbidden',NULL::timestamptz; RETURN; END IF;
 IF p_subject IS NULL OR length(p_subject)>200 OR p_subject~E'[\r\n]' OR position('[OEM-'||p_lead::text||']' in p_subject)=0 OR p_text IS NULL OR length(p_text)>30000 OR ((p_reply_template IS NULL) <> (p_reply_context IS NULL)) OR (p_reply_template IS NOT NULL AND (p_reply_template NOT IN ('acknowledge','materials','trial','payment','progress','shipping','settlement') OR p_reply_context !~ '^[0-9a-f]{64}$')) THEN RETURN QUERY SELECT 'invalid',NULL::timestamptz; RETURN; END IF;
 PERFORM 1 FROM public.leads WHERE id=p_lead FOR UPDATE;
 SELECT * INTO old FROM public.oem_conversation_drafts WHERE lead_id=p_lead FOR UPDATE;
 IF FOUND THEN
  IF old.updated_by=p_actor AND old.subject=p_subject AND old.text_body=p_text AND old.reply_template_id IS NOT DISTINCT FROM p_reply_template AND old.reply_context_hash IS NOT DISTINCT FROM p_reply_context THEN RETURN QUERY SELECT 'saved',old.updated_at; RETURN; END IF;
  IF p_expected IS NULL OR p_expected<>old.updated_at THEN RETURN QUERY SELECT 'conflict',old.updated_at; RETURN; END IF;
  UPDATE public.oem_conversation_drafts SET subject=p_subject,text_body=p_text,updated_by=p_actor,reply_template_id=p_reply_template,reply_context_hash=p_reply_context WHERE lead_id=p_lead RETURNING public.oem_conversation_drafts.updated_at INTO stamp;
 ELSE
  IF p_expected IS NOT NULL THEN RETURN QUERY SELECT 'conflict',NULL::timestamptz; RETURN; END IF;
  INSERT INTO public.oem_conversation_drafts(lead_id,subject,text_body,updated_by,reply_template_id,reply_context_hash) VALUES(p_lead,p_subject,p_text,p_actor,p_reply_template,p_reply_context) RETURNING public.oem_conversation_drafts.updated_at INTO stamp;
 END IF;
 RETURN QUERY SELECT 'saved',stamp;
END $$;
REVOKE ALL ON FUNCTION public.guard_oem_reply_generation() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.begin_oem_reply_generation(uuid,uuid,uuid,text,text,text,text),public.finish_oem_reply_generation(uuid,uuid,text,text,text,jsonb,text),public.save_oem_conversation_draft(uuid,uuid,text,text,timestamptz,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_oem_reply_generation(uuid,uuid,uuid,text,text,text,text),public.finish_oem_reply_generation(uuid,uuid,text,text,text,jsonb,text),public.save_oem_conversation_draft(uuid,uuid,text,text,timestamptz,text,text) TO service_role;
COMMIT;
