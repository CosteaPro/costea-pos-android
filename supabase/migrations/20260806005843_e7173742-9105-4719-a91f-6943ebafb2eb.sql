CREATE OR REPLACE FUNCTION public.soft_delete_inventory_item(_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Propietario / Super Administrador puede eliminar items de inventario.';
  END IF;

  UPDATE public.inventory_items
     SET deleted_at = COALESCE(deleted_at, now()),
         deleted_by = COALESCE(auth.uid(), deleted_by),
         active = false,
         updated_at = now()
   WHERE id = _item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_inventory_item(_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Propietario / Super Administrador puede restaurar items de inventario.';
  END IF;

  UPDATE public.inventory_items
     SET deleted_at = NULL, deleted_by = NULL, active = true, updated_at = now()
   WHERE id = _item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_inventory_item(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_inventory_item(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_inventory_item(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_inventory_item(uuid) TO service_role;