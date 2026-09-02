-- 1) Quitar acceso de visitantes sin sesión (anon) a tablas administrativas y sensibles.
REVOKE ALL ON public.user_roles FROM anon;
REVOKE ALL ON public.purchases FROM anon;
REVOKE ALL ON public.purchase_items FROM anon;
REVOKE ALL ON public.cash_closures FROM anon;

-- 2) Ajustar privilegios de usuarios autenticados al mínimo necesario (RLS sigue aplicando).
REVOKE ALL ON public.user_roles FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

REVOKE ALL ON public.purchases FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;

REVOKE ALL ON public.purchase_items FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_items TO authenticated;
GRANT ALL ON public.purchase_items TO service_role;

REVOKE ALL ON public.cash_closures FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_closures TO authenticated;
GRANT ALL ON public.cash_closures TO service_role;

-- 3) La actualización de roles exige seguir siendo administrador también en la fila resultante.
DROP POLICY IF EXISTS roles_admin_update ON public.user_roles;
CREATE POLICY roles_admin_update ON public.user_roles
  FOR UPDATE TO authenticated
  USING (private.is_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()));

-- 4) Trazabilidad de compras: registrar siempre al usuario autenticado que las crea.
ALTER TABLE public.purchases ALTER COLUMN created_by SET DEFAULT auth.uid();