-- Trial history, a company-bound first-time benefit and immutable approval snapshots.
BEGIN;
CREATE TABLE public.oem_trial_ledgers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_key text NOT NULL UNIQUE,
 identity_evidence text NOT NULL, confirmed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 benefit_lead_id uuid REFERENCES public.leads(id) ON DELETE RESTRICT,
 included_used integer NOT NULL DEFAULT 0 CHECK(included_used BETWEEN 0 AND 2),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.oem_trials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ledger_id uuid NOT NULL REFERENCES public.oem_trial_ledgers(id) ON DELETE RESTRICT,
 lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
 trial_number integer NOT NULL CHECK(trial_number>0), project_number integer NOT NULL CHECK(project_number>0),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled')),
 result text CHECK(result IN ('pass','fail','needs_revision','cancelled')), result_notes text,
 identity_evidence text NOT NULL, label text, fee_advisory integer NOT NULL CHECK(fee_advisory IN (0,3000)),
 included_claimed boolean NOT NULL, request_id uuid NOT NULL UNIQUE, request_snapshot jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 version integer NOT NULL DEFAULT 0, completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(ledger_id,trial_number), UNIQUE(lead_id,project_number)
);
CREATE TABLE public.oem_trial_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trial_id uuid NOT NULL REFERENCES public.oem_trials(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK(action IN ('created','completed')), actor uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 result text, notes text, version integer NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.oem_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
 order_id uuid REFERENCES public.oem_orders(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('trial','label','specification')), name text NOT NULL, version text NOT NULL, content_body text NOT NULL,
 content_hash text NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'), token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 request_id uuid NOT NULL UNIQUE, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','changes_requested','expired','rejected','superseded')),
 expires_at timestamptz NOT NULL, issued_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 issued_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
 acted_at timestamptz, signer_name text, action_request_id uuid UNIQUE, acted_content_hash text, acted_action text, acted_note text,
 signer_ip_hmac text, signer_user_agent_hmac text, request_changes_note text,
 superseded_by uuid REFERENCES public.oem_approvals(id) ON DELETE RESTRICT
);
CREATE TABLE public.oem_approval_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), approval_id uuid NOT NULL REFERENCES public.oem_approvals(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK(action IN ('issued','approve','request_changes','revoked','superseded')),
 actor_name text, action_request_id uuid, content_hash text NOT NULL,
 ip_hmac text, user_agent_hmac text, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oem_trials_lead_idx ON public.oem_trials(lead_id,project_number);
CREATE INDEX oem_approvals_lead_idx ON public.oem_approvals(lead_id,kind,issued_at DESC,id DESC);
CREATE INDEX oem_approvals_order_idx ON public.oem_approvals(order_id,kind) WHERE superseded_by IS NULL;
ALTER TABLE public.oem_trial_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oem_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oem_trial_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oem_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oem_approval_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oem_trial_ledgers,public.oem_trials,public.oem_trial_events,public.oem_approvals,public.oem_approval_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.oem_trial_ledgers,public.oem_trials,public.oem_trial_events,public.oem_approvals,public.oem_approval_events TO service_role;

CREATE FUNCTION public.prevent_oem_trial_approval_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'OEM audit is append-only'; END $$;
CREATE TRIGGER oem_trial_events_immutable BEFORE UPDATE OR DELETE ON public.oem_trial_events FOR EACH ROW EXECUTE FUNCTION public.prevent_oem_trial_approval_audit_mutation();
CREATE TRIGGER oem_approval_events_immutable BEFORE UPDATE OR DELETE ON public.oem_approval_events FOR EACH ROW EXECUTE FUNCTION public.prevent_oem_trial_approval_audit_mutation();
CREATE FUNCTION public.prevent_oem_trial_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'trial history is immutable'; END IF;
 IF (to_jsonb(NEW)-ARRAY['result','result_notes','status','completed_at','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['result','result_notes','status','completed_at','version','updated_at']) OR OLD.status<>'pending' OR NEW.status NOT IN ('completed','cancelled') OR NEW.version<>OLD.version+1 OR NEW.completed_at IS NULL OR NEW.result IS NULL OR (NEW.result='cancelled') IS DISTINCT FROM (NEW.status='cancelled') THEN RAISE EXCEPTION 'invalid trial history transition'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER oem_trials_immutable BEFORE UPDATE OR DELETE ON public.oem_trials FOR EACH ROW EXECUTE FUNCTION public.prevent_oem_trial_mutation();
CREATE FUNCTION public.prevent_oem_trial_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'benefit ledger is immutable'; END IF;
 IF (to_jsonb(NEW)-ARRAY['included_used','benefit_lead_id','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['included_used','benefit_lead_id','updated_at']) OR NEW.included_used<OLD.included_used OR NEW.included_used>OLD.included_used+1 OR (OLD.benefit_lead_id IS NOT NULL AND NEW.benefit_lead_id IS DISTINCT FROM OLD.benefit_lead_id) THEN RAISE EXCEPTION 'invalid benefit ledger transition'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER oem_trial_ledgers_immutable BEFORE UPDATE OR DELETE ON public.oem_trial_ledgers FOR EACH ROW EXECUTE FUNCTION public.prevent_oem_trial_ledger_mutation();
CREATE FUNCTION public.prevent_oem_approval_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'approval history is immutable'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','acted_at','signer_name','action_request_id','acted_content_hash','acted_action','acted_note','signer_ip_hmac','signer_user_agent_hmac','request_changes_note','superseded_by']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','acted_at','signer_name','action_request_id','acted_content_hash','acted_action','acted_note','signer_ip_hmac','signer_user_agent_hmac','request_changes_note','superseded_by']) THEN RAISE EXCEPTION 'approval snapshot is immutable'; END IF;
 IF OLD.status='pending' THEN
  IF NEW.status NOT IN ('approved','changes_requested','expired','rejected','superseded') THEN RAISE EXCEPTION 'invalid approval transition'; END IF;
 ELSE
  IF NEW.status<>'superseded' OR OLD.status='superseded' OR (to_jsonb(NEW)-ARRAY['status','superseded_by']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','superseded_by']) THEN RAISE EXCEPTION 'approval response is immutable'; END IF;
 END IF;
 IF NEW.status='superseded' AND (OLD.superseded_by IS NOT NULL OR NEW.superseded_by IS NULL) THEN RAISE EXCEPTION 'supersession requires new snapshot'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER oem_approvals_immutable BEFORE UPDATE OR DELETE ON public.oem_approvals FOR EACH ROW EXECUTE FUNCTION public.prevent_oem_approval_mutation();

CREATE FUNCTION public.create_oem_trial(p_lead_id uuid,p_actor uuid,p_company_key text,p_identity_evidence text,p_claim_included boolean,p_label text,p_notes text,p_request_id uuid)
RETURNS TABLE(result text,trial_id uuid,trial_number integer,fee_advisory integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.oem_trial_ledgers%ROWTYPE; t public.oem_trials%ROWTYPE; n integer; pn integer; free boolean; input jsonb;
BEGIN
 IF p_request_id IS NULL OR p_claim_included IS NULL OR length(trim(coalesce(p_company_key,''))) NOT BETWEEN 1 AND 200 OR length(trim(coalesce(p_identity_evidence,''))) NOT BETWEEN 1 AND 2000 OR length(coalesce(p_label,''))>500 OR length(coalesce(p_notes,''))>2000 THEN RETURN QUERY SELECT 'invalid',NULL::uuid,NULL::integer,NULL::integer; RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM oem_mail_admins WHERE user_id=p_actor) OR NOT EXISTS(SELECT 1 FROM leads WHERE id=p_lead_id AND page_id='35e7d402-0443-4703-94a4-fc2873b8f933') THEN RETURN QUERY SELECT 'forbidden',NULL::uuid,NULL::integer,NULL::integer; RETURN; END IF;
 input:=jsonb_build_object('companyKey',lower(trim(p_company_key)),'identityEvidence',trim(p_identity_evidence),'claimIncluded',p_claim_included,'label',coalesce(nullif(trim(p_label),''),''),'notes',coalesce(nullif(trim(p_notes),''),''));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT * INTO t FROM oem_trials WHERE request_id=p_request_id;
 IF FOUND THEN IF t.lead_id=p_lead_id AND t.created_by=p_actor AND t.request_snapshot=input THEN RETURN QUERY SELECT 'duplicate',t.id,t.project_number,t.fee_advisory; ELSE RETURN QUERY SELECT 'conflict',NULL::uuid,NULL::integer,NULL::integer; END IF; RETURN; END IF;
 PERFORM 1 FROM leads WHERE id=p_lead_id FOR UPDATE;
 INSERT INTO oem_trial_ledgers(company_key,identity_evidence,confirmed_by) VALUES(lower(trim(p_company_key)),trim(p_identity_evidence),p_actor) ON CONFLICT(company_key) DO NOTHING;
 SELECT * INTO l FROM oem_trial_ledgers WHERE company_key=lower(trim(p_company_key)) FOR UPDATE;
 IF l.identity_evidence IS DISTINCT FROM trim(p_identity_evidence) OR EXISTS(SELECT 1 FROM oem_trials WHERE lead_id=p_lead_id AND ledger_id<>l.id) THEN RETURN QUERY SELECT 'identity_conflict',NULL::uuid,NULL::integer,NULL::integer; RETURN; END IF;
 IF p_claim_included AND l.benefit_lead_id IS NOT NULL AND l.benefit_lead_id<>p_lead_id THEN RETURN QUERY SELECT 'benefit_conflict',NULL::uuid,NULL::integer,NULL::integer; RETURN; END IF;
 SELECT coalesce(max(ot.trial_number),0)+1 INTO n FROM oem_trials ot WHERE ot.ledger_id=l.id;
 SELECT coalesce(max(ot.project_number),0)+1 INTO pn FROM oem_trials ot WHERE ot.lead_id=p_lead_id;
 free:=p_claim_included AND pn<=2 AND l.included_used<2;
 INSERT INTO oem_trials(ledger_id,lead_id,trial_number,project_number,identity_evidence,label,result_notes,fee_advisory,included_claimed,request_id,request_snapshot,created_by)
 VALUES(l.id,p_lead_id,n,pn,trim(p_identity_evidence),nullif(trim(p_label),''),nullif(trim(p_notes),''),CASE WHEN pn<=2 THEN 0 ELSE 3000 END,free,p_request_id,input,p_actor) RETURNING * INTO t;
 IF free THEN UPDATE oem_trial_ledgers SET included_used=included_used+1,benefit_lead_id=p_lead_id,updated_at=now() WHERE id=l.id; END IF;
 INSERT INTO oem_trial_events(trial_id,action,actor,notes,version) VALUES(t.id,'created',p_actor,t.result_notes,0);
 RETURN QUERY SELECT 'created',t.id,t.project_number,t.fee_advisory;
END $$;
CREATE FUNCTION public.record_oem_trial_result(p_trial_id uuid,p_actor uuid,p_result text,p_notes text,p_expected_version integer)
RETURNS TABLE(result text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE t public.oem_trials%ROWTYPE; BEGIN
 IF p_result IS NULL OR p_result NOT IN ('pass','fail','needs_revision','cancelled') OR p_expected_version IS NULL OR p_expected_version<0 OR length(coalesce(p_notes,''))>2000 THEN RETURN QUERY SELECT 'invalid'; RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM oem_mail_admins WHERE user_id=p_actor) THEN RETURN QUERY SELECT 'forbidden'; RETURN; END IF;
 SELECT t0.* INTO t FROM oem_trials t0 JOIN leads l ON l.id=t0.lead_id AND l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933' WHERE t0.id=p_trial_id FOR UPDATE OF t0;
 IF NOT FOUND THEN RETURN QUERY SELECT 'forbidden'; RETURN; END IF;
 IF t.version<>p_expected_version OR t.status<>'pending' THEN RETURN QUERY SELECT 'conflict'; RETURN; END IF;
 UPDATE oem_trials SET result=p_result,status=CASE WHEN p_result='cancelled' THEN 'cancelled' ELSE 'completed' END,result_notes=nullif(trim(p_notes),''),completed_at=now(),version=version+1,updated_at=now() WHERE id=t.id;
 INSERT INTO oem_trial_events(trial_id,action,actor,result,notes,version) VALUES(t.id,'completed',p_actor,p_result,nullif(trim(p_notes),''),t.version+1);
 RETURN QUERY SELECT 'saved'; END $$;

CREATE FUNCTION public.issue_oem_approval(p_lead_id uuid,p_order_id uuid,p_actor uuid,p_kind text,p_name text,p_version text,p_body text,p_content_hash text,p_token_hash text,p_expires_at timestamptz,p_request_id uuid)
RETURNS TABLE(result text,approval_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE a public.oem_approvals%ROWTYPE; old public.oem_approvals%ROWTYPE; BEGIN
 IF p_name ~ E'[\r\n]' OR p_version ~ E'[\r\n]' THEN RETURN QUERY SELECT 'invalid',NULL::uuid; RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM oem_mail_admins WHERE user_id=p_actor) OR NOT EXISTS(SELECT 1 FROM leads WHERE id=p_lead_id AND page_id='35e7d402-0443-4703-94a4-fc2873b8f933') THEN RETURN QUERY SELECT 'forbidden',NULL::uuid; RETURN; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('trial','label','specification') OR length(trim(coalesce(p_name,''))) NOT BETWEEN 1 AND 200 OR length(trim(coalesce(p_version,''))) NOT BETWEEN 1 AND 100 OR length(trim(coalesce(p_body,''))) NOT BETWEEN 1 AND 20000 OR p_content_hash IS DISTINCT FROM encode(sha256(convert_to(trim(p_name)||E'\n'||trim(p_version)||E'\n'||trim(p_body),'UTF8')),'hex') OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' OR p_request_id IS NULL OR p_expires_at IS NULL OR p_expires_at<=now() OR p_expires_at>now()+interval '90 days' THEN RETURN QUERY SELECT 'invalid',NULL::uuid; RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 IF p_order_id IS NOT NULL THEN PERFORM 1 FROM oem_orders WHERE id=p_order_id AND lead_id=p_lead_id AND status IN ('issued','accepted','deposit_paid') FOR UPDATE; IF NOT FOUND THEN RETURN QUERY SELECT 'invalid',NULL::uuid; RETURN; END IF; END IF;
 PERFORM 1 FROM leads WHERE id=p_lead_id FOR UPDATE;
 SELECT * INTO a FROM oem_approvals WHERE request_id=p_request_id;
 IF FOUND THEN IF a.lead_id=p_lead_id AND a.order_id IS NOT DISTINCT FROM p_order_id AND a.kind=p_kind AND a.content_hash=p_content_hash AND a.issued_by=p_actor AND a.expires_at=p_expires_at THEN RETURN QUERY SELECT 'duplicate',a.id; ELSE RETURN QUERY SELECT 'conflict',NULL::uuid; END IF; RETURN; END IF;
 INSERT INTO oem_approvals(lead_id,order_id,kind,name,version,content_body,content_hash,token_hash,request_id,expires_at,issued_by) VALUES(p_lead_id,p_order_id,p_kind,trim(p_name),trim(p_version),trim(p_body),p_content_hash,p_token_hash,p_request_id,p_expires_at,p_actor) RETURNING * INTO a;
 FOR old IN SELECT * FROM oem_approvals WHERE id<>a.id AND lead_id=p_lead_id AND kind=p_kind AND superseded_by IS NULL AND (order_id IS NOT DISTINCT FROM p_order_id OR (p_order_id IS NOT NULL AND order_id IS NULL)) FOR UPDATE LOOP
  UPDATE oem_approvals SET status='superseded',superseded_by=a.id WHERE id=old.id;
  INSERT INTO oem_approval_events(approval_id,action,actor_name,content_hash) VALUES(old.id,'superseded',p_actor::text,old.content_hash);
 END LOOP;
 INSERT INTO oem_approval_events(approval_id,action,actor_name,content_hash) VALUES(a.id,'issued',p_actor::text,a.content_hash);
 RETURN QUERY SELECT 'issued',a.id; END $$;
CREATE FUNCTION public.act_oem_approval(p_token_hash text,p_action text,p_note text,p_ip text,p_user_agent text,p_signer_name text,p_action_request_id uuid,p_content_hash text)
RETURNS TABLE(result text,approval_id uuid,status text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE a public.oem_approvals%ROWTYPE; s text; BEGIN
 SELECT * INTO a FROM oem_approvals WHERE token_hash=p_token_hash;
 IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::uuid,NULL::text; RETURN; END IF;
 IF a.order_id IS NOT NULL THEN PERFORM 1 FROM oem_orders o WHERE o.id=a.order_id AND o.lead_id=a.lead_id AND o.status<>'cancelled' FOR UPDATE; IF NOT FOUND THEN RETURN QUERY SELECT 'state',a.id,a.status; RETURN; END IF; END IF;
 PERFORM 1 FROM leads WHERE id=a.lead_id AND page_id='35e7d402-0443-4703-94a4-fc2873b8f933' FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::uuid,NULL::text; RETURN; END IF;
 SELECT * INTO a FROM oem_approvals WHERE id=a.id FOR UPDATE;
 IF a.superseded_by IS NOT NULL OR a.status IN ('rejected','superseded') THEN RETURN QUERY SELECT 'changed',a.id,a.status; RETURN; END IF;
 IF p_action IS NULL OR p_action NOT IN ('approve','request_changes') OR p_action_request_id IS NULL OR p_content_hash IS DISTINCT FROM a.content_hash OR length(trim(coalesce(p_signer_name,''))) NOT BETWEEN 1 AND 200 OR p_note IS NULL OR length(p_note)>2000 OR (p_action='request_changes' AND length(trim(p_note))=0) OR p_ip IS NULL OR p_ip !~ '^[0-9a-f]{64}$' OR p_user_agent IS NULL OR p_user_agent !~ '^[0-9a-f]{64}$' THEN RETURN QUERY SELECT 'invalid',a.id,a.status; RETURN; END IF;
 IF a.acted_at IS NOT NULL THEN IF a.action_request_id=p_action_request_id AND a.acted_action=p_action AND a.acted_content_hash=p_content_hash AND a.signer_name=trim(p_signer_name) AND coalesce(a.acted_note,'')=trim(p_note) THEN RETURN QUERY SELECT 'duplicate',a.id,a.status; ELSE RETURN QUERY SELECT 'conflict',a.id,a.status; END IF; RETURN; END IF;
 IF a.status<>'pending' OR a.expires_at<=now() THEN IF a.status='pending' THEN UPDATE oem_approvals SET status='expired' WHERE id=a.id; END IF; RETURN QUERY SELECT 'expired',a.id,'expired'; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM oem_approvals WHERE action_request_id=p_action_request_id) THEN RETURN QUERY SELECT 'conflict',a.id,a.status; RETURN; END IF;
 s:=CASE WHEN p_action='approve' THEN 'approved' ELSE 'changes_requested' END;
 UPDATE oem_approvals SET status=s,acted_at=now(),signer_name=trim(p_signer_name),action_request_id=p_action_request_id,acted_content_hash=p_content_hash,acted_action=p_action,acted_note=trim(p_note),signer_ip_hmac=p_ip,signer_user_agent_hmac=p_user_agent,request_changes_note=CASE WHEN s='changes_requested' THEN trim(p_note) ELSE NULL END WHERE id=a.id;
 INSERT INTO oem_approval_events(approval_id,action,actor_name,action_request_id,content_hash,ip_hmac,user_agent_hmac) VALUES(a.id,p_action,trim(p_signer_name),p_action_request_id,p_content_hash,p_ip,p_user_agent);
 RETURN QUERY SELECT s,a.id,s; END $$;
CREATE FUNCTION public.revoke_oem_approval(p_approval_id uuid,p_actor uuid,p_reason text) RETURNS TABLE(result text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE a public.oem_approvals%ROWTYPE; BEGIN
 IF NOT EXISTS(SELECT 1 FROM oem_mail_admins WHERE user_id=p_actor) OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 1 AND 1000 THEN RETURN QUERY SELECT 'invalid'; RETURN; END IF;
 SELECT * INTO a FROM oem_approvals WHERE id=p_approval_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'; RETURN; END IF;
 IF a.order_id IS NOT NULL THEN PERFORM 1 FROM oem_orders WHERE id=a.order_id FOR UPDATE; END IF;
 PERFORM 1 FROM leads WHERE id=a.lead_id AND page_id='35e7d402-0443-4703-94a4-fc2873b8f933' FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'forbidden'; RETURN; END IF;
 SELECT * INTO a FROM oem_approvals WHERE id=p_approval_id FOR UPDATE;
 IF a.status='rejected' AND a.request_changes_note=trim(p_reason) THEN RETURN QUERY SELECT 'duplicate'; RETURN; END IF;
 IF a.status<>'pending' THEN RETURN QUERY SELECT 'state'; RETURN; END IF;
 UPDATE oem_approvals SET status='rejected',request_changes_note=trim(p_reason) WHERE id=a.id;
 INSERT INTO oem_approval_events(approval_id,action,actor_name,content_hash) VALUES(a.id,'revoked',p_actor::text,a.content_hash);
 RETURN QUERY SELECT 'revoked'; END $$;
CREATE FUNCTION public.oem_order_manufacturing_gate(p_order_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE o public.oem_orders%ROWTYPE; BEGIN
 SELECT * INTO o FROM oem_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM leads WHERE id=o.lead_id AND page_id='35e7d402-0443-4703-94a4-fc2873b8f933' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 RETURN NOT EXISTS(SELECT 1 FROM oem_approvals a WHERE a.lead_id=o.lead_id AND a.superseded_by IS NULL AND (a.order_id=o.id OR a.order_id IS NULL) AND a.status<>'approved');
END $$;
CREATE FUNCTION public.enforce_oem_manufacturing_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.status='in_production' AND OLD.status IS DISTINCT FROM NEW.status AND NOT public.oem_order_manufacturing_gate(NEW.id) THEN RAISE EXCEPTION 'required customer approval is not accepted' USING ERRCODE='check_violation'; END IF; RETURN NEW; END $$;
CREATE TRIGGER oem_order_manufacturing_gate BEFORE UPDATE OF status ON public.oem_orders FOR EACH ROW EXECUTE FUNCTION public.enforce_oem_manufacturing_gate();
REVOKE ALL ON FUNCTION public.oem_order_manufacturing_gate(uuid),public.create_oem_trial(uuid,uuid,text,text,boolean,text,text,uuid),public.record_oem_trial_result(uuid,uuid,text,text,integer),public.issue_oem_approval(uuid,uuid,uuid,text,text,text,text,text,text,timestamptz,uuid),public.act_oem_approval(text,text,text,text,text,text,uuid,text),public.revoke_oem_approval(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.oem_order_manufacturing_gate(uuid),public.create_oem_trial(uuid,uuid,text,text,boolean,text,text,uuid),public.record_oem_trial_result(uuid,uuid,text,text,integer),public.issue_oem_approval(uuid,uuid,uuid,text,text,text,text,text,text,timestamptz,uuid),public.act_oem_approval(text,text,text,text,text,text,uuid,text),public.revoke_oem_approval(uuid,uuid,text) TO service_role;
COMMIT;
