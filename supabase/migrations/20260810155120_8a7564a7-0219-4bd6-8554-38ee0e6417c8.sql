-- 1) La produccion terminada SUMA; consumo y ajuste no afectan.
CREATE OR REPLACE FUNCTION public.movement_stock_delta(_type inventory_movement_type, _qty numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN _type = 'transferencia' THEN COALESCE(_qty, 0)
    WHEN _type = 'entrada_produccion' THEN ABS(COALESCE(_qty, 0))
    WHEN _type IN ('venta','baja','lunch') THEN -ABS(COALESCE(_qty, 0))
    ELSE 0
  END;
$$;

-- 2) Recalculo dia por dia de un periodo exacto.
CREATE OR REPLACE FUNCTION public.recalc_inventory_period(_from date, _to date)
RETURNS TABLE(dia date, items integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  d date;
  v_items integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.can_manage_movements(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Administrador puede recalcular el inventario.';
  END IF;

  -- Base: ultimo saldo guardado ANTES del periodo (0 si no existe).
  CREATE TEMP TABLE _saldo ON COMMIT DROP AS
  SELECT i.id AS item_id,
         COALESCE(b.quantity, 0)::numeric AS qty,
         COALESCE(i.unit_cost, 0)::numeric AS unit_cost
    FROM public.inventory_items i
    LEFT JOIN LATERAL (
      SELECT ob.quantity FROM public.inventory_opening_balances ob
       WHERE ob.item_id = i.id AND ob.business_date <= _from
       ORDER BY ob.business_date DESC LIMIT 1
    ) b ON true;

  -- Paso 1: limpiar los saldos guardados dentro del periodo (excepto el inicial).
  DELETE FROM public.inventory_opening_balances
   WHERE business_date > _from AND business_date <= _to + 1;

  d := _from;
  WHILE d <= _to LOOP
    -- compras del dia
    UPDATE _saldo s SET qty = s.qty + c.qty
      FROM (
        SELECT pi.item_id, SUM(COALESCE(pi.quantity_inventory,0)) AS qty
          FROM public.purchase_items pi
          JOIN public.purchases p ON p.id = pi.purchase_id
         WHERE pi.item_id IS NOT NULL
           AND (p.purchased_at AT TIME ZONE 'America/Guayaquil')::date = d
         GROUP BY pi.item_id
      ) c WHERE c.item_id = s.item_id;

    -- movimientos permitidos del dia
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

    -- guardar saldo de apertura del dia siguiente
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

  -- Saldo final del periodo en los items
  UPDATE public.inventory_items i
     SET stock = ROUND(s.qty, 6), updated_at = now()
    FROM _saldo s WHERE s.item_id = i.id;

  DROP TABLE IF EXISTS _saldo;
END; $$;

-- 3) Ejecutar el recalculo del periodo solicitado.
SELECT public.recalc_inventory_period('2026-08-01'::date, '2026-08-09'::date);