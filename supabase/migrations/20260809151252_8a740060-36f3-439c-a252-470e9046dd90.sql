
CREATE OR REPLACE FUNCTION public.can_manage_movements(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('administrador'::public.app_role, 'admin_operativo'::public.app_role)
  )
$$;

REVOKE ALL ON FUNCTION public.can_manage_movements(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.movement_stock_delta(public.inventory_movement_type, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.edit_inventory_movement(uuid, uuid, numeric, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_inventory_movement(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_manage_movements(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.movement_stock_delta(public.inventory_movement_type, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_inventory_movement(uuid, uuid, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_inventory_movement(uuid) TO authenticated;
