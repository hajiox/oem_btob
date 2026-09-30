-- OEM mail attention state and mailbox sync lease.
BEGIN;
ALTER TABLE public.oem_conversation_messages
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handled_at timestamptz,
  ADD COLUMN IF NOT EXISTS handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.oem_conversation_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reply_closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_oem_conversation_messages_reply_to ON public.oem_conversation_messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_oem_conversation_messages_attention ON public.oem_conversation_messages(lead_id, direction, sent_at DESC) WHERE direction = 'inbound';

CREATE OR REPLACE FUNCTION public.close_oem_inbound_on_sent_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'sent' AND NEW.direction = 'outbound' AND NEW.reply_to_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.oem_conversation_messages m WHERE m.id = NEW.reply_to_id::uuid AND m.lead_id = NEW.lead_id::uuid AND m.direction = 'inbound') THEN
      RAISE EXCEPTION 'reply_to_id must reference an inbound message in the same lead';
    END IF;
    UPDATE public.oem_conversation_messages
       SET reply_closed_at = COALESCE(reply_closed_at, now()), reply_closed_by = COALESCE(reply_closed_by, NEW.created_by), updated_at = now()
     WHERE lead_id = NEW.lead_id AND direction = 'inbound' AND reply_closed_at IS NULL
       AND (sent_at, id) <= (SELECT sent_at, id FROM public.oem_conversation_messages WHERE id = NEW.reply_to_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.validate_oem_reply_target()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.reply_to_id IS NOT NULL AND NEW.direction IS DISTINCT FROM 'outbound' THEN
    RAISE EXCEPTION 'reply_to_id may only be set on an outbound reply';
  END IF;
  IF NEW.reply_to_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.oem_conversation_messages m WHERE m.id=NEW.reply_to_id::uuid AND m.lead_id=NEW.lead_id::uuid AND m.direction='inbound') THEN
    RAISE EXCEPTION 'reply_to_id must reference an inbound message in the same lead';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS validate_oem_reply_target ON public.oem_conversation_messages;
CREATE TRIGGER validate_oem_reply_target BEFORE INSERT OR UPDATE OF reply_to_id,lead_id,direction ON public.oem_conversation_messages FOR EACH ROW EXECUTE FUNCTION public.validate_oem_reply_target();
REVOKE ALL ON FUNCTION public.validate_oem_reply_target() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_oem_reply_target() TO service_role;
DROP TRIGGER IF EXISTS close_oem_inbound_on_sent_reply ON public.oem_conversation_messages;
CREATE TRIGGER close_oem_inbound_on_sent_reply AFTER INSERT OR UPDATE OF status, reply_to_id ON public.oem_conversation_messages FOR EACH ROW EXECUTE FUNCTION public.close_oem_inbound_on_sent_reply();
REVOKE ALL ON FUNCTION public.close_oem_inbound_on_sent_reply() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_oem_inbound_on_sent_reply() TO service_role;

CREATE OR REPLACE FUNCTION public.review_oem_conversation_messages(p_lead_id uuid, p_user_id uuid, p_message_ids uuid[])
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_lead_id IS NULL OR p_user_id IS NULL OR p_message_ids IS NULL OR NOT EXISTS (SELECT 1 FROM public.oem_mail_admins a JOIN public.leads l ON l.id=p_lead_id WHERE a.user_id = p_user_id AND l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid) OR cardinality(p_message_ids) > 50 THEN RETURN false; END IF;
  IF cardinality(p_message_ids) > 0 AND (SELECT count(*) FROM public.oem_conversation_messages WHERE lead_id=p_lead_id AND direction='inbound' AND id=ANY(p_message_ids)) <> cardinality(p_message_ids) THEN RETURN false; END IF;
  UPDATE public.oem_conversation_messages SET reviewed_at=COALESCE(reviewed_at,now()), reviewed_by=COALESCE(reviewed_by,p_user_id)
   WHERE lead_id=p_lead_id AND direction='inbound' AND id=ANY(p_message_ids);
  RETURN true;
