CREATE TABLE public.report_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('mix','pyg')),
  scope text NOT NULL CHECK (scope IN ('dia','mes_a_fecha')),
  business_date date NOT NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, scope, period_from, period_to)
);

CREATE INDEX idx_report_snapshots_kind_to ON public.report_snapshots (kind, scope, period_to DESC);

GRANT SELECT ON public.report_snapshots TO authenticated;
GRANT ALL ON public.report_snapshots TO service_role;

ALTER TABLE public.report_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins pueden leer reportes pre-calculados"
ON public.report_snapshots FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'administrador'::public.app_role)
  OR private.has_role(auth.uid(), 'admin_operativo'::public.app_role)
  OR public.is_system_owner(auth.uid())
);

CREATE TRIGGER update_report_snapshots_updated_at
BEFORE UPDATE ON public.report_snapshots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();