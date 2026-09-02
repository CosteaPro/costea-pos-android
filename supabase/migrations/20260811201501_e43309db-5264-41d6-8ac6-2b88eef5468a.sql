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
     WHERE user_id = auth.uid() AND role = 'administrador'::public.app_role
  ) THEN
    RAISE EXCEPTION 'Solo el Super Administrador / Propietario puede dar de baja comprobantes.';
  END IF;

  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'El motivo de la baja es obligatorio.';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF o.id IS NULL THEN RAISE EXCEPTION 'El comprobante no existe.'; END IF;
  IF o.doc_status = 'anulado' THEN RETURN; END IF;

  -- Revertir el consumo de inventario generado por esta venta.
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