END; $$;
CREATE OR REPLACE FUNCTION public.handle_oem_conversation_message(p_lead_id uuid,p_user_id uuid,p_message_id uuid,p_handled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE anchor record;
BEGIN
  IF p_lead_id IS NULL OR p_user_id IS NULL OR p_message_id IS NULL OR p_handled IS NULL OR NOT EXISTS (SELECT 1 FROM public.oem_mail_admins a JOIN public.leads l ON l.id=p_lead_id WHERE a.user_id = p_user_id AND l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid) THEN RETURN false; END IF;
  SELECT * INTO anchor FROM public.oem_conversation_messages WHERE id=p_message_id AND lead_id=p_lead_id AND direction='inbound';
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT p_handled THEN
    UPDATE public.oem_conversation_messages SET handled_at=NULL, handled_by=NULL WHERE id=p_message_id AND reply_closed_at IS NULL AND handled_by IS NOT NULL;
    RETURN FOUND;
  END IF;
  UPDATE public.oem_conversation_messages SET handled_at=now(), handled_by=p_user_id
   WHERE lead_id=p_lead_id AND direction='inbound' AND reply_closed_at IS NULL AND handled_at IS NULL
     AND (sent_at,id) <= (anchor.sent_at,anchor.id);
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.review_oem_conversation_messages(uuid,uuid,uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_oem_conversation_message(uuid,uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_oem_conversation_messages(uuid,uuid,uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_oem_conversation_message(uuid,uuid,uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.oem_mail_attention_summary()
RETURNS TABLE(total bigint, unread_cases bigint, awaiting_reply_cases bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
WITH x AS (
 SELECT l.id, count(*) FILTER (WHERE m.direction='inbound' AND m.reviewed_at IS NULL) AS unread,
        count(*) FILTER (WHERE m.direction='inbound' AND m.reply_closed_at IS NULL AND m.handled_at IS NULL) AS awaiting
 FROM public.leads l LEFT JOIN public.oem_conversation_messages m ON m.lead_id=l.id
 WHERE l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid GROUP BY l.id)
SELECT count(*) FILTER (WHERE unread>0 OR awaiting>0), count(*) FILTER (WHERE unread>0), count(*) FILTER (WHERE awaiting>0) FROM x;
$$;
CREATE OR REPLACE FUNCTION public.oem_mail_attention(p_limit integer DEFAULT 50,p_offset integer DEFAULT 0)
RETURNS TABLE(lead_id uuid, company_name text, email text, unread_count bigint, awaiting_reply_count bigint, last_inbound_at timestamptz, preview text, latest_message_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
WITH x AS (
  SELECT l.id,l.company_name,l.email,
  count(*) FILTER (WHERE m.direction='inbound' AND m.reviewed_at IS NULL) unread,
  count(*) FILTER (WHERE m.direction='inbound' AND m.reply_closed_at IS NULL AND m.handled_at IS NULL) awaiting,
  max(m.sent_at) FILTER (WHERE m.direction='inbound') last_inbound,
  (array_agg(m.text_body ORDER BY m.sent_at DESC,m.id DESC) FILTER (WHERE m.direction='inbound'))[1] preview,
  (array_agg(m.id ORDER BY m.sent_at DESC,m.id DESC) FILTER (WHERE m.direction='inbound'))[1] latest_id
 FROM public.leads l LEFT JOIN public.oem_conversation_messages m ON m.lead_id=l.id
 WHERE l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid GROUP BY l.id,l.company_name,l.email)
SELECT id,coalesce(company_name,email),email,unread,awaiting,last_inbound,left(coalesce(preview,''),200),latest_id FROM x
 WHERE unread>0 OR awaiting>0 ORDER BY last_inbound DESC NULLS LAST,latest_id DESC NULLS LAST OFFSET greatest(p_offset,0) LIMIT least(greatest(p_limit,1),100);
$$;
REVOKE ALL ON FUNCTION public.oem_mail_attention_summary() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.oem_mail_attention(integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oem_mail_attention_summary() TO service_role;
GRANT EXECUTE ON FUNCTION public.oem_mail_attention(integer,integer) TO service_role;

CREATE TABLE IF NOT EXISTS public.oem_mail_sync_state (
  mailbox text PRIMARY KEY DEFAULT 'staff@aizu-tv.com' CHECK (mailbox = 'staff@aizu-tv.com'), query_text text, page_token text,
  last_completed_at timestamptz, last_run_at timestamptz, last_error text, lease_id uuid, lease_until timestamptz
);
ALTER TABLE public.oem_mail_sync_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oem_mail_sync_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.oem_mail_sync_state TO service_role;
CREATE OR REPLACE FUNCTION public.claim_oem_mail_sync(p_lease_id uuid, p_force boolean DEFAULT false)
RETURNS SETOF public.oem_mail_sync_state LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.oem_mail_sync_state(mailbox) VALUES ('staff@aizu-tv.com') ON CONFLICT DO NOTHING;
  UPDATE public.oem_mail_sync_state SET lease_id=p_lease_id, lease_until=now()+interval '240 seconds', last_run_at=now()
   WHERE mailbox='staff@aizu-tv.com' AND (lease_until IS NULL OR lease_until < now()) AND (p_force OR last_run_at IS NULL OR last_run_at < now()-interval '60 seconds');
  RETURN QUERY SELECT * FROM public.oem_mail_sync_state WHERE mailbox='staff@aizu-tv.com' AND lease_id=p_lease_id;
END; $$;
CREATE OR REPLACE FUNCTION public.finish_oem_mail_sync(p_lease_id uuid,p_query_text text,p_page_token text,p_complete boolean,p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
 UPDATE public.oem_mail_sync_state SET query_text=CASE WHEN p_error IS NOT NULL THEN p_query_text WHEN p_complete THEN NULL ELSE p_query_text END,page_token=CASE WHEN p_error IS NOT NULL THEN p_page_token WHEN p_complete THEN NULL ELSE p_page_token END,
  last_completed_at=CASE WHEN p_error IS NULL AND p_complete THEN CASE WHEN p_query_text ~ 'before:[0-9]+' THEN to_timestamp((regexp_match(p_query_text, 'before:([0-9]+)'))[1]::double precision) ELSE now() END ELSE last_completed_at END,
  last_error=CASE WHEN p_error IS NULL THEN NULL ELSE left(regexp_replace(p_error,'[\r\n\x00]',' ','g'),500) END,lease_id=NULL,lease_until=NULL
  WHERE mailbox='staff@aizu-tv.com' AND lease_id=p_lease_id;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n=1;
END; $$;
REVOKE ALL ON FUNCTION public.claim_oem_mail_sync(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_oem_mail_sync(uuid, text, text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_oem_mail_sync(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_oem_mail_sync(uuid, text, text, boolean, text) TO service_role;
COMMIT;
