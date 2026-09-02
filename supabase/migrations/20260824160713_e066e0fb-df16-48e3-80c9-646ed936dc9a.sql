CREATE OR REPLACE FUNCTION public.recalc_inventory_period(_from date, _to date)
 RETURNS TABLE(dia date, items integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d date;
  v_items integer;
  v_hoy date := public.ec_business_date();
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.can_manage_movements(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Administrador puede recalcular el inventario.';
  END IF;

  -- Saldo de partida: SOLO la fecha exacta _from. Si no existe, el conteo
  -- fisico del dia anterior. Si tampoco existe, cero.
  CREATE TEMP TABLE _saldo ON COMMIT DROP AS
  SELECT i.id AS item_id,
         COALESCE(b.quantity, pc.quantity, 0)::numeric AS qty,
         0::numeric AS unit_cost
    FROM public.inventory_items i
    LEFT JOIN public.inventory_opening_balances b
           ON b.item_id = i.id AND b.business_date = _from
    LEFT JOIN public.inventory_physical_counts pc
           ON pc.item_id = i.id AND pc.business_date = _from - 1;

  DELETE FROM public.inventory_opening_balances
   WHERE business_date > _from AND business_date <= _to + 1;

  d := _from;
  WHILE d <= _to LOOP
    UPDATE _saldo s SET qty = s.qty + c.qty
      FROM (
        SELECT pi.item_id, SUM(COALESCE(pi.quantity_inventory,0)) AS qty
          FROM public.purchase_items pi
          JOIN public.purchases p ON p.id = pi.purchase_id
         WHERE pi.item_id IS NOT NULL
           AND (p.purchased_at AT TIME ZONE 'America/Guayaquil')::date = d
         GROUP BY pi.item_id
      ) c WHERE c.item_id = s.item_id;

    UPDATE _saldo s SET qty = s.qty + m.qty
      FROM (
        SELECT im.item_id,
               SUM(public.movement_stock_delta(im.movement_type, im.quantity)) AS qty
          FROM public.inventory_movements im
         WHERE im.deleted_at IS NULL
           AND im.business_date = d
           AND im.movement_type IN ('transferencia','entrada_produccion','venta','baja','lunch')
         GROUP BY im.item_id
      ) m WHERE m.item_id = s.item_id;

    -- EL FISICO MANDA: si hay conteo guardado ese dia, esa cantidad es el saldo final del dia
    UPDATE _saldo s SET qty = pc.quantity
      FROM public.inventory_physical_counts pc
     WHERE pc.item_id = s.item_id AND pc.business_date = d;

    -- Costo vigente A ESA FECHA (congela el valor historico)
    UPDATE _saldo s
       SET unit_cost = COALESCE(h.cost_per_inventory_unit, i.unit_cost, 0)
      FROM public.inventory_items i
      LEFT JOIN LATERAL (
        SELECT ch.cost_per_inventory_unit
          FROM public.item_cost_history ch
         WHERE ch.item_id = i.id
           AND (ch.created_at AT TIME ZONE 'America/Guayaquil')::date <= d
         ORDER BY ch.created_at DESC
         LIMIT 1
      ) h ON true
     WHERE i.id = s.item_id;

    INSERT INTO public.inventory_opening_balances (business_date, item_id, quantity, unit_cost, total_value)
    SELECT d + 1, s.item_id, ROUND(s.qty, 6), s.unit_cost, ROUND(s.qty * s.unit_cost, 2)
      FROM _saldo s
    ON CONFLICT (business_date, item_id) DO UPDATE
      SET quantity = EXCLUDED.quantity,
          unit_cost = EXCLUDED.unit_cost,
          total_value = EXCLUDED.total_value,
          updated_at = now();

    GET DIAGNOSTICS v_items = ROW_COUNT;
    dia := d; items := v_items; RETURN NEXT;
    d := d + 1;
  END LOOP;

  -- El stock actual solo se toca si el recalculo llego hasta hoy.
  IF _to >= v_hoy THEN
    UPDATE public.inventory_items i
       SET stock = ROUND(s.qty, 6), updated_at = now()
      FROM _saldo s WHERE s.item_id = i.id;
  END IF;

  DROP TABLE IF EXISTS _saldo;
END; $function$;

CREATE OR REPLACE FUNCTION public.close_inventory_day(_business_date date, _notes text DEFAULT NULL::text)
 RETURNS TABLE(business_date date, items_count integer, total_value numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_next date := _business_date + 1;
  v_count integer := 0;
  v_total numeric := 0;
BEGIN
  IF NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Administrador puede cerrar el inventario del dia.';
  END IF;

  -- El cierre real del dia se calcula: inicial del dia + movimientos del dia.
  PERFORM public.recalc_inventory_period(_business_date, _business_date);

  SELECT COUNT(*), COALESCE(SUM(ob.total_value),0) INTO v_count, v_total
    FROM public.inventory_opening_balances ob
   WHERE ob.business_date = v_next;

  INSERT INTO public.inventory_day_closures (business_date, items_count, total_value, notes, closed_by)
  VALUES (_business_date, v_count, v_total, _notes, auth.uid())
  ON CONFLICT (business_date) DO UPDATE
     SET items_count = EXCLUDED.items_count,
         total_value = EXCLUDED.total_value,
         notes = EXCLUDED.notes,
         closed_by = EXCLUDED.closed_by,
         updated_at = now();

  business_date := _business_date;
  items_count := v_count;
  total_value := v_total;
  RETURN NEXT;
END; $function$;

CREATE OR REPLACE FUNCTION public.apply_physical_count_as_opening(_business_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  v_hoy date := public.ec_business_date();
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.can_manage_movements(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Administrador puede guardar el conteo físico.';
  END IF;

  -- El saldo inicial del dia siguiente es EXACTAMENTE la cantidad contada,
  -- valorada al costo vigente a la fecha del conteo.
  INSERT INTO public.inventory_opening_balances (business_date, item_id, quantity, unit_cost, total_value)
  SELECT _business_date + 1, pc.item_id, pc.quantity,
         COALESCE(h.cost_per_inventory_unit, i.unit_cost, 0),
         ROUND(pc.quantity * COALESCE(h.cost_per_inventory_unit, i.unit_cost, 0), 2)
    FROM public.inventory_physical_counts pc
    JOIN public.inventory_items i ON i.id = pc.item_id
    LEFT JOIN LATERAL (
      SELECT ch.cost_per_inventory_unit
        FROM public.item_cost_history ch
       WHERE ch.item_id = i.id
         AND (ch.created_at AT TIME ZONE 'America/Guayaquil')::date <= _business_date
       ORDER BY ch.created_at DESC
       LIMIT 1
    ) h ON true
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
       SET stock = pc.quantity, updated_at = now()
      FROM public.inventory_physical_counts pc
     WHERE pc.item_id = i.id AND pc.business_date = _business_date;
  END IF;

  RETURN v_count;
END;
$function$;