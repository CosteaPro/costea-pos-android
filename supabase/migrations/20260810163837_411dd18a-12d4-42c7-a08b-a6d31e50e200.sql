CREATE OR REPLACE FUNCTION public.apply_physical_count_as_opening(_business_date date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
  v_hoy date := public.ec_business_date();
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.can_manage_movements(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Administrador puede guardar el conteo físico.';
  END IF;

  INSERT INTO public.inventory_opening_balances (business_date, item_id, quantity, unit_cost, total_value)
  SELECT _business_date + 1, pc.item_id, pc.quantity, COALESCE(i.unit_cost, 0),
         ROUND(pc.quantity * COALESCE(i.unit_cost, 0), 2)
    FROM public.inventory_physical_counts pc
    JOIN public.inventory_items i ON i.id = pc.item_id
   WHERE pc.business_date = _business_date
  ON CONFLICT (business_date, item_id) DO UPDATE
    SET quantity = EXCLUDED.quantity,
        unit_cost = EXCLUDED.unit_cost,
        total_value = EXCLUDED.total_value,
        updated_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_hoy > _business_date + 1 THEN
    PERFORM public.recalc_inventory_period(_business_date + 1, v_hoy);
  ELSE
    UPDATE public.inventory_items i
       SET stock = ob.quantity, updated_at = now()
      FROM public.inventory_opening_balances ob
     WHERE ob.item_id = i.id AND ob.business_date = _business_date + 1;
  END IF;

  RETURN v_count;
END;
$$;