-- OEM manufacturing and shipping progress.  All writes are service-role RPCs.
BEGIN;

CREATE TABLE public.oem_order_fulfillment (
  order_id uuid PRIMARY KEY REFERENCES public.oem_orders(id) ON DELETE RESTRICT,
  planned_quantity integer CHECK (planned_quantity IS NULL OR planned_quantity BETWEEN 1 AND 10000000),
  quantity_unit text NOT NULL DEFAULT '個' CHECK (length(trim(quantity_unit)) BETWEEN 1 AND 20),
  production_due_date date,
  shipment_due_date date,
  started_on date,
  completed_quantity integer CHECK (completed_quantity IS NULL OR completed_quantity BETWEEN 1 AND 10000000),
  completed_on date,
  shipped_on date,
  carrier text NOT NULL DEFAULT '' CHECK (length(carrier) <= 100),
  tracking_number text NOT NULL DEFAULT '' CHECK (length(tracking_number) <= 100),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT oem_fulfillment_due_order CHECK (production_due_date IS NULL OR shipment_due_date IS NULL OR production_due_date <= shipment_due_date),
  CONSTRAINT oem_fulfillment_dates_past CHECK (
    (production_due_date IS NULL OR production_due_date >= DATE '1900-01-01') AND
    (shipment_due_date IS NULL OR shipment_due_date >= DATE '1900-01-01') AND
    (started_on IS NULL OR started_on <= (now() AT TIME ZONE 'Asia/Tokyo')::date) AND
    (completed_on IS NULL OR completed_on <= (now() AT TIME ZONE 'Asia/Tokyo')::date) AND
    (shipped_on IS NULL OR shipped_on <= (now() AT TIME ZONE 'Asia/Tokyo')::date) AND
    (started_on IS NULL OR completed_on IS NULL OR started_on <= completed_on) AND
    (completed_on IS NULL OR shipped_on IS NULL OR completed_on <= shipped_on) AND
    (started_on IS NULL OR shipped_on IS NULL OR started_on <= shipped_on)
  )
);
CREATE INDEX oem_order_fulfillment_due_idx ON public.oem_order_fulfillment(shipment_due_date, production_due_date);
ALTER TABLE public.oem_order_fulfillment ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oem_order_fulfillment FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.oem_order_fulfillment TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_oem_fulfillment_order_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.oem_order_fulfillment%ROWTYPE;
BEGIN
  IF NEW.status = OLD.status OR NEW.status IN ('issued','accepted','deposit_paid','cancelled') THEN RETURN NEW; END IF;
  SELECT * INTO f FROM public.oem_order_fulfillment WHERE order_id = NEW.id;
  IF NEW.status = 'in_production' AND (NOT FOUND OR f.planned_quantity IS NULL OR f.started_on IS NULL) THEN
    RAISE EXCEPTION 'fulfillment production fields are required' USING ERRCODE='check_violation';
  ELSIF NEW.status = 'balance_due' AND (NOT FOUND OR f.planned_quantity IS NULL OR f.started_on IS NULL OR f.completed_quantity IS NULL OR f.completed_on IS NULL) THEN
    RAISE EXCEPTION 'fulfillment completion fields are required' USING ERRCODE='check_violation';
  ELSIF NEW.status = 'shipped' AND (NOT FOUND OR f.completed_quantity IS NULL OR f.completed_on IS NULL OR f.shipped_on IS NULL OR length(trim(f.carrier)) = 0) THEN
    RAISE EXCEPTION 'fulfillment shipping fields are required' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_oem_fulfillment_order_status BEFORE UPDATE OF status ON public.oem_orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_oem_fulfillment_order_status();

