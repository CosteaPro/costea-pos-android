ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS sale_price numeric,
  ADD COLUMN IF NOT EXISTS variant_name text;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS recipe_id uuid REFERENCES public.recipes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS item_code text;

CREATE OR REPLACE FUNCTION public.set_recipe_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix text;
  v_pcode text;
BEGIN
  -- Regla de oro: el codigo de venta del producto es la identidad de la receta base.
  -- Las variantes SIEMPRE llevan codigo propio.
  IF NEW.kind NOT IN ('subreceta','variante') AND NEW.product_id IS NOT NULL THEN
    SELECT code INTO v_pcode FROM public.products WHERE id = NEW.product_id;
    IF v_pcode IS NOT NULL AND btrim(v_pcode) <> '' THEN
      NEW.code := v_pcode;
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    v_prefix := CASE WHEN NEW.kind = 'subreceta' THEN 'SR' ELSE 'RC' END;
    LOOP
      NEW.code := v_prefix || lpad(nextval('public.recipe_code_seq')::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.recipes WHERE code = NEW.code);
    END LOOP;
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.apply_sales_consumption(_order_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
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

  SELECT o.folio,
         COALESCE((o.paid_at AT TIME ZONE 'America/Guayaquil')::date,
                  (o.created_at AT TIME ZONE 'America/Guayaquil')::date)
    INTO v_folio, v_date
    FROM public.orders o
   WHERE o.id = _order_id AND o.status = 'pagado';

  IF v_date IS NULL THEN RETURN 0; END IF;

  v_ref := CASE WHEN v_folio IS NULL THEN 'Pedido' ELSE 'Pedido #' || v_folio END;

  WITH RECURSIVE nodes AS (
    -- Receta vendida: la variante elegida, o la receta base del producto.
    SELECT r.id AS recipe_id, oi.quantity::numeric AS factor, 0 AS depth
      FROM public.order_items oi
      JOIN public.recipes r
        ON r.id = COALESCE(
             oi.recipe_id,
             (SELECT b.id FROM public.recipes b
               WHERE b.product_id = oi.product_id
                 AND b.kind NOT IN ('subreceta','variante')
               ORDER BY b.created_at LIMIT 1)
           )
     WHERE oi.order_id = _order_id
       AND oi.quantity > 0

    UNION ALL

    -- Receta normal anidada: SÍ se abre y se descompone
    SELECT sub.id,
           n.factor * ri.quantity
             / CASE WHEN COALESCE(sub.yield_quantity, 0) > 0 THEN sub.yield_quantity ELSE 1 END,
           n.depth + 1
      FROM nodes n
      JOIN public.recipe_items ri ON ri.recipe_id = n.recipe_id
      JOIN public.recipes sub ON sub.id = ri.sub_recipe_id
     WHERE ri.quantity > 0
       AND sub.kind <> 'subreceta'
       AND n.depth < 8
  ),
  needs AS (
    SELECT ri.item_id,
           lower(COALESCE(ri.unit, '')) AS unit,
           n.factor * ri.quantity AS qty
      FROM nodes n
      JOIN public.recipe_items ri ON ri.recipe_id = n.recipe_id
     WHERE ri.sub_recipe_id IS NULL
       AND ri.item_id IS NOT NULL
       AND ri.quantity > 0

    UNION ALL

    SELECT sr.inventory_item_id,
           lower(COALESCE(ri.unit, '')) AS unit,
           n.factor * ri.quantity AS qty
      FROM nodes n
      JOIN public.recipe_items ri
        ON ri.recipe_id = n.recipe_id AND ri.sub_recipe_id IS NOT NULL
      JOIN public.recipes sr ON sr.id = ri.sub_recipe_id
     WHERE sr.kind = 'subreceta'
       AND sr.inventory_item_id IS NOT NULL
       AND ri.quantity > 0
  ),
  converted AS (
    SELECT nd.item_id,
           SUM(nd.qty * CASE
                 WHEN nd.unit = '' OR nd.unit = lower(i.unit) THEN 1
                 ELSE COALESCE(public.unit_convert_factor(nd.unit, i.unit),
                               1 / GREATEST(COALESCE(i.inventory_to_recipe, 1), 0.000001))
               END) AS qty_inventory
      FROM needs nd
      JOIN public.inventory_items i ON i.id = nd.item_id
     GROUP BY nd.item_id
  ),
  inserted AS (
    INSERT INTO public.inventory_movements (
      item_id, item_code, item_name, category, movement_type, business_date,
      quantity, unit, unit_cost, total_value, reason, created_by
    )
    SELECT i.id, i.code, i.name, i.category,
           'venta'::public.inventory_movement_type, v_date,
           ROUND(c.qty_inventory, 6), i.unit, COALESCE(i.unit_cost, 0),
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