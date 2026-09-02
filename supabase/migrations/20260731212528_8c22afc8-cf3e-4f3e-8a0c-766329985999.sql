
-- 1. Esquema privado, fuera de la API expuesta, para las funciones de verificación de roles
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Sin cláusula de arranque: administrador solo quien tiene el rol asignado
CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'administrador')
$$;

-- Personal = usuario autenticado con algún rol asignado explícitamente
CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_staff(uuid) TO authenticated, service_role;

-- 2. Reescritura de políticas para usar las funciones privadas sin arranque implícito
DROP POLICY IF EXISTS closures_delete_admin ON public.cash_closures;
DROP POLICY IF EXISTS closures_insert_caja ON public.cash_closures;
DROP POLICY IF EXISTS closures_select_caja ON public.cash_closures;
DROP POLICY IF EXISTS closures_update_caja ON public.cash_closures;
CREATE POLICY closures_delete_admin ON public.cash_closures FOR DELETE TO authenticated
  USING (private.is_admin(auth.uid()));
CREATE POLICY closures_insert_caja ON public.cash_closures FOR INSERT TO authenticated
  WITH CHECK (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'cajero'));
CREATE POLICY closures_select_caja ON public.cash_closures FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'cajero'));
CREATE POLICY closures_update_caja ON public.cash_closures FOR UPDATE TO authenticated
  USING (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'cajero'))
  WITH CHECK (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'cajero'));

DROP POLICY IF EXISTS categories_select_staff ON public.categories;
DROP POLICY IF EXISTS categories_write_admin ON public.categories;
CREATE POLICY categories_select_staff ON public.categories FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY categories_write_admin ON public.categories FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS company_admin_insert ON public.company_settings;
DROP POLICY IF EXISTS company_admin_update ON public.company_settings;
CREATE POLICY company_admin_insert ON public.company_settings FOR INSERT TO authenticated
  WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY company_admin_update ON public.company_settings FOR UPDATE TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS signature_admin_delete ON public.company_signature;
DROP POLICY IF EXISTS signature_admin_insert ON public.company_signature;
DROP POLICY IF EXISTS signature_admin_select ON public.company_signature;
DROP POLICY IF EXISTS signature_admin_update ON public.company_signature;
CREATE POLICY signature_admin_delete ON public.company_signature FOR DELETE TO authenticated
  USING (private.is_admin(auth.uid()));
CREATE POLICY signature_admin_insert ON public.company_signature FOR INSERT TO authenticated
  WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY signature_admin_select ON public.company_signature FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()));
CREATE POLICY signature_admin_update ON public.company_signature FOR UPDATE TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS customers_select_staff ON public.customers;
DROP POLICY IF EXISTS customers_write_admin ON public.customers;
-- Los datos personales solo son visibles para quienes facturan: administrador y cajero
CREATE POLICY customers_select_caja ON public.customers FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'cajero'));
CREATE POLICY customers_insert_caja ON public.customers FOR INSERT TO authenticated
  WITH CHECK (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'cajero'));
CREATE POLICY customers_update_caja ON public.customers FOR UPDATE TO authenticated
  USING (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'cajero'))
  WITH CHECK (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'cajero'));
CREATE POLICY customers_delete_admin ON public.customers FOR DELETE TO authenticated
  USING (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS order_items_staff_all ON public.order_items;
CREATE POLICY order_items_staff_all ON public.order_items FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS orders_staff_all ON public.orders;
CREATE POLICY orders_staff_all ON public.orders FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS products_select_staff ON public.products;
DROP POLICY IF EXISTS products_write_admin ON public.products;
CREATE POLICY products_select_staff ON public.products FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY products_write_admin ON public.products FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS tables_select_staff ON public.restaurant_tables;
DROP POLICY IF EXISTS tables_write_admin ON public.restaurant_tables;
CREATE POLICY tables_select_staff ON public.restaurant_tables FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY tables_write_admin ON public.restaurant_tables FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS roles_admin_delete ON public.user_roles;
DROP POLICY IF EXISTS roles_admin_insert ON public.user_roles;
DROP POLICY IF EXISTS roles_admin_update ON public.user_roles;
DROP POLICY IF EXISTS roles_select_own_or_admin ON public.user_roles;
CREATE POLICY roles_admin_delete ON public.user_roles FOR DELETE TO authenticated
  USING (private.is_admin(auth.uid()));
CREATE POLICY roles_admin_insert ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (private.is_admin(auth.uid()));
CREATE POLICY roles_admin_update ON public.user_roles FOR UPDATE TO authenticated
  USING (private.is_admin(auth.uid()));
CREATE POLICY roles_select_own_or_admin ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_admin(auth.uid()));

-- 3. Archivos: firmas y fotos de productos
DROP POLICY IF EXISTS firmas_admin_all ON storage.objects;
DROP POLICY IF EXISTS productos_select ON storage.objects;
DROP POLICY IF EXISTS productos_insert ON storage.objects;
DROP POLICY IF EXISTS productos_update ON storage.objects;
DROP POLICY IF EXISTS productos_delete ON storage.objects;
CREATE POLICY firmas_admin_all ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'firmas' AND private.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'firmas' AND private.is_admin(auth.uid()));
CREATE POLICY productos_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'productos' AND private.is_staff(auth.uid()));
CREATE POLICY productos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'productos' AND private.is_admin(auth.uid()));
CREATE POLICY productos_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'productos' AND private.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'productos' AND private.is_admin(auth.uid()));
CREATE POLICY productos_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'productos' AND private.is_admin(auth.uid()));

-- 4. Eliminación de las funciones públicas con arranque implícito
DROP FUNCTION IF EXISTS public.is_admin_or_first(uuid);
DROP FUNCTION IF EXISTS public.is_staff(uuid);
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

-- 5. La contraseña de la firma .p12 deja de ser legible desde la aplicación
REVOKE SELECT ON public.company_signature FROM authenticated;
GRANT SELECT (id, p12_path, created_at, updated_at) ON public.company_signature TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.company_signature TO authenticated;
GRANT ALL ON public.company_signature TO service_role;