CREATE OR REPLACE FUNCTION public.update_oem_fulfillment(
  p_order_id uuid, p_actor uuid, p_expected_version integer, p_action text, p_input jsonb
) RETURNS TABLE(result text, current_version integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.oem_orders%ROWTYPE; f public.oem_order_fulfillment%ROWTYPE;
  before_data jsonb; after_data jsonb; new_version integer;
  q integer; cq integer; fa integer; d1 date; d2 date; sd date; cd date; shd date;
  unit text; carrier_v text; tracking_v text; notes_v text; action text;
  has_q boolean; has_unit boolean; has_d1 boolean; has_d2 boolean; has_cq boolean; has_cd boolean; has_sd boolean; has_carrier boolean; has_tracking boolean; has_notes boolean;
  event_type text; old_status text; old_final_amount integer;
BEGIN
  action := lower(coalesce(p_action,''));
  IF p_order_id IS NULL OR p_actor IS NULL OR p_expected_version IS NULL OR p_expected_version < 0 OR action NOT IN ('save','start','complete','record_completion','ship') OR p_input IS NULL OR jsonb_typeof(p_input) <> 'object' THEN
    RETURN QUERY SELECT 'invalid',NULL::integer; RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oem_mail_admins WHERE user_id=p_actor) THEN RETURN QUERY SELECT 'forbidden',NULL::integer; RETURN; END IF;
  SELECT * INTO o FROM public.oem_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::integer; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id=o.lead_id AND page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid) THEN RETURN QUERY SELECT 'not_found',NULL::integer; RETURN; END IF;
  old_status := o.status; old_final_amount := o.final_amount;
  SELECT * INTO f FROM public.oem_order_fulfillment WHERE order_id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    IF p_expected_version <> 0 THEN RETURN QUERY SELECT 'conflict',0; RETURN; END IF;
    f.order_id := p_order_id; f.version := 0; f.quantity_unit := '個'; f.carrier := ''; f.tracking_number := ''; f.notes := '';
  ELSE
    IF f.version <> p_expected_version THEN RETURN QUERY SELECT 'conflict',f.version; RETURN; END IF;
  END IF;
  IF o.status IN ('issued','shipped','cancelled') THEN RETURN QUERY SELECT 'state',f.version; RETURN; END IF;

  BEGIN
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_input) AS keys(key) WHERE
    (action='save' AND key NOT IN ('plannedQuantity','quantityUnit','productionDueDate','shipmentDueDate','notes')) OR
    (action='start' AND key IS NOT NULL) OR
    (action='complete' AND key NOT IN ('completedQuantity','completedOn','finalAmount')) OR
    (action='record_completion' AND key NOT IN ('completedQuantity','completedOn')) OR
    (action='ship' AND key NOT IN ('shippedOn','carrier','trackingNumber'))) THEN RETURN QUERY SELECT 'invalid',f.version; RETURN; END IF;
  has_q := p_input ? 'plannedQuantity'; has_unit := p_input ? 'quantityUnit'; has_d1 := p_input ? 'productionDueDate'; has_d2 := p_input ? 'shipmentDueDate';
  has_cq := p_input ? 'completedQuantity'; has_cd := p_input ? 'completedOn'; has_sd := p_input ? 'shippedOn'; has_carrier := p_input ? 'carrier'; has_tracking := p_input ? 'trackingNumber'; has_notes := p_input ? 'notes';
  IF action='save' AND (NOT (p_input ? 'quantityUnit') OR length(trim(coalesce(p_input->>'quantityUnit',''))) < 1) THEN RETURN QUERY SELECT 'invalid',f.version; RETURN; END IF;
  IF (has_q AND p_input->>'plannedQuantity' IS NOT NULL AND jsonb_typeof(p_input->'plannedQuantity') <> 'number') OR
     (has_cq AND jsonb_typeof(p_input->'completedQuantity') <> 'number') OR
     ((p_input ? 'finalAmount') AND jsonb_typeof(p_input->'finalAmount') <> 'number') OR
     (has_unit AND jsonb_typeof(p_input->'quantityUnit') <> 'string') OR
     (has_d1 AND p_input->>'productionDueDate' IS NOT NULL AND jsonb_typeof(p_input->'productionDueDate') <> 'string') OR
     (has_d2 AND p_input->>'shipmentDueDate' IS NOT NULL AND jsonb_typeof(p_input->'shipmentDueDate') <> 'string') OR
     (has_cd AND jsonb_typeof(p_input->'completedOn') <> 'string') OR
     (has_sd AND jsonb_typeof(p_input->'shippedOn') <> 'string') OR
     (has_carrier AND jsonb_typeof(p_input->'carrier') <> 'string') OR
     (has_tracking AND jsonb_typeof(p_input->'trackingNumber') <> 'string') OR
     (has_notes AND jsonb_typeof(p_input->'notes') <> 'string') THEN RETURN QUERY SELECT 'invalid',f.version; RETURN; END IF;
  IF (has_unit AND (coalesce(p_input->>'quantityUnit','') ~ '[\r\n\x00]')) OR (has_carrier AND coalesce(p_input->>'carrier','') ~ '[\r\n\x00]') OR (has_tracking AND coalesce(p_input->>'trackingNumber','') ~ '[\r\n\x00]') OR (has_notes AND coalesce(p_input->>'notes','') ~ '[\r\n\x00]') THEN RETURN QUERY SELECT 'invalid',f.version; RETURN; END IF;
  IF has_q AND p_input->>'plannedQuantity' IS NOT NULL AND p_input->>'plannedQuantity' <> '' AND (p_input->>'plannedQuantity' !~ '^[0-9]+$' OR length(p_input->>'plannedQuantity') > 8) THEN RETURN QUERY SELECT 'invalid',f.version; RETURN; END IF;
  IF has_cq AND p_input->>'completedQuantity' IS NOT NULL AND (p_input->>'completedQuantity' !~ '^[0-9]+$' OR length(p_input->>'completedQuantity') > 8) THEN RETURN QUERY SELECT 'invalid',f.version; RETURN; END IF;
  IF (p_input ? 'finalAmount') AND (p_input->>'finalAmount' IS NULL OR p_input->>'finalAmount' !~ '^[0-9]+$' OR length(p_input->>'finalAmount') > 9) THEN RETURN QUERY SELECT 'invalid',f.version; RETURN; END IF;
  IF (has_d1 AND p_input->>'productionDueDate' IS NOT NULL AND p_input->>'productionDueDate' <> '' AND (p_input->>'productionDueDate' !~ '^\d{4}-\d{2}-\d{2}$' OR (CASE WHEN left(p_input->>'productionDueDate',4) ~ '^[0-9]{4}$' THEN left(p_input->>'productionDueDate',4)::integer ELSE 0 END) < 1900 OR to_date(p_input->>'productionDueDate','YYYY-MM-DD')::text <> p_input->>'productionDueDate')) OR (has_d2 AND p_input->>'shipmentDueDate' IS NOT NULL AND p_input->>'shipmentDueDate' <> '' AND (p_input->>'shipmentDueDate' !~ '^\d{4}-\d{2}-\d{2}$' OR (CASE WHEN left(p_input->>'shipmentDueDate',4) ~ '^[0-9]{4}$' THEN left(p_input->>'shipmentDueDate',4)::integer ELSE 0 END) < 1900 OR to_date(p_input->>'shipmentDueDate','YYYY-MM-DD')::text <> p_input->>'shipmentDueDate')) OR (has_cd AND p_input->>'completedOn' IS NOT NULL AND (p_input->>'completedOn' !~ '^\d{4}-\d{2}-\d{2}$' OR (CASE WHEN left(p_input->>'completedOn',4) ~ '^[0-9]{4}$' THEN left(p_input->>'completedOn',4)::integer ELSE 0 END) < 1900 OR to_date(p_input->>'completedOn','YYYY-MM-DD')::text <> p_input->>'completedOn' OR to_date(p_input->>'completedOn','YYYY-MM-DD') > (now() AT TIME ZONE 'Asia/Tokyo')::date)) OR (has_sd AND p_input->>'shippedOn' IS NOT NULL AND (p_input->>'shippedOn' !~ '^\d{4}-\d{2}-\d{2}$' OR (CASE WHEN left(p_input->>'shippedOn',4) ~ '^[0-9]{4}$' THEN left(p_input->>'shippedOn',4)::integer ELSE 0 END) < 1900 OR to_date(p_input->>'shippedOn','YYYY-MM-DD')::text <> p_input->>'shippedOn' OR to_date(p_input->>'shippedOn','YYYY-MM-DD') > (now() AT TIME ZONE 'Asia/Tokyo')::date)) THEN RETURN QUERY SELECT 'invalid',f.version; RETURN; END IF;
  IF has_q THEN q := NULLIF(p_input->>'plannedQuantity','')::integer; END IF;
  IF has_cq THEN cq := NULLIF(p_input->>'completedQuantity','')::integer; END IF;
  IF has_unit THEN unit := trim(coalesce(p_input->>'quantityUnit','')); END IF;
  IF has_carrier THEN carrier_v := coalesce(p_input->>'carrier',''); END IF; IF has_tracking THEN tracking_v := coalesce(p_input->>'trackingNumber',''); END IF; IF has_notes THEN notes_v := coalesce(p_input->>'notes',''); END IF;
  IF has_d1 THEN d1 := NULLIF(p_input->>'productionDueDate','')::date; END IF; IF has_d2 THEN d2 := NULLIF(p_input->>'shipmentDueDate','')::date; END IF;
  IF has_cd THEN cd := NULLIF(p_input->>'completedOn','')::date; END IF; IF has_sd THEN sd := NULLIF(p_input->>'shippedOn','')::date; END IF;
  IF has_q AND (q IS NOT NULL AND (q < 1 OR q > 10000000)) OR has_cq AND (cq IS NOT NULL AND (cq < 1 OR cq > 10000000)) OR has_unit AND length(unit)>20 OR has_carrier AND length(carrier_v)>100 OR has_tracking AND length(tracking_v)>100 OR has_notes AND length(notes_v)>2000 THEN RETURN QUERY SELECT 'invalid',f.version; RETURN; END IF;
  before_data := to_jsonb(f);

  IF action = 'save' THEN
    IF o.status NOT IN ('accepted','deposit_paid','in_production','balance_due','paid') THEN RETURN QUERY SELECT 'state',f.version; RETURN; END IF;
    IF (f.completed_on IS NOT NULL OR f.completed_quantity IS NOT NULL) AND (has_q OR has_unit) AND ((has_q AND q IS DISTINCT FROM f.planned_quantity) OR (has_unit AND unit IS DISTINCT FROM f.quantity_unit)) THEN RETURN QUERY SELECT 'state',f.version; RETURN; END IF;
    IF has_q THEN f.planned_quantity := q; END IF; IF has_unit THEN f.quantity_unit := unit; END IF; IF has_d1 THEN f.production_due_date := d1; END IF; IF has_d2 THEN f.shipment_due_date := d2; END IF; IF has_notes THEN f.notes := notes_v; END IF;
    event_type := 'fulfillment_saved';
  ELSIF action = 'start' THEN
    IF o.status <> 'deposit_paid' OR f.planned_quantity IS NULL THEN RETURN QUERY SELECT 'state',f.version; RETURN; END IF;
    f.started_on := (now() AT TIME ZONE 'Asia/Tokyo')::date; o.status := 'in_production'; event_type := 'production_started';
  ELSIF action = 'complete' THEN
    IF o.status <> 'in_production' OR f.planned_quantity IS NULL OR NOT has_cq OR cq IS NULL OR NOT has_cd OR cd IS NULL OR NOT (p_input ? 'finalAmount') THEN RETURN QUERY SELECT 'state',f.version; RETURN; END IF;
    fa := NULLIF(p_input->>'finalAmount','')::integer; IF fa IS NULL OR fa < 1 OR fa > 100000000 THEN RETURN QUERY SELECT 'invalid',f.version; RETURN; END IF;
    f.completed_quantity := cq; f.completed_on := cd; o.status := 'balance_due'; o.final_amount := fa; event_type := 'production_completed';
  ELSIF action = 'record_completion' THEN
    IF o.status NOT IN ('balance_due','paid') OR f.completed_quantity IS NOT NULL OR f.completed_on IS NOT NULL OR NOT has_cq OR cq IS NULL OR NOT has_cd OR cd IS NULL THEN RETURN QUERY SELECT 'state',f.version; RETURN; END IF;
    f.completed_quantity := cq; f.completed_on := cd; event_type := 'completion_details_recorded';
  ELSE
    IF o.status <> 'paid' OR f.completed_quantity IS NULL OR f.completed_on IS NULL OR NOT has_sd OR sd IS NULL OR NOT has_carrier OR carrier_v IS NULL OR length(trim(carrier_v))=0 THEN RETURN QUERY SELECT 'state',f.version; RETURN; END IF;
    f.shipped_on := sd; f.carrier := trim(carrier_v); IF has_tracking THEN f.tracking_number := tracking_v; END IF; o.status := 'shipped'; event_type := 'order_shipped';
  END IF;
  IF f.production_due_date IS NOT NULL AND f.shipment_due_date IS NOT NULL AND f.production_due_date > f.shipment_due_date THEN RETURN QUERY SELECT 'invalid',f.version; RETURN; END IF;
  IF f.started_on IS NOT NULL AND f.completed_on IS NOT NULL AND f.started_on > f.completed_on OR f.completed_on IS NOT NULL AND f.shipped_on IS NOT NULL AND f.completed_on > f.shipped_on THEN RETURN QUERY SELECT 'invalid',f.version; RETURN; END IF;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range OR invalid_text_representation THEN
    RETURN QUERY SELECT 'invalid',f.version; RETURN;
  END;
  f.version := f.version + 1; f.updated_at := now(); f.updated_by := p_actor;
  INSERT INTO public.oem_order_fulfillment SELECT f.* ON CONFLICT (order_id) DO UPDATE SET planned_quantity=excluded.planned_quantity,quantity_unit=excluded.quantity_unit,production_due_date=excluded.production_due_date,shipment_due_date=excluded.shipment_due_date,started_on=excluded.started_on,completed_quantity=excluded.completed_quantity,completed_on=excluded.completed_on,shipped_on=excluded.shipped_on,carrier=excluded.carrier,tracking_number=excluded.tracking_number,notes=excluded.notes,version=excluded.version,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
  UPDATE public.oem_orders SET status=o.status, final_amount=o.final_amount, updated_at=now() WHERE id=o.id;
  SELECT to_jsonb(x) INTO after_data FROM public.oem_order_fulfillment x WHERE x.order_id=p_order_id;
  INSERT INTO public.oem_lead_events(lead_id,event_type,details,created_by) VALUES(o.lead_id,event_type,jsonb_build_object('order_id',o.id,'before',before_data,'after',after_data,'order_before',jsonb_build_object('status',old_status,'final_amount',old_final_amount),'order_after',jsonb_build_object('status',o.status,'final_amount',o.final_amount)),p_actor);
  RETURN QUERY SELECT CASE action WHEN 'save' THEN 'saved' WHEN 'start' THEN 'started' WHEN 'complete' THEN 'completed' WHEN 'record_completion' THEN 'completion_recorded' ELSE 'shipped' END, f.version;
