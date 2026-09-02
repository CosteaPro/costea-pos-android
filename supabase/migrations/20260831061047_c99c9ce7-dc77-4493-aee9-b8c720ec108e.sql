-- ============================================================
-- Etapa 1 · Parte 4: funciones de negocio por empresa
-- ============================================================

-- ---------- Folio de pedido ----------
CREATE OR REPLACE FUNCTION public.next_order_folio_for(_company uuid, _branch uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(MAX(o.folio), 0) + 1
  FROM public.orders o
  WHERE o.company_id = _company
    AND (_branch IS NULL OR o.branch_id = _branch)
    AND o.created_at >= GREATEST(
      (public.ec_business_date()::timestamp AT TIME ZONE 'America/Guayaquil'),
      COALESCE((
        SELECT MAX(c.created_at) FROM public.cash_closures c
        WHERE c.closure_type = 'cierre'
          AND c.company_id = _company
          AND (_branch IS NULL OR c.branch_id = _branch)
          AND c.business_date = public.ec_business_date()
      ), '-infinity'::timestamptz)
    );
$$;

CREATE OR REPLACE FUNCTION public.next_order_folio()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.next_order_folio_for(public.default_company_id(), public.default_branch_id());
$$;

CREATE OR REPLACE FUNCTION public.set_order_folio()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.folio := public.next_order_folio_for(NEW.company_id, NEW.branch_id);
  RETURN NEW;
END; $$;

-- ---------- Numeracion SRI ----------
CREATE OR REPLACE FUNCTION public.next_invoice_sequential()
RETURNS TABLE(establishment text, emission_point text, sequential integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_est text; v_pt text; v_seq integer; v_id uuid; v_company uuid;
BEGIN
  v_company := public.default_company_id();
  SELECT c.id INTO v_id FROM public.company_settings c
   WHERE c.company_id = v_company ORDER BY c.created_at LIMIT 1;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No hay configuracion de empresa registrada';
  END IF;

  UPDATE public.company_settings c
     SET next_sequential = GREATEST(COALESCE(c.next_sequential, 1), 1) + 1,
         updated_at = now()
   WHERE c.id = v_id
  RETURNING c.establishment, c.emission_point, c.next_sequential - 1
       INTO v_est, v_pt, v_seq;

  establishment := v_est; emission_point := v_pt; sequential := v_seq;
  RETURN NEXT;
END; $$;

CREATE OR REPLACE FUNCTION public.reserve_document_sequence_block(_doc_type text, _block_size integer DEFAULT NULL)
RETURNS TABLE(doc_type text, establishment text, emission_point text, first_sequential bigint, last_sequential bigint)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_size integer; v_first bigint; v_last bigint; v_est text; v_point text; v_company uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión activa';
  END IF;

  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Tu usuario no está asignado a ninguna empresa';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('administrador'::public.app_role, 'cajero'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Solo caja o administración puede reservar numeración';
  END IF;

  IF _doc_type NOT IN ('factura','nota_debito','nota_credito') THEN
    RAISE EXCEPTION 'Este comprobante no usa bloques de numeración SRI';
  END IF;

  SELECT COALESCE(_block_size, ds.block_size), ds.establishment, ds.emission_point
    INTO v_size, v_est, v_point
    FROM public.document_sequences ds
   WHERE ds.doc_type = _doc_type AND ds.company_id = v_company
   FOR UPDATE;

  IF v_est IS NULL THEN
    RAISE EXCEPTION 'No existe configuración de numeración para el comprobante';
  END IF;
  IF v_size NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'El bloque solicitado no es válido';
  END IF;

  UPDATE public.document_sequences ds
     SET next_sequential = ds.next_sequential + v_size, updated_at = now()
   WHERE ds.doc_type = _doc_type AND ds.company_id = v_company
   RETURNING ds.next_sequential - v_size, ds.next_sequential - 1
        INTO v_first, v_last;

  doc_type := _doc_type; establishment := v_est; emission_point := v_point;
  first_sequential := v_first; last_sequential := v_last;
  RETURN NEXT;
END; $$;

-- ---------- Configuracion de empresa ----------
CREATE OR REPLACE FUNCTION public.ensure_company_settings()
RETURNS uuid LANGUAGE plpgsql SET search_path = public, private AS $$
DECLARE
  v_id uuid; v_company uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el administrador puede crear la configuración de empresa'
      USING ERRCODE = '42501';
  END IF;

  v_company := public.current_company_id();
  PERFORM pg_advisory_xact_lock(hashtext('ensure_company_settings' || COALESCE(v_company::text, '')));

  SELECT id INTO v_id FROM public.company_settings
   WHERE company_id = v_company ORDER BY created_at, id LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.company_settings (company_id) VALUES (v_company) RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END; $$;

-- ---------- Compras: historial de costos con empresa ----------
CREATE OR REPLACE FUNCTION public.apply_purchase_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_factor numeric := 1; v_rec_factor numeric := 1;
  v_qty_inv numeric; v_cost_inv numeric; v_cost_rec numeric;
  v_unit text; v_recipe_unit text; v_purchase_unit text; v_name text;
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
      company_id, branch_id, item_id, purchase_id, item_name, purchase_unit, purchase_unit_cost,
      inventory_unit, cost_per_inventory_unit, recipe_unit, cost_per_recipe_unit,
      quantity_purchase, quantity_inventory
    ) VALUES (
      NEW.company_id, NEW.branch_id, NEW.item_id, NEW.purchase_id,
      COALESCE(v_name, NEW.item_name), COALESCE(v_purchase_unit,''),
      COALESCE(NEW.unit_cost, 0), COALESCE(v_unit,''), v_cost_inv, COALESCE(v_recipe_unit,''),
      v_cost_rec, COALESCE(NEW.quantity, 0), v_qty_inv
    );

    PERFORM public.repropagate_item_cost(NEW.item_id);
  END IF;
  RETURN NEW;
END; $$;

-- ---------- Consumo por venta con empresa y sucursal ----------
CREATE OR REPLACE FUNCTION public.apply_sales_consumption(_order_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_marca text := '[ord:' || _order_id::text || ']';
  v_folio bigint; v_ref text; v_date date; v_count integer := 0;
  v_company uuid; v_branch uuid;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.inventory_movements
     WHERE movement_type = 'venta' AND reason LIKE '%' || v_marca || '%'
  ) THEN
    RETURN 0;
  END IF;

  SELECT o.folio, o.company_id, o.branch_id,
         COALESCE((o.paid_at AT TIME ZONE 'America/Guayaquil')::date,
                  (o.created_at AT TIME ZONE 'America/Guayaquil')::date)
    INTO v_folio, v_company, v_branch, v_date
    FROM public.orders o
   WHERE o.id = _order_id AND o.status = 'pagado';

  IF v_date IS NULL THEN RETURN 0; END IF;

  v_ref := CASE WHEN v_folio IS NULL THEN 'Pedido' ELSE 'Pedido #' || v_folio END;

  WITH RECURSIVE nodes AS (
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
     WHERE oi.order_id = _order_id AND oi.quantity > 0
    UNION ALL
    SELECT sub.id,
           n.factor * ri.quantity
             / CASE WHEN COALESCE(sub.yield_quantity, 0) > 0 THEN sub.yield_quantity ELSE 1 END,
           n.depth + 1
      FROM nodes n
      JOIN public.recipe_items ri ON ri.recipe_id = n.recipe_id
      JOIN public.recipes sub ON sub.id = ri.sub_recipe_id
     WHERE ri.quantity > 0 AND sub.kind <> 'subreceta' AND n.depth < 8
  ),
  needs AS (
    SELECT ri.item_id, lower(COALESCE(ri.unit, '')) AS unit, n.factor * ri.quantity AS qty
      FROM nodes n
      JOIN public.recipe_items ri ON ri.recipe_id = n.recipe_id
     WHERE ri.sub_recipe_id IS NULL AND ri.item_id IS NOT NULL AND ri.quantity > 0
    UNION ALL
    SELECT sr.inventory_item_id, lower(COALESCE(ri.unit, '')) AS unit, n.factor * ri.quantity AS qty
      FROM nodes n
      JOIN public.recipe_items ri ON ri.recipe_id = n.recipe_id AND ri.sub_recipe_id IS NOT NULL
      JOIN public.recipes sr ON sr.id = ri.sub_recipe_id
     WHERE sr.kind = 'subreceta' AND sr.inventory_item_id IS NOT NULL AND ri.quantity > 0
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
      company_id, branch_id, item_id, item_code, item_name, category, movement_type,
      business_date, quantity, unit, unit_cost, total_value, reason, created_by
    )
    SELECT v_company, v_branch, i.id, i.code, i.name, i.category,
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
END; $$;

-- ---------- Inventario: recalculo por empresa y sucursal ----------
CREATE OR REPLACE FUNCTION public.recalc_inventory_period(_from date, _to date)
RETURNS TABLE(dia date, items integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d date; v_items integer; v_hoy date := public.ec_business_date();
  v_company uuid := public.default_company_id();
  v_branch uuid := public.default_branch_id();
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.can_manage_movements(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Administrador puede recalcular el inventario.';
  END IF;

  CREATE TEMP TABLE _saldo ON COMMIT DROP AS
  SELECT i.id AS item_id,
         COALESCE(b.quantity, pc.quantity, 0)::numeric AS qty,
         0::numeric AS unit_cost
    FROM public.inventory_items i
    LEFT JOIN public.inventory_opening_balances b
           ON b.item_id = i.id AND b.business_date = _from AND b.company_id = v_company
    LEFT JOIN public.inventory_physical_counts pc
           ON pc.item_id = i.id AND pc.business_date = _from - 1 AND pc.company_id = v_company
   WHERE i.company_id = v_company;

  DELETE FROM public.inventory_opening_balances
   WHERE company_id = v_company AND business_date > _from AND business_date <= _to + 1;

  d := _from;
  WHILE d <= _to LOOP
    UPDATE _saldo s SET qty = s.qty + c.qty
      FROM (
        SELECT pi.item_id, SUM(COALESCE(pi.quantity_inventory,0)) AS qty
          FROM public.purchase_items pi
          JOIN public.purchases p ON p.id = pi.purchase_id
         WHERE pi.item_id IS NOT NULL
           AND p.company_id = v_company
           AND (p.purchased_at AT TIME ZONE 'America/Guayaquil')::date = d
         GROUP BY pi.item_id
      ) c WHERE c.item_id = s.item_id;

    UPDATE _saldo s SET qty = s.qty + m.qty
      FROM (
        SELECT im.item_id,
               SUM(public.movement_stock_delta(im.movement_type, im.quantity)) AS qty
          FROM public.inventory_movements im
         WHERE im.deleted_at IS NULL
           AND im.company_id = v_company
           AND im.business_date = d
           AND im.movement_type IN ('transferencia','entrada_produccion','venta','baja','lunch')
         GROUP BY im.item_id
      ) m WHERE m.item_id = s.item_id;

    UPDATE _saldo s SET qty = pc.quantity
      FROM public.inventory_physical_counts pc
     WHERE pc.item_id = s.item_id AND pc.business_date = d AND pc.company_id = v_company;

    UPDATE _saldo s
       SET unit_cost = COALESCE(h.cost_per_inventory_unit, i.unit_cost, 0)
      FROM public.inventory_items i
      LEFT JOIN LATERAL (
        SELECT ch.cost_per_inventory_unit
          FROM public.item_cost_history ch
         WHERE ch.item_id = i.id
           AND (ch.created_at AT TIME ZONE 'America/Guayaquil')::date <= d
         ORDER BY ch.created_at DESC LIMIT 1
      ) h ON true
     WHERE i.id = s.item_id;

    INSERT INTO public.inventory_opening_balances (company_id, branch_id, business_date, item_id, quantity, unit_cost, total_value)
    SELECT v_company, v_branch, d + 1, s.item_id, ROUND(s.qty, 6), s.unit_cost, ROUND(s.qty * s.unit_cost, 2)
      FROM _saldo s
    ON CONFLICT (company_id, branch_id, business_date, item_id) DO UPDATE
      SET quantity = EXCLUDED.quantity,
          unit_cost = EXCLUDED.unit_cost,
          total_value = EXCLUDED.total_value,
          updated_at = now();

    GET DIAGNOSTICS v_items = ROW_COUNT;
    dia := d; items := v_items; RETURN NEXT;
    d := d + 1;
  END LOOP;

  IF _to >= v_hoy THEN
    UPDATE public.inventory_items i
       SET stock = ROUND(s.qty, 6), updated_at = now()
      FROM _saldo s WHERE s.item_id = i.id;
  END IF;

  DROP TABLE IF EXISTS _saldo;
END; $$;

CREATE OR REPLACE FUNCTION public.apply_physical_count_as_opening(_business_date date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer := 0;
  v_hoy date := public.ec_business_date();
  v_company uuid := public.default_company_id();
  v_branch uuid := public.default_branch_id();
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.can_manage_movements(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Administrador puede guardar el conteo físico.';
  END IF;

  INSERT INTO public.inventory_opening_balances (company_id, branch_id, business_date, item_id, quantity, unit_cost, total_value)
  SELECT v_company, v_branch, _business_date + 1, pc.item_id, pc.quantity,
         COALESCE(h.cost_per_inventory_unit, i.unit_cost, 0),
         ROUND(pc.quantity * COALESCE(h.cost_per_inventory_unit, i.unit_cost, 0), 2)
    FROM public.inventory_physical_counts pc
    JOIN public.inventory_items i ON i.id = pc.item_id
    LEFT JOIN LATERAL (
      SELECT ch.cost_per_inventory_unit
        FROM public.item_cost_history ch
       WHERE ch.item_id = i.id
         AND (ch.created_at AT TIME ZONE 'America/Guayaquil')::date <= _business_date
       ORDER BY ch.created_at DESC LIMIT 1
    ) h ON true
   WHERE pc.business_date = _business_date AND pc.company_id = v_company
  ON CONFLICT (company_id, branch_id, business_date, item_id) DO UPDATE
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
     WHERE pc.item_id = i.id AND pc.business_date = _business_date AND pc.company_id = v_company;
  END IF;

  RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION public.close_inventory_day(_business_date date, _notes text DEFAULT NULL)
RETURNS TABLE(business_date date, items_count integer, total_value numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_next date := _business_date + 1;
  v_count integer := 0; v_total numeric := 0;
  v_company uuid := public.default_company_id();
  v_branch uuid := public.default_branch_id();
BEGIN
  IF NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Administrador puede cerrar el inventario del dia.';
  END IF;

  PERFORM public.recalc_inventory_period(_business_date, _business_date);

  SELECT COUNT(*), COALESCE(SUM(ob.total_value),0) INTO v_count, v_total
    FROM public.inventory_opening_balances ob
   WHERE ob.business_date = v_next AND ob.company_id = v_company;

  INSERT INTO public.inventory_day_closures (company_id, branch_id, business_date, items_count, total_value, notes, closed_by)
  VALUES (v_company, v_branch, _business_date, v_count, v_total, _notes, auth.uid())
  ON CONFLICT (company_id, branch_id, business_date) DO UPDATE
     SET items_count = EXCLUDED.items_count,
         total_value = EXCLUDED.total_value,
         notes = EXCLUDED.notes,
         closed_by = EXCLUDED.closed_by,
         updated_at = now();

  business_date := _business_date; items_count := v_count; total_value := v_total;
  RETURN NEXT;
END; $$;

CREATE OR REPLACE FUNCTION public.recalc_inventory_stock()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer := 0;
  v_company uuid := public.default_company_id();
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.can_manage_movements(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Administrador puede recalcular el inventario.';
  END IF;

  WITH base AS (
    SELECT DISTINCT ON (ob.item_id) ob.item_id, ob.business_date, ob.quantity
      FROM public.inventory_opening_balances ob
     WHERE ob.business_date <= public.ec_business_date() AND ob.company_id = v_company
     ORDER BY ob.item_id, ob.business_date DESC
  ),
  compras AS (
    SELECT pi.item_id, SUM(COALESCE(pi.quantity_inventory, 0)) AS qty
      FROM public.purchase_items pi
      JOIN public.purchases p ON p.id = pi.purchase_id
      LEFT JOIN base b ON b.item_id = pi.item_id
     WHERE pi.item_id IS NOT NULL AND p.company_id = v_company
       AND (b.business_date IS NULL
            OR (p.purchased_at AT TIME ZONE 'America/Guayaquil')::date >= b.business_date)
     GROUP BY pi.item_id
  ),
  movs AS (
    SELECT m.item_id, SUM(public.movement_stock_delta(m.movement_type, m.quantity)) AS qty
      FROM public.inventory_movements m
      LEFT JOIN base b ON b.item_id = m.item_id
     WHERE m.deleted_at IS NULL AND m.company_id = v_company
       AND (b.business_date IS NULL OR m.business_date >= b.business_date)
     GROUP BY m.item_id
  ),
  upd AS (
    UPDATE public.inventory_items i
       SET stock = ROUND(COALESCE(b.quantity, 0) + COALESCE(c.qty, 0) + COALESCE(mv.qty, 0), 6),
           updated_at = now()
      FROM (SELECT id FROM public.inventory_items WHERE company_id = v_company) src
      LEFT JOIN base b ON b.item_id = src.id
      LEFT JOIN compras c ON c.item_id = src.id
      LEFT JOIN movs mv ON mv.item_id = src.id
     WHERE i.id = src.id
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;

  RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION public.recalc_sales_consumption(_desde date DEFAULT NULL)
RETURNS TABLE(pedidos integer, movimientos integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pedidos integer := 0; v_movs integer := 0; r record; n integer;
  v_company uuid := public.default_company_id();
BEGIN
  IF NOT (private.has_role(auth.uid(), 'administrador'::app_role)
       OR private.has_role(auth.uid(), 'admin_operativo'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  FOR r IN
    SELECT o.id FROM public.orders o
    WHERE o.status = 'pagado' AND o.company_id = v_company
      AND (_desde IS NULL OR (o.created_at AT TIME ZONE 'America/Guayaquil')::date >= _desde)
    ORDER BY o.created_at
  LOOP
    n := public.apply_sales_consumption(r.id);
    v_pedidos := v_pedidos + 1;
    v_movs := v_movs + COALESCE(n, 0);
  END LOOP;

  RETURN QUERY SELECT v_pedidos, v_movs;
END; $$;

REVOKE EXECUTE ON FUNCTION public.next_order_folio_for(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_order_folio_for(uuid, uuid) TO authenticated;