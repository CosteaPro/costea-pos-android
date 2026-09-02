DROP POLICY IF EXISTS "Usuarios autenticados gestionan el flujo de caja manual" ON public.cash_flow_manual;
CREATE POLICY "Administradores gestionan el flujo de caja manual"
ON public.cash_flow_manual FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'admin_operativo'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'admin_operativo'::app_role));

DROP POLICY IF EXISTS "Usuarios autenticados gestionan gastos de finanzas" ON public.pl_expenses;
CREATE POLICY "Administradores gestionan gastos de finanzas"
ON public.pl_expenses FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'admin_operativo'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'admin_operativo'::app_role));

DROP POLICY IF EXISTS "Usuarios autenticados gestionan rubros PyG" ON public.pl_manual_lines;
CREATE POLICY "Administradores gestionan rubros PyG"
ON public.pl_manual_lines FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'admin_operativo'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'admin_operativo'::app_role));

DROP POLICY IF EXISTS "Usuarios autenticados administran grupos" ON public.pl_groups;
CREATE POLICY "Personal consulta grupos PyG"
ON public.pl_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Administradores administran grupos PyG"
ON public.pl_groups FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'admin_operativo'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'admin_operativo'::app_role));

DROP POLICY IF EXISTS "Usuarios autenticados gestionan rubros" ON public.pl_line_items;
CREATE POLICY "Personal consulta rubros PyG"
ON public.pl_line_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Administradores administran rubros PyG"
ON public.pl_line_items FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'admin_operativo'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'admin_operativo'::app_role));

DROP POLICY IF EXISTS "Usuarios autenticados gestionan canales" ON public.sales_channels;
CREATE POLICY "Personal consulta canales de venta"
ON public.sales_channels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Administradores gestionan canales de venta"
ON public.sales_channels FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'admin_operativo'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'admin_operativo'::app_role));

DROP POLICY IF EXISTS "Usuarios autenticados gestionan precios por canal" ON public.product_channel_prices;
CREATE POLICY "Personal consulta precios por canal"
ON public.product_channel_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Administradores gestionan precios por canal"
ON public.product_channel_prices FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'admin_operativo'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'admin_operativo'::app_role));

DROP POLICY IF EXISTS "Authenticated users can read document sequences" ON public.document_sequences;
CREATE POLICY "Cajeros y administradores consultan secuencias"
ON public.document_sequences FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'admin_operativo'::app_role) OR private.has_role(auth.uid(), 'cajero'::app_role));

DROP POLICY IF EXISTS "dashboard_actions_select" ON public.dashboard_actions;
DROP POLICY IF EXISTS "dashboard_actions_insert" ON public.dashboard_actions;
DROP POLICY IF EXISTS "dashboard_actions_update" ON public.dashboard_actions;
CREATE POLICY "dashboard_actions_select_admin"
ON public.dashboard_actions FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'admin_operativo'::app_role));
CREATE POLICY "dashboard_actions_insert_admin"
ON public.dashboard_actions FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'admin_operativo'::app_role));
CREATE POLICY "dashboard_actions_update_admin"
ON public.dashboard_actions FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'admin_operativo'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'admin_operativo'::app_role));

CREATE OR REPLACE FUNCTION public.recalc_sales_consumption(_desde date DEFAULT NULL::date)
RETURNS TABLE(pedidos integer, movimientos integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedidos integer := 0;
  v_movs integer := 0;
  r record;
  n integer;
BEGIN
  IF NOT (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'admin_operativo'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  FOR r IN
    SELECT o.id FROM public.orders o
    WHERE o.status = 'pagado'
      AND (_desde IS NULL OR (o.created_at AT TIME ZONE 'America/Guayaquil')::date >= _desde)
    ORDER BY o.created_at
  LOOP
    n := public.apply_sales_consumption(r.id);
    v_pedidos := v_pedidos + 1;
    v_movs := v_movs + COALESCE(n, 0);
  END LOOP;

  RETURN QUERY SELECT v_pedidos, v_movs;
END;
$$;

REVOKE ALL ON FUNCTION public.recalc_sales_consumption(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalc_sales_consumption(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.recalc_sales_consumption(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_sales_consumption(date) TO service_role;