END $$;

CREATE OR REPLACE FUNCTION public.get_oem_fulfillment_alerts(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE(order_id uuid,lead_id uuid,order_number text,company_name text,status text,planned_quantity integer,completed_quantity integer,quantity_unit text,production_due_date date,shipment_due_date date,kind text,total_count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
WITH c AS (
 SELECT o.id order_id,o.lead_id,o.order_number,o.status,l.company_name,f.planned_quantity,f.completed_quantity,f.quantity_unit,f.production_due_date,f.shipment_due_date,
 CASE WHEN f.shipment_due_date < (now() AT TIME ZONE 'Asia/Tokyo')::date THEN 'shipment_overdue'
      WHEN o.status='in_production' AND f.completed_on IS NULL AND f.production_due_date < (now() AT TIME ZONE 'Asia/Tokyo')::date THEN 'production_overdue'
      WHEN f.planned_quantity IS NULL OR f.shipment_due_date IS NULL THEN 'unconfigured'
      WHEN o.status='paid' THEN 'ready_to_ship' END kind
 FROM public.oem_orders o JOIN public.leads l ON l.id=o.lead_id AND l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid LEFT JOIN public.oem_order_fulfillment f ON f.order_id=o.id
 WHERE o.status IN ('accepted','deposit_paid','in_production','balance_due','paid')
), n AS (SELECT c.*,count(*) OVER() total_count FROM c WHERE kind IS NOT NULL)
SELECT order_id,lead_id,order_number,company_name,status,planned_quantity,completed_quantity,coalesce(quantity_unit,'個'),production_due_date,shipment_due_date,kind,total_count FROM n
ORDER BY CASE kind WHEN 'shipment_overdue' THEN 0 WHEN 'production_overdue' THEN 1 WHEN 'unconfigured' THEN 2 ELSE 3 END,shipment_due_date NULLS LAST,order_number
LIMIT greatest(0,least(coalesce(p_limit,50),50)) OFFSET greatest(0,coalesce(p_offset,0));
$$;

REVOKE ALL ON FUNCTION public.update_oem_fulfillment(uuid,uuid,integer,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_oem_fulfillment_alerts(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_oem_fulfillment(uuid,uuid,integer,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_oem_fulfillment_alerts(integer,integer) TO service_role;
REVOKE ALL ON FUNCTION public.enforce_oem_fulfillment_order_status() FROM PUBLIC,anon,authenticated;
COMMIT;
