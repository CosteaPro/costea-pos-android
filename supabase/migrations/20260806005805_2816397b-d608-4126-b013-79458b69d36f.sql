ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS inventory_items_deleted_at_idx ON public.inventory_items (deleted_at);

CREATE OR REPLACE FUNCTION public.is_system_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND is_owner AND role = 'administrador'
  );
$$;

REVOKE ALL ON FUNCTION public.is_system_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_system_owner(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.soft_delete_inventory_item(_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Propietario / Super Administrador puede eliminar items de inventario.';
  END IF;

  UPDATE public.inventory_items
     SET deleted_at = COALESCE(deleted_at, now()),
         deleted_by = auth.uid(),
         active = false,
         updated_at = now()
   WHERE id = _item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_inventory_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_inventory_item(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.restore_inventory_item(_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_system_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Propietario / Super Administrador puede restaurar items de inventario.';
  END IF;

  UPDATE public.inventory_items
     SET deleted_at = NULL, deleted_by = NULL, active = true, updated_at = now()
   WHERE id = _item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_inventory_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_inventory_item(uuid) TO authenticated, service_role;

-- El codigo de un item eliminado nunca se reutiliza: la fila permanece y el
-- generador de codigos ya verifica unicidad contra todas las filas existentes.
CREATE OR REPLACE FUNCTION public.protect_deleted_item_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.deleted_at IS NOT NULL AND NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'El codigo de un item eliminado queda bloqueado para siempre.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_items_protect_deleted_code ON public.inventory_items;
CREATE TRIGGER inventory_items_protect_deleted_code
BEFORE UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.protect_deleted_item_code();