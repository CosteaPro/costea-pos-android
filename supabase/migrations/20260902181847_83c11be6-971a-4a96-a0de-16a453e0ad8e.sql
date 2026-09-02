-- 1) Permisos de escritura para el personal administrativo (el muro por empresa sigue vigente)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_snapshots TO authenticated;
GRANT ALL ON public.report_snapshots TO service_role;

DROP POLICY IF EXISTS "Admins pueden crear reportes pre-calculados" ON public.report_snapshots;
CREATE POLICY "Admins pueden crear reportes pre-calculados"
ON public.report_snapshots FOR INSERT TO authenticated
WITH CHECK (
  private.has_role(auth.uid(), 'administrador'::app_role)
  OR private.has_role(auth.uid(), 'admin_operativo'::app_role)
  OR is_system_owner(auth.uid())
);

DROP POLICY IF EXISTS "Admins pueden actualizar reportes pre-calculados" ON public.report_snapshots;
CREATE POLICY "Admins pueden actualizar reportes pre-calculados"
ON public.report_snapshots FOR UPDATE TO authenticated
USING (
  private.has_role(auth.uid(), 'administrador'::app_role)
  OR private.has_role(auth.uid(), 'admin_operativo'::app_role)
  OR is_system_owner(auth.uid())
)
WITH CHECK (
  private.has_role(auth.uid(), 'administrador'::app_role)
  OR private.has_role(auth.uid(), 'admin_operativo'::app_role)
  OR is_system_owner(auth.uid())
);

-- 2) Duplicados por sucursal nula y clave única sin ambigüedad
DELETE FROM public.report_snapshots a
USING public.report_snapshots b
WHERE a.ctid < b.ctid
  AND a.company_id IS NOT DISTINCT FROM b.company_id
  AND a.branch_id IS NOT DISTINCT FROM b.branch_id
  AND a.kind = b.kind
  AND a.scope = b.scope
  AND a.period_from = b.period_from
  AND a.period_to = b.period_to;

DROP INDEX IF EXISTS public.report_snapshots_empresa;
CREATE UNIQUE INDEX report_snapshots_empresa
  ON public.report_snapshots (company_id, branch_id, kind, scope, period_from, period_to)
  NULLS NOT DISTINCT;