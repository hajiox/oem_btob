-- Durable OEM Gmail conversation state. This migration intentionally contains
-- no user seed data; administrators are provisioned separately.
BEGIN;

CREATE TABLE public.oem_mail_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE public.oem_mailbox_connections (
  mailbox text PRIMARY KEY,
  encrypted_refresh_token text NOT NULL,
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.oem_oauth_states (
  state_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  verifier_encrypted text NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE public.oem_conversation_threads (
  gmail_thread_id text PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.oem_conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  gmail_id text UNIQUE,
  gmail_thread_id text,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  subject text,
  text_body text,
  from_address text,
  to_address text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'pending', 'sending', 'sent', 'unknown', 'failed')),
  request_id uuid UNIQUE,
  payload_hash text,
  rfc_message_id text,
  references_header text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.oem_conversation_drafts (
  lead_id uuid PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  subject text,
  text_body text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_oem_conversation_messages_lead_sent
  ON public.oem_conversation_messages(lead_id, sent_at DESC);
CREATE INDEX idx_oem_conversation_messages_status
  ON public.oem_conversation_messages(status);
CREATE INDEX idx_oem_conversation_messages_thread
  ON public.oem_conversation_messages(gmail_thread_id);
CREATE UNIQUE INDEX idx_oem_conversation_messages_unresolved_lead
  ON public.oem_conversation_messages(lead_id)
  WHERE status IN ('pending', 'sending', 'unknown');
CREATE INDEX idx_oem_oauth_states_expires_at
  ON public.oem_oauth_states(expires_at);

-- Tag only newly queued OEM customer/admin deliveries so Gmail searches can
-- recover the lead conversation. Existing/attempted deliveries are untouched.
CREATE OR REPLACE FUNCTION public.tag_oem_initial_delivery_subject()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tag text := format('[OEM-%s]', NEW.lead_id);
BEGIN
  IF NEW.status <> 'pending' OR NEW.attempts <> 0
     OR NEW.kind NOT IN ('customer', 'admin')
     OR NOT EXISTS (
       SELECT 1 FROM public.leads
        WHERE id = NEW.lead_id
          AND page_id = '35e7d402-0443-4703-94a4-fc2873b8f933'::uuid
     )
     OR jsonb_typeof(NEW.payload) <> 'object'
     OR jsonb_typeof(NEW.payload->'subject') <> 'string'
     OR position(v_tag IN NEW.payload->>'subject') > 0 THEN
    RETURN NEW;
  END IF;

  NEW.payload := jsonb_set(
    NEW.payload,
    '{subject}',
    to_jsonb(NEW.payload->>'subject' || ' ' || v_tag),
    true
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER tag_oem_initial_delivery_subject
  BEFORE INSERT ON public.oem_mail_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.tag_oem_initial_delivery_subject();

REVOKE ALL ON FUNCTION public.tag_oem_initial_delivery_subject() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tag_oem_initial_delivery_subject() TO service_role;

-- Keep server-side timestamps correct when a message or draft is edited.
CREATE TRIGGER set_oem_conversation_messages_updated_at
  BEFORE UPDATE ON public.oem_conversation_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_oem_mailbox_connections_updated_at
  BEFORE UPDATE ON public.oem_mailbox_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_oem_conversation_drafts_updated_at
  BEFORE UPDATE ON public.oem_conversation_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.oem_mail_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oem_mailbox_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oem_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oem_conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oem_conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oem_conversation_drafts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.oem_mail_admins,
  public.oem_mailbox_connections,
  public.oem_oauth_states,
  public.oem_conversation_threads,
  public.oem_conversation_messages,
  public.oem_conversation_drafts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.oem_mail_admins,
  public.oem_mailbox_connections,
  public.oem_oauth_states,
  public.oem_conversation_threads,
  public.oem_conversation_messages,
  public.oem_conversation_drafts TO service_role;

-- Claim is deliberately limited to pending rows. Unknown/sending rows require
-- investigation and are never automatically replayed.
CREATE OR REPLACE FUNCTION public.claim_oem_conversation(p_id uuid)
RETURNS SETOF public.oem_conversation_messages
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.oem_conversation_messages
     SET status = 'sending', updated_at = now()
   WHERE id = p_id AND status = 'pending'
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_oem_conversation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_oem_conversation(uuid) TO service_role;

COMMIT;
