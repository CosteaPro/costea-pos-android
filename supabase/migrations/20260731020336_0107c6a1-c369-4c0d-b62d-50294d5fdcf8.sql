-- Helper: personal con rol asignado (o fase inicial sin administradores)
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
    OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'administrador')
  )
$$;

-- user_roles: sin escalada de privilegios y lectura acotada
DROP POLICY IF EXISTS roles_admin_insert ON public.user_roles;
CREATE POLICY roles_admin_insert ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'administrador'));
DROP POLICY IF EXISTS roles_select_auth ON public.user_roles;
CREATE POLICY roles_select_own_or_admin ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'administrador'));

-- cash_closures: solo administradores y cajeros
DROP POLICY IF EXISTS closures_select_auth ON public.cash_closures;
CREATE POLICY closures_select_caja ON public.cash_closures FOR SELECT TO authenticated
  USING (public.is_admin_or_first(auth.uid()) OR public.has_role(auth.uid(), 'cajero'));

-- orders / order_items: solo personal
DROP POLICY IF EXISTS orders_all_auth ON public.orders;
CREATE POLICY orders_staff_all ON public.orders FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS order_items_all_auth ON public.order_items;
CREATE POLICY order_items_staff_all ON public.order_items FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- catálogo y mesas: lectura personal, escritura administrador
DROP POLICY IF EXISTS categories_all_auth ON public.categories;
CREATE POLICY categories_select_staff ON public.categories FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY categories_write_admin ON public.categories FOR ALL TO authenticated
  USING (public.is_admin_or_first(auth.uid())) WITH CHECK (public.is_admin_or_first(auth.uid()));

DROP POLICY IF EXISTS products_all_auth ON public.products;
CREATE POLICY products_select_staff ON public.products FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY products_write_admin ON public.products FOR ALL TO authenticated
  USING (public.is_admin_or_first(auth.uid())) WITH CHECK (public.is_admin_or_first(auth.uid()));

DROP POLICY IF EXISTS tables_all_auth ON public.restaurant_tables;
CREATE POLICY tables_select_staff ON public.restaurant_tables FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY tables_write_admin ON public.restaurant_tables FOR ALL TO authenticated
  USING (public.is_admin_or_first(auth.uid())) WITH CHECK (public.is_admin_or_first(auth.uid()));

-- storage: imágenes de productos solo administradores escriben
DROP POLICY IF EXISTS productos_insert ON storage.objects;
DROP POLICY IF EXISTS productos_update ON storage.objects;
DROP POLICY IF EXISTS productos_delete ON storage.objects;
DROP POLICY IF EXISTS productos_select ON storage.objects;
CREATE POLICY productos_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'productos' AND public.is_staff(auth.uid()));
CREATE POLICY productos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'productos' AND public.is_admin_or_first(auth.uid()));
CREATE POLICY productos_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'productos' AND public.is_admin_or_first(auth.uid()))
  WITH CHECK (bucket_id = 'productos' AND public.is_admin_or_first(auth.uid()));
CREATE POLICY productos_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'productos' AND public.is_admin_or_first(auth.uid()));

-- numeración de facturas: solo desde el servidor
REVOKE EXECUTE ON FUNCTION public.next_invoice_sequential() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.next_invoice_sequential() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;