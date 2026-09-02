DO $link_closed_recipe$
DECLARE
  v_recipe_id uuid := 'b14aa475-9103-4d9d-9b0b-c9f72c76a6f2'::uuid;
  v_item_id uuid;
  v_name text;
  v_cost numeric;
BEGIN
  SELECT r.name, COALESCE(SUM(ri.subtotal), 0)
    INTO v_name, v_cost
    FROM public.recipes r
    LEFT JOIN public.recipe_items ri ON ri.recipe_id = r.id
   WHERE r.id = v_recipe_id
   GROUP BY r.id, r.name;

  SELECT r.inventory_item_id
    INTO v_item_id
    FROM public.recipes r
   WHERE r.id = v_recipe_id;

  IF v_item_id IS NULL THEN
    INSERT INTO public.inventory_items (
      name, category, unit, min_stock, stock, unit_cost, active,
      purchase_unit, purchase_to_inventory, recipe_unit, inventory_to_recipe,
      category_id, tax_treatment, cost_per_recipe_unit, notes
    )
    VALUES (
      v_name, 'Producción', 'unidad', 0, 0, v_cost, true,
      'unidad', 1, 'unidad', 1,
      NULL, 'grava15', v_cost,
      'Producto terminado cerrado vinculado a receta usada como subreceta.'
    )
    RETURNING id INTO v_item_id;

    UPDATE public.recipes
       SET inventory_item_id = v_item_id,
           updated_at = now()
     WHERE id = v_recipe_id;
  END IF;
END;
$link_closed_recipe$;

DO $rebuild_closed_sales$
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
$rebuild_closed_sales$;