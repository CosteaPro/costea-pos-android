CREATE OR REPLACE FUNCTION public.apply_inventory_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_delta numeric;
BEGIN
  NEW.total_value := ROUND(COALESCE(NEW.quantity,0) * COALESCE(NEW.unit_cost,0), 2);
  IF NEW.movement_type IN ('transferencia','entrada_produccion') THEN
    v_delta := COALESCE(NEW.quantity, 0);
  ELSIF NEW.movement_type IN ('venta','baja','lunch') THEN
    v_delta := -ABS(COALESCE(NEW.quantity, 0));
  ELSE
    v_delta := 0;
  END IF;

  IF v_delta <> 0 THEN
    UPDATE public.inventory_items
       SET stock = COALESCE(stock, 0) + v_delta,
           updated_at = now()
     WHERE id = NEW.item_id;
  END IF;

  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.movement_stock_delta(_type inventory_movement_type, _qty numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _type = 'transferencia' THEN COALESCE(_qty, 0)
    WHEN _type IN ('venta','baja','lunch') THEN -ABS(COALESCE(_qty, 0))
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.recalc_inventory_stock()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.can_manage_movements(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Administrador puede recalcular el inventario.';
  END IF;

  WITH base AS (
    SELECT DISTINCT ON (ob.item_id) ob.item_id, ob.business_date, ob.quantity
      FROM public.inventory_opening_balances ob
     WHERE ob.business_date <= public.ec_business_date()
     ORDER BY ob.item_id, ob.business_date DESC
  ),
  compras AS (
    SELECT pi.item_id, SUM(COALESCE(pi.quantity_inventory, 0)) AS qty
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
           SUM(public.movement_stock_delta(m.movement_type, m.quantity)) AS qty
      FROM public.inventory_movements m
      LEFT JOIN base b ON b.item_id = m.item_id
     WHERE m.deleted_at IS NULL
       AND (b.business_date IS NULL OR m.business_date >= b.business_date)
     GROUP BY m.item_id
  ),
  upd AS (
    UPDATE public.inventory_items i
       SET stock = ROUND(COALESCE(b.quantity, 0) + COALESCE(c.qty, 0) + COALESCE(mv.qty, 0), 6),
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

REVOKE ALL ON FUNCTION public.recalc_inventory_stock() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_inventory_stock() TO authenticated, service_role;

SELECT public.recalc_inventory_stock();