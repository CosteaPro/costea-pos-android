DROP POLICY IF EXISTS "Solo administrador gestiona movimientos" ON public.inventory_movements;

CREATE POLICY "Personal autorizado registra movimientos"
ON public.inventory_movements
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_system_owner(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('administrador'::public.app_role, 'admin_operativo'::public.app_role, 'cajero'::public.app_role)
  )
);

CREATE POLICY "Administradores consultan movimientos"
ON public.inventory_movements
FOR SELECT
TO authenticated
USING (
  public.is_system_owner(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('administrador'::public.app_role, 'admin_operativo'::public.app_role)
  )
);

CREATE POLICY "Administradores actualizan movimientos"
ON public.inventory_movements
FOR UPDATE
TO authenticated
USING (
  public.is_system_owner(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('administrador'::public.app_role, 'admin_operativo'::public.app_role)
  )
)
WITH CHECK (
  public.is_system_owner(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('administrador'::public.app_role, 'admin_operativo'::public.app_role)
  )
);

CREATE POLICY "Administradores eliminan movimientos"
ON public.inventory_movements
FOR DELETE
TO authenticated
USING (
  public.is_system_owner(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('administrador'::public.app_role, 'admin_operativo'::public.app_role)
  )
);