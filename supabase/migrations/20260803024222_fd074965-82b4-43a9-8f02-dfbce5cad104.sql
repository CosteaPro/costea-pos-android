-- 1) Endurecer funciones auxiliares de rol: identidad nula nunca obtiene permisos
CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'administrador'
  )
$$;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT _user_id IS NOT NULL AND _role IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id
  )
$$;

-- Las funciones internas solo se usan dentro de politicas RLS: nadie las invoca directamente
REVOKE ALL ON FUNCTION private.is_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.is_staff(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- 2) Categorias de inventario: lectura para personal autenticado, escritura solo administrador
GRANT SELECT ON public.inventory_categories TO authenticated;
GRANT ALL ON public.inventory_categories TO service_role;

DROP POLICY IF EXISTS "El personal consulta categorias de inventario" ON public.inventory_categories;
CREATE POLICY "El personal consulta categorias de inventario"
ON public.inventory_categories
FOR SELECT
TO authenticated
USING (private.is_staff(auth.uid()));