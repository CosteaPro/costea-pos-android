ALTER TYPE public.inventory_movement_type ADD VALUE IF NOT EXISTS 'consumo_produccion';
ALTER TYPE public.inventory_movement_type ADD VALUE IF NOT EXISTS 'entrada_produccion';

CREATE OR REPLACE FUNCTION public.apply_sales_consumption(_order_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_marca text := '[ord:' || _order_id::text || ']';
  v_folio bigint;
  v_ref text;
  v_date date;
  v_count integer := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.inventory_movements
    WHERE movement_type = 'venta' AND reason LIKE '%' || v_marca || '%'
  ) THEN
    RETURN 0;
  END IF;

  SELECT o.folio, COALESCE((o.paid_at AT TIME ZONE 'America/Guayaquil')::date,
                           (o.created_at AT TIME ZONE 'America/Guayaquil')::date)
    INTO v_folio, v_date
  FROM public.orders o WHERE o.id = _order_id;

  IF v_date IS NULL THEN RETURN 0; END IF;
  v_ref := CASE WHEN v_folio IS NULL THEN 'Pedido' ELSE 'Pedido #' || v_folio END;

  WITH RECURSIVE nodes AS (
    SELECT r.id AS recipe_id, oi.quantity::numeric AS factor, 0 AS depth
    FROM public.order_items oi
    JOIN public.recipes r ON r.product_id = oi.product_id AND r.kind <> 'subreceta'
    WHERE oi.order_id = _order_id AND oi.quantity > 0
    UNION ALL
    -- Solo se explotan las subrecetas que NO existen como producto de inventario.
    SELECT sr.id,
           n.factor * ri.quantity / GREATEST(COALESCE(sr.yield_quantity, 1), 0.000001),
           n.depth + 1
    FROM nodes n
    JOIN public.recipe_items ri ON ri.recipe_id = n.recipe_id AND ri.sub_recipe_id IS NOT NULL
    JOIN public.recipes sr ON sr.id = ri.sub_recipe_id
    WHERE n.depth < 6 AND ri.quantity > 0 AND sr.inventory_item_id IS NULL
  ),
  needs AS (
    -- ingredientes directos
    SELECT ri.item_id, lower(coalesce(ri.unit,'')) AS unit, n.factor * ri.quantity AS qty
    FROM nodes n
    JOIN public.recipe_items ri ON ri.recipe_id = n.recipe_id
    WHERE ri.item_id IS NOT NULL AND ri.quantity > 0
    UNION ALL
    -- subrecetas terminadas: se descuenta SOLO su item de inventario
    SELECT sr.inventory_item_id, lower(coalesce(ri.unit,'')), n.factor * ri.quantity
    FROM nodes n
    JOIN public.recipe_items ri ON ri.recipe_id = n.recipe_id AND ri.sub_recipe_id IS NOT NULL
    JOIN public.recipes sr ON sr.id = ri.sub_recipe_id
    WHERE sr.inventory_item_id IS NOT NULL AND ri.quantity > 0
  ),
  conv AS (
    SELECT n.item_id,
           SUM(
             n.qty * CASE
               WHEN n.unit = '' OR n.unit = lower(i.unit) THEN 1
               ELSE COALESCE(public.unit_convert_factor(n.unit, i.unit),
                             1 / GREATEST(COALESCE(i.inventory_to_recipe, 1), 0.000001))
             END
           ) AS qty_inv
    FROM needs n
    JOIN public.inventory_items i ON i.id = n.item_id
    GROUP BY n.item_id
  ),
  ins AS (
    INSERT INTO public.inventory_movements
      (item_id, item_code, item_name, category, movement_type, business_date,
       quantity, unit, unit_cost, total_value, reason, created_by)
    SELECT i.id, i.code, i.name, i.category, 'venta'::inventory_movement_type, v_date,
           ROUND(c.qty_inv, 2), i.unit, COALESCE(i.unit_cost, 0),
           ROUND(ROUND(c.qty_inv, 2) * COALESCE(i.unit_cost, 0), 2),
           'CONSUMO POR VENTA · ' || v_ref || ' ' || v_marca,
           auth.uid()
    FROM conv c
    JOIN public.inventory_items i ON i.id = c.item_id
    WHERE ROUND(c.qty_inv, 2) > 0
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;

  RETURN v_count;
END;
$function$;