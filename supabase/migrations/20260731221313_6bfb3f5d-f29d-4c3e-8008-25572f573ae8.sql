-- 1) company_settings: solo personal con rol puede leer
DROP POLICY IF EXISTS company_select_auth ON public.company_settings;
CREATE POLICY company_select_staff ON public.company_settings
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));

-- 2) orders / order_items: eliminar solo administradores
DROP POLICY IF EXISTS orders_staff_all ON public.orders;
CREATE POLICY orders_select_staff ON public.orders
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY orders_insert_staff ON public.orders
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY orders_update_staff ON public.orders
  FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY orders_delete_admin ON public.orders
  FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS order_items_staff_all ON public.order_items;
CREATE POLICY order_items_select_staff ON public.order_items
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY order_items_insert_staff ON public.order_items
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY order_items_update_staff ON public.order_items
  FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY order_items_delete_staff ON public.order_items
  FOR DELETE TO authenticated
  USING (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'cajero'::app_role) OR private.has_role(auth.uid(), 'mesero'::app_role));