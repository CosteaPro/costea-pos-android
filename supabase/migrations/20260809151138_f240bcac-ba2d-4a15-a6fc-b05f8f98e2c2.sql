
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_by_email text,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS edited_by uuid,
  ADD COLUMN IF NOT EXISTS edited_by_email text;

CREATE OR REPLACE FUNCTION public.can_manage_movements(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('administrador'::public.app_role, 'admin_operativo'::public.app_role)
  )
$$;

-- Mismo efecto en stock que aplica el trigger al insertar el movimiento.
CREATE OR REPLACE FUNCTION public.movement_stock_delta(_type public.inventory_movement_type, _qty numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE WHEN _type = 'ajuste' THEN COALESCE(_qty, 0) ELSE -ABS(COALESCE(_qty, 0)) END;
$$;

CREATE OR REPLACE FUNCTION public.edit_inventory_movement(
  _movement_id uuid,
  _item_id uuid,
  _quantity numeric,
  _business_date date,
  _reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  m public.inventory_movements%ROWTYPE;
  it public.inventory_items%ROWTYPE;
  v_email text;
BEGIN
  IF NOT public.can_manage_movements(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Administrador puede editar movimientos de inventario.';
  END IF;

  SELECT * INTO m FROM public.inventory_movements WHERE id = _movement_id;
  IF m.id IS NULL THEN RAISE EXCEPTION 'El movimiento no existe.'; END IF;
  IF m.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'El movimiento ya fue eliminado.'; END IF;
  IF m.movement_type NOT IN ('baja','lunch','transferencia') THEN
    RAISE EXCEPTION 'Los movimientos automaticos solo se corrigen desde su origen.';
  END IF;

  SELECT * INTO it FROM public.inventory_items WHERE id = _item_id;
  IF it.id IS NULL THEN RAISE EXCEPTION 'El item de inventario no existe.'; END IF;

  -- 1) deshacer el efecto anterior
  UPDATE public.inventory_items
     SET stock = COALESCE(stock,0) - public.movement_stock_delta(m.movement_type, m.quantity),
         updated_at = now()
   WHERE id = m.item_id;

  -- 2) aplicar el efecto nuevo
  UPDATE public.inventory_items
     SET stock = COALESCE(stock,0) + public.movement_stock_delta(m.movement_type, _quantity),
         updated_at = now()
   WHERE id = it.id;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  UPDATE public.inventory_movements
     SET item_id = it.id,
         item_code = it.code,
         item_name = it.name,
         category = it.category,
         unit = it.unit,
         quantity = _quantity,
         business_date = COALESCE(_business_date, m.business_date),
         reason = _reason,
         total_value = ROUND(ABS(COALESCE(_quantity,0)) * COALESCE(m.unit_cost,0), 2),
         edited_at = now(),
         edited_by = auth.uid(),
         edited_by_email = v_email,
         updated_at = now()
   WHERE id = _movement_id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_inventory_movement(_movement_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  m public.inventory_movements%ROWTYPE;
  v_email text;
BEGIN
  IF NOT public.can_manage_movements(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Administrador puede eliminar movimientos de inventario.';
  END IF;

  SELECT * INTO m FROM public.inventory_movements WHERE id = _movement_id;
  IF m.id IS NULL THEN RAISE EXCEPTION 'El movimiento no existe.'; END IF;
  IF m.deleted_at IS NOT NULL THEN RETURN; END IF;
  IF m.movement_type NOT IN ('baja','lunch','transferencia') THEN
    RAISE EXCEPTION 'Los movimientos automaticos solo se corrigen desde su origen.';
  END IF;

  UPDATE public.inventory_items
     SET stock = COALESCE(stock,0) - public.movement_stock_delta(m.movement_type, m.quantity),
         updated_at = now()
   WHERE id = m.item_id;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  UPDATE public.inventory_movements
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         deleted_by_email = v_email,
         updated_at = now()
   WHERE id = _movement_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.can_manage_movements(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.movement_stock_delta(public.inventory_movement_type, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_inventory_movement(uuid, uuid, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_inventory_movement(uuid) TO authenticated;
