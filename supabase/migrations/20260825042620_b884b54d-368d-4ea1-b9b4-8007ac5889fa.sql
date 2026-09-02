CREATE OR REPLACE FUNCTION public.repropagate_item_cost(_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level int := 0;
  v_touched uuid[];
  v_next uuid[];
BEGIN
  IF _item_id IS NULL THEN RETURN; END IF;

  UPDATE public.recipe_items ri
     SET unit_cost = COALESCE(i.cost_per_recipe_unit, 0),
         subtotal = ROUND(COALESCE(ri.quantity, 0) * COALESCE(i.cost_per_recipe_unit, 0), 6),
         updated_at = now()
    FROM public.inventory_items i
   WHERE i.id = _item_id
     AND ri.item_id = _item_id
     AND ri.source_type = 'item';

  SELECT ARRAY(SELECT DISTINCT recipe_id FROM public.recipe_items
                WHERE item_id = _item_id AND source_type = 'item')
    INTO v_touched;

  WHILE v_level < 6 AND COALESCE(array_length(v_touched, 1), 0) > 0 LOOP
    -- Item espejo de las subrecetas afectadas: costo = suma de sus lineas / rendimiento.
    UPDATE public.inventory_items inv
       SET unit_cost = c.costo,
           cost_per_recipe_unit = ROUND(c.costo / GREATEST(COALESCE(inv.inventory_to_recipe, 1), 0.000001), 6),
           updated_at = now()
      FROM (
        SELECT r.inventory_item_id,
               ROUND(COALESCE(SUM(ri.subtotal), 0)
                     / GREATEST(COALESCE(r.yield_quantity, 1), 0.000001), 6) AS costo
          FROM public.recipes r
          LEFT JOIN public.recipe_items ri ON ri.recipe_id = r.id
         WHERE r.id = ANY(v_touched) AND r.inventory_item_id IS NOT NULL
         GROUP BY r.inventory_item_id, r.yield_quantity
      ) c
     WHERE inv.id = c.inventory_item_id;

    -- Lineas que consumen esas recetas como subreceta/receta.
    UPDATE public.recipe_items ri
       SET unit_cost = c.costo,
           subtotal = ROUND(COALESCE(ri.quantity, 0) * c.costo, 6),
           updated_at = now()
      FROM (
        SELECT r.id,
               ROUND(COALESCE(SUM(x.subtotal), 0)
                     / GREATEST(COALESCE(r.yield_quantity, 1), 0.000001), 6) AS costo
          FROM public.recipes r
          LEFT JOIN public.recipe_items x ON x.recipe_id = r.id
         WHERE r.id = ANY(v_touched)
         GROUP BY r.id, r.yield_quantity
      ) c
     WHERE ri.sub_recipe_id = c.id
       AND ri.source_type IN ('subreceta', 'receta');

    -- Lineas que consumen el ITEM ESPEJO de esas recetas.
    UPDATE public.recipe_items ri
       SET unit_cost = COALESCE(inv.cost_per_recipe_unit, 0),
           subtotal = ROUND(COALESCE(ri.quantity, 0) * COALESCE(inv.cost_per_recipe_unit, 0), 6),
           updated_at = now()
      FROM public.recipes r
      JOIN public.inventory_items inv ON inv.id = r.inventory_item_id
     WHERE r.id = ANY(v_touched)
       AND ri.source_type = 'item'
       AND ri.item_id = inv.id;

    SELECT ARRAY(
      SELECT DISTINCT ri.recipe_id
        FROM public.recipe_items ri
        LEFT JOIN public.recipes r ON r.inventory_item_id = ri.item_id
       WHERE (
              (ri.sub_recipe_id = ANY(v_touched) AND ri.source_type IN ('subreceta','receta'))
              OR (ri.source_type = 'item' AND r.id = ANY(v_touched))
             )
         AND NOT (ri.recipe_id = ANY(v_touched))
    ) INTO v_next;

    v_touched := v_next;
    v_level := v_level + 1;
  END LOOP;
END; $$;

REVOKE ALL ON FUNCTION public.repropagate_item_cost(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.repropagate_item_cost(uuid) TO service_role;