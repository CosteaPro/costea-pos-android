CREATE OR REPLACE FUNCTION public.repropagate_item_cost(_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level int := 0;
  v_touched uuid[];
BEGIN
  IF _item_id IS NULL THEN RETURN; END IF;

  -- 1) Lineas de receta que usan directamente el item comprado.
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

  -- 2) Cascada acotada: las recetas afectadas actualizan a quienes las usan.
  WHILE v_level < 5 AND COALESCE(array_length(v_touched, 1), 0) > 0 LOOP
    -- Item espejo de las subrecetas afectadas.
    UPDATE public.inventory_items inv
       SET unit_cost = c.costo,
           cost_per_recipe_unit = ROUND(c.costo / GREATEST(COALESCE(inv.inventory_to_recipe, 1), 0.000001), 6),
           updated_at = now()
      FROM (
        SELECT r.id, r.inventory_item_id,
               ROUND(COALESCE(SUM(ri.subtotal), 0)
                     / GREATEST(COALESCE(r.yield_quantity, 1), 0.000001), 6) AS costo
          FROM public.recipes r
          LEFT JOIN public.recipe_items ri ON ri.recipe_id = r.id
         WHERE r.id = ANY(v_touched)
         GROUP BY r.id, r.inventory_item_id, r.yield_quantity
      ) c
     WHERE inv.id = c.inventory_item_id;

    -- Lineas que consumen esas recetas como insumo.
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

    SELECT ARRAY(SELECT DISTINCT ri.recipe_id
                   FROM public.recipe_items ri
                  WHERE ri.sub_recipe_id = ANY(v_touched)
                    AND ri.source_type IN ('subreceta', 'receta')
                    AND NOT (ri.recipe_id = ANY(v_touched)))
      INTO v_touched;

    v_level := v_level + 1;
  END LOOP;
END; $$;

REVOKE ALL ON FUNCTION public.repropagate_item_cost(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repropagate_item_cost(uuid) TO authenticated, service_role;

-- El registro de una compra propaga el costo a recetas y subrecetas.
CREATE OR REPLACE FUNCTION public.apply_purchase_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_factor numeric := 1;
  v_rec_factor numeric := 1;
  v_qty_inv numeric;
  v_cost_inv numeric;
  v_cost_rec numeric;
  v_unit text;
  v_recipe_unit text;
  v_purchase_unit text;
  v_name text;
BEGIN
  IF NEW.item_id IS NOT NULL THEN
    SELECT GREATEST(COALESCE(purchase_to_inventory, 1), 0.000001),
           GREATEST(COALESCE(inventory_to_recipe, 1), 0.000001),
           unit, recipe_unit, purchase_unit, name
      INTO v_factor, v_rec_factor, v_unit, v_recipe_unit, v_purchase_unit, v_name
      FROM public.inventory_items WHERE id = NEW.item_id;

    v_qty_inv := COALESCE(NEW.quantity, 0) * v_factor;
    v_cost_inv := COALESCE(NEW.unit_cost, 0) / v_factor;
    v_cost_rec := v_cost_inv / v_rec_factor;

    NEW.quantity_inventory := v_qty_inv;
    NEW.unit_cost_inventory := v_cost_inv;

    UPDATE public.inventory_items
       SET stock = COALESCE(stock, 0) + v_qty_inv,
           unit_cost = v_cost_inv,
           cost_per_recipe_unit = v_cost_rec,
           last_purchase_unit_cost = COALESCE(NEW.unit_cost, 0),
           last_purchase_at = now(),
           updated_at = now()
     WHERE id = NEW.item_id;

    INSERT INTO public.item_cost_history (
      item_id, purchase_id, item_name, purchase_unit, purchase_unit_cost,
      inventory_unit, cost_per_inventory_unit, recipe_unit, cost_per_recipe_unit,
      quantity_purchase, quantity_inventory
    ) VALUES (
      NEW.item_id, NEW.purchase_id, COALESCE(v_name, NEW.item_name), COALESCE(v_purchase_unit,''),
      COALESCE(NEW.unit_cost, 0), COALESCE(v_unit,''), v_cost_inv, COALESCE(v_recipe_unit,''),
      v_cost_rec, COALESCE(NEW.quantity, 0), v_qty_inv
    );

    PERFORM public.repropagate_item_cost(NEW.item_id);
  END IF;
  RETURN NEW;
END; $$;

-- Al deshacer una compra, las recetas vuelven al costo de la compra anterior.
CREATE OR REPLACE FUNCTION public.revert_purchase(_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_items uuid[];
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Administrador puede modificar o eliminar compras.';
  END IF;

  SELECT ARRAY(SELECT DISTINCT item_id FROM public.purchase_items
                WHERE purchase_id = _purchase_id AND item_id IS NOT NULL)
    INTO v_items;

  FOR r IN SELECT item_id, quantity_inventory FROM public.purchase_items
            WHERE purchase_id = _purchase_id AND item_id IS NOT NULL LOOP
    UPDATE public.inventory_items
       SET stock = COALESCE(stock, 0) - COALESCE(r.quantity_inventory, 0),
           updated_at = now()
     WHERE id = r.item_id;
  END LOOP;

  DELETE FROM public.item_cost_history WHERE purchase_id = _purchase_id;
  DELETE FROM public.purchase_items WHERE purchase_id = _purchase_id;

  UPDATE public.inventory_items i
     SET unit_cost = h.cost_per_inventory_unit,
         cost_per_recipe_unit = h.cost_per_recipe_unit,
         last_purchase_unit_cost = h.purchase_unit_cost,
         last_purchase_at = h.created_at,
         updated_at = now()
    FROM (
      SELECT DISTINCT ON (item_id) item_id, cost_per_inventory_unit,
             cost_per_recipe_unit, purchase_unit_cost, created_at
        FROM public.item_cost_history
       ORDER BY item_id, created_at DESC
    ) h
   WHERE i.id = h.item_id
     AND i.last_purchase_at IS DISTINCT FROM h.created_at;

  IF v_items IS NOT NULL THEN
    FOR r IN SELECT unnest(v_items) AS item_id LOOP
      PERFORM public.repropagate_item_cost(r.item_id);
    END LOOP;
  END IF;
END; $$;