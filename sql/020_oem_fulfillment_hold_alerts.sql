-- Keep the dashboard classification consistent with the existing settlement gate.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_oem_fulfillment_alerts(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE(order_id uuid,lead_id uuid,order_number text,company_name text,status text,planned_quantity integer,completed_quantity integer,quantity_unit text,production_due_date date,shipment_due_date date,kind text,total_count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
WITH c AS (
 SELECT o.id order_id,o.lead_id,o.order_number,o.status,l.company_name,f.planned_quantity,f.completed_quantity,f.quantity_unit,f.production_due_date,f.shipment_due_date,
 CASE WHEN public.oem_settlement_has_active(o.id) THEN 'settlement_hold'
      WHEN f.shipment_due_date < (now() AT TIME ZONE 'Asia/Tokyo')::date THEN 'shipment_overdue'
      WHEN o.status='in_production' AND f.completed_on IS NULL AND f.production_due_date < (now() AT TIME ZONE 'Asia/Tokyo')::date THEN 'production_overdue'
      WHEN f.planned_quantity IS NULL OR f.shipment_due_date IS NULL THEN 'unconfigured'
      WHEN o.status='paid' THEN 'ready_to_ship' END kind
 FROM public.oem_orders o JOIN public.leads l ON l.id=o.lead_id AND l.page_id='35e7d402-0443-4703-94a4-fc2873b8f933'::uuid
 LEFT JOIN public.oem_order_fulfillment f ON f.order_id=o.id
 WHERE o.status IN ('accepted','deposit_paid','in_production','balance_due','paid')
), n AS (SELECT c.*,count(*) OVER() total_count FROM c WHERE kind IS NOT NULL)
SELECT order_id,lead_id,order_number,company_name,status,planned_quantity,completed_quantity,coalesce(quantity_unit,'個'),production_due_date,shipment_due_date,kind,total_count FROM n
ORDER BY CASE kind WHEN 'settlement_hold' THEN 0 WHEN 'shipment_overdue' THEN 1 WHEN 'production_overdue' THEN 2 WHEN 'unconfigured' THEN 3 ELSE 4 END,shipment_due_date NULLS LAST,order_number
LIMIT greatest(0,least(coalesce(p_limit,50),50)) OFFSET greatest(0,coalesce(p_offset,0));
$$;
REVOKE ALL ON FUNCTION public.get_oem_fulfillment_alerts(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_oem_fulfillment_alerts(integer,integer) TO service_role;
COMMIT;
