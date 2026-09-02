CREATE OR REPLACE FUNCTION public.recalc_inventory_stock()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH base AS (
    SELECT DISTINCT ON (ob.item_id) ob.item_id, ob.business_date, ob.quantity
      FROM public.inventory_opening_balances ob
     WHERE ob.business_date <= public.ec_business_date()
     ORDER BY ob.item_id, ob.business_date DESC
  ),
  compras AS (
    SELECT pi.item_id,
           SUM(COALESCE(pi.quantity_inventory, 0)) AS qty
      FROM public.purchase_items pi
      JOIN public.purchases p ON p.id = pi.purchase_id
      LEFT JOIN base b ON b.item_id = pi.item_id
     WHERE pi.item_id IS NOT NULL
       AND (b.business_date IS NULL
            OR (p.purchased_at AT TIME ZONE 'America/Guayaquil')::date >= b.business_date)
     GROUP BY pi.item_id
  ),
  movs AS (
    SELECT m.item_id,
           SUM(
             CASE
               WHEN m.movement_type = 'entrada_produccion' THEN ABS(COALESCE(m.quantity,0))
               WHEN m.movement_type = 'transferencia' THEN COALESCE(m.quantity,0)
               WHEN m.movement_type IN ('venta','baja','lunch') THEN -ABS(COALESCE(m.quantity,0))
               ELSE 0
             END
           ) AS qty
      FROM public.inventory_movements m
      LEFT JOIN base b ON b.item_id = m.item_id
     WHERE m.deleted_at IS NULL
       AND (b.business_date IS NULL OR m.business_date >= b.business_date)
     GROUP BY m.item_id
  ),
  upd AS (
    UPDATE public.inventory_items i
       SET stock = ROUND(
             COALESCE(b.quantity, 0) + COALESCE(c.qty, 0) + COALESCE(mv.qty, 0), 6),
           updated_at = now()
      FROM (SELECT id FROM public.inventory_items) src
      LEFT JOIN base b ON b.item_id = src.id
      LEFT JOIN compras c ON c.item_id = src.id
      LEFT JOIN movs mv ON mv.item_id = src.id
     WHERE i.id = src.id
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.recalc_inventory_stock() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalc_inventory_stock() TO authenticated, service_role;

SELECT public.recalc_inventory_stock();