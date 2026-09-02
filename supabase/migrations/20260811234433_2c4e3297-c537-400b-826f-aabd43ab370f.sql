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
    SELECT 1
      FROM public.inventory_movements
     WHERE movement_type = 'venta'
       AND reason LIKE '%' || v_marca || '%'
  ) THEN
    RETURN 0;
  END IF;

  SELECT o.folio,
         COALESCE(
           (o.paid_at AT TIME ZONE 'America/Guayaquil')::date,
           (o.created_at AT TIME ZONE 'America/Guayaquil')::date
         )
    INTO v_folio, v_date
    FROM public.orders o
   WHERE o.id = _order_id
     AND o.status = 'pagado';

  IF v_date IS NULL THEN
    RETURN 0;
  END IF;

  v_ref := CASE WHEN v_folio IS NULL THEN 'Pedido' ELSE 'Pedido #' || v_folio END;

  WITH direct_recipes AS (
    SELECT r.id AS recipe_id, oi.quantity::numeric AS sale_quantity
      FROM public.order_items oi
      JOIN public.recipes r
        ON r.product_id = oi.product_id
       AND r.kind <> 'subreceta'
     WHERE oi.order_id = _order_id
       AND oi.quantity > 0
  ),
  direct_needs AS (
    -- Insumo directo: únicamente líneas que NO son subrecetas.
    SELECT ri.item_id,
           lower(COALESCE(ri.unit, '')) AS unit,
           dr.sale_quantity * ri.quantity AS qty
      FROM direct_recipes dr
      JOIN public.recipe_items ri ON ri.recipe_id = dr.recipe_id
     WHERE ri.sub_recipe_id IS NULL
       AND ri.item_id IS NOT NULL
       AND ri.quantity > 0

    UNION ALL

    -- Subreceta cerrada: solo baja su artículo terminado; nunca sus ingredientes.
    SELECT sr.inventory_item_id,
           lower(COALESCE(ri.unit, '')) AS unit,
           dr.sale_quantity * ri.quantity AS qty
      FROM direct_recipes dr
      JOIN public.recipe_items ri
        ON ri.recipe_id = dr.recipe_id
       AND ri.sub_recipe_id IS NOT NULL
      JOIN public.recipes sr ON sr.id = ri.sub_recipe_id
     WHERE sr.inventory_item_id IS NOT NULL
       AND ri.quantity > 0
  ),
  converted AS (
    SELECT dn.item_id,
           SUM(
             dn.qty * CASE
               WHEN dn.unit = '' OR dn.unit = lower(i.unit) THEN 1
               ELSE COALESCE(
                 public.unit_convert_factor(dn.unit, i.unit),
                 1 / GREATEST(COALESCE(i.inventory_to_recipe, 1), 0.000001)
               )
             END
           ) AS qty_inventory
      FROM direct_needs dn
      JOIN public.inventory_items i ON i.id = dn.item_id
     GROUP BY dn.item_id
  ),
  inserted AS (
    INSERT INTO public.inventory_movements (
      item_id, item_code, item_name, category, movement_type, business_date,
      quantity, unit, unit_cost, total_value, reason, created_by
    )
    SELECT i.id,
           i.code,
           i.name,
           i.category,
           'venta'::public.inventory_movement_type,
           v_date,
           ROUND(c.qty_inventory, 6),
           i.unit,
           COALESCE(i.unit_cost, 0),
           ROUND(ROUND(c.qty_inventory, 6) * COALESCE(i.unit_cost, 0), 2),
           'CONSUMO POR VENTA · ' || v_ref || ' ' || v_marca,
           auth.uid()
      FROM converted c
      JOIN public.inventory_items i ON i.id = c.item_id
     WHERE ROUND(c.qty_inventory, 6) > 0
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM inserted;

  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.apply_sales_consumption(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_sales_consumption(uuid) TO authenticated, service_role;

DO $repair$
DECLARE
  r record;
BEGIN
  DELETE FROM public.inventory_movements
   WHERE movement_type = 'venta'
     AND business_date >= DATE '2026-08-01';

  FOR r IN
    SELECT o.id
      FROM public.orders o
     WHERE o.status = 'pagado'
       AND COALESCE(
             (o.paid_at AT TIME ZONE 'America/Guayaquil')::date,
             (o.created_at AT TIME ZONE 'America/Guayaquil')::date
           ) >= DATE '2026-08-01'
     ORDER BY COALESCE(o.paid_at, o.created_at), o.id
  LOOP
    PERFORM public.apply_sales_consumption(r.id);
  END LOOP;

  PERFORM *
    FROM public.recalc_inventory_period(
      DATE '2026-08-01',
      (now() AT TIME ZONE 'America/Guayaquil')::date
    );
END;
$repair$;