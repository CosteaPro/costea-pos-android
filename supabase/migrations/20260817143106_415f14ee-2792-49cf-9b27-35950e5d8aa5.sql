CREATE OR REPLACE FUNCTION public.void_order(_order_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  o public.orders%ROWTYPE;
  v_email text;
  v_marca text := '[ord:' || _order_id::text || ']';
  r record;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = auth.uid()
       AND role IN ('administrador'::public.app_role, 'admin_operativo'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Solo un Administrador o el Super Administrador puede anular comprobantes.';
  END IF;

  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'El motivo de la baja es obligatorio.';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF o.id IS NULL THEN RAISE EXCEPTION 'El comprobante no existe.'; END IF;
  IF o.doc_status = 'anulado' THEN RETURN; END IF;

  FOR r IN
    SELECT id, item_id, movement_type, quantity
      FROM public.inventory_movements
     WHERE movement_type = 'venta'
       AND deleted_at IS NULL
       AND reason LIKE '%' || v_marca || '%'
  LOOP
    UPDATE public.inventory_items
       SET stock = COALESCE(stock, 0) - public.movement_stock_delta(r.movement_type, r.quantity),
           updated_at = now()
     WHERE id = r.item_id;
    DELETE FROM public.inventory_movements WHERE id = r.id;
  END LOOP;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  UPDATE public.orders
     SET doc_status = 'anulado',
         void_reason = btrim(_reason),
         voided_at = now(),
         voided_by = auth.uid(),
         voided_by_email = v_email,
         updated_at = now()
   WHERE id = _order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.void_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_order(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_purchase(_purchase_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  p public.purchases%ROWTYPE;
  v_email text;
  r record;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = auth.uid()
       AND role IN ('administrador'::public.app_role, 'admin_operativo'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Solo un Administrador o el Super Administrador puede anular ordenes de compra.';
  END IF;

  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'El motivo de la anulacion es obligatorio.';
  END IF;

  SELECT * INTO p FROM public.purchases WHERE id = _purchase_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'La orden de compra no existe.'; END IF;
  IF p.status = 'anulada' THEN RETURN; END IF;

  IF p.status = 'recibida' THEN
    FOR r IN
      SELECT item_id, quantity_inventory
        FROM public.purchase_items
       WHERE purchase_id = _purchase_id AND item_id IS NOT NULL
    LOOP
      UPDATE public.inventory_items
         SET stock = COALESCE(stock, 0) - COALESCE(r.quantity_inventory, 0),
             updated_at = now()
       WHERE id = r.item_id;
    END LOOP;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  UPDATE public.purchases
     SET status = 'anulada',
         void_reason = btrim(_reason),
         voided_at = now(),
         voided_by = auth.uid(),
         voided_by_email = v_email,
         updated_at = now()
   WHERE id = _purchase_id;
END;
$$;

REVOKE ALL ON FUNCTION public.void_purchase(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_purchase(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.receive_purchase(_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = auth.uid()
       AND role IN ('administrador'::public.app_role, 'admin_operativo'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Solo un Administrador puede registrar la recepcion.';
  END IF;

  UPDATE public.purchases
     SET status = 'recibida', received_at = now(), updated_at = now()
   WHERE id = _purchase_id AND status = 'pendiente';
END;
$$;

REVOKE ALL ON FUNCTION public.void_purchase(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.receive_purchase(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase(uuid) TO authenticated;