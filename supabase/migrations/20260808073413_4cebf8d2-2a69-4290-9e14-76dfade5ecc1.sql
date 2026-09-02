
-- Factor de conversión entre unidades (null si no aplica)
CREATE OR REPLACE FUNCTION public.unit_convert_factor(_from text, _to text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  WITH b(u, dim, base) AS (
    VALUES
      ('gramo','peso',1::numeric), ('kilo','peso',1000), ('libra','peso',453.59237),
      ('onza','peso',28.349523125), ('quintal','peso',45359.237),
      ('mililitro','volumen',1), ('litro','volumen',1000), ('galon','volumen',3785.411784),
      ('centimetro','longitud',1), ('metro','longitud',100),
      ('unidad','conteo',1), ('par','conteo',2), ('docena','conteo',12)
  )
  SELECT f.base / t.base
  FROM b f, b t
  WHERE f.u = lower(coalesce(_from,'')) AND t.u = lower(coalesce(_to,'')) AND f.dim = t.dim;
$$;

GRANT EXECUTE ON FUNCTION public.unit_convert_factor(text, text) TO authenticated, anon, service_role;

-- Consumo de inventario por venta: SIEMPRE descuenta, aunque el stock quede negativo
CREATE OR REPLACE FUNCTION public.apply_sales_consumption(_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    SELECT sr.id,
           n.factor * ri.quantity / GREATEST(COALESCE(sr.yield_quantity, 1), 0.000001),
           n.depth + 1
    FROM nodes n
    JOIN public.recipe_items ri ON ri.recipe_id = n.recipe_id AND ri.sub_recipe_id IS NOT NULL
    JOIN public.recipes sr ON sr.id = ri.sub_recipe_id
    WHERE n.depth < 6 AND ri.quantity > 0
  ),
  needs AS (
    -- ingredientes directos
    SELECT ri.item_id, lower(coalesce(ri.unit,'')) AS unit, n.factor * ri.quantity AS qty
    FROM nodes n
    JOIN public.recipe_items ri ON ri.recipe_id = n.recipe_id
    WHERE ri.item_id IS NOT NULL AND ri.quantity > 0
    UNION ALL
    -- subrecetas sin composición: se descuenta su ítem espejo
    SELECT sr.inventory_item_id, lower(coalesce(ri.unit,'')), n.factor * ri.quantity
    FROM nodes n
    JOIN public.recipe_items ri ON ri.recipe_id = n.recipe_id AND ri.sub_recipe_id IS NOT NULL
    JOIN public.recipes sr ON sr.id = ri.sub_recipe_id
    WHERE sr.inventory_item_id IS NOT NULL AND ri.quantity > 0
      AND NOT EXISTS (SELECT 1 FROM public.recipe_items x WHERE x.recipe_id = sr.id)
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
           ROUND(c.qty_inv, 6), i.unit, COALESCE(i.unit_cost, 0),
           ROUND(ROUND(c.qty_inv, 6) * COALESCE(i.unit_cost, 0), 2),
           'CONSUMO POR VENTA · ' || v_ref || ' ' || v_marca,
           auth.uid()
    FROM conv c
    JOIN public.inventory_items i ON i.id = c.item_id
    WHERE c.qty_inv > 0
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_sales_consumption(uuid) TO authenticated, service_role;

-- Recalcula el consumo de todas las ventas pagadas pendientes
CREATE OR REPLACE FUNCTION public.recalc_sales_consumption(_desde date DEFAULT NULL)
RETURNS TABLE(pedidos integer, movimientos integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_p integer := 0;
  v_m integer := 0;
BEGIN
  FOR r IN
    SELECT o.id FROM public.orders o
    WHERE o.status = 'pagado'
      AND (_desde IS NULL OR (o.created_at AT TIME ZONE 'America/Guayaquil')::date >= _desde)
    ORDER BY o.created_at
  LOOP
    v_m := v_m + COALESCE(public.apply_sales_consumption(r.id), 0);
    v_p := v_p + 1;
  END LOOP;
  pedidos := v_p; movimientos := v_m; RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalc_sales_consumption(date) TO authenticated, service_role;
