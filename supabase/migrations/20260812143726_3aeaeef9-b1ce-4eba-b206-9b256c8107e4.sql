CREATE TABLE public.pl_groups (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  kind text not null default 'fijo' check (kind in ('fijo','porcentual')),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pl_groups TO authenticated;
GRANT ALL ON public.pl_groups TO service_role;

ALTER TABLE public.pl_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados administran grupos"
ON public.pl_groups FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE TRIGGER update_pl_groups_updated_at
BEFORE UPDATE ON public.pl_groups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.pl_groups (key, label, kind, sort_order) VALUES
  ('gastos', 'GASTOS GENERALES', 'fijo', 1),
  ('mano_obra', 'NÓMINA / MANO DE OBRA', 'fijo', 2),
  ('arriendos', 'ARRIENDOS', 'fijo', 3),
  ('porcentuales', 'GASTOS PORCENTUALES', 'porcentual', 4),
  ('depreciacion', 'DEPRECIACIÓN DE ACTIVOS', 'fijo', 5)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.pl_expenses
  ADD COLUMN IF NOT EXISTS base_amount numeric not null default 0,
  ADD COLUMN IF NOT EXISTS iva_rate numeric not null default 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric not null default 0;

UPDATE public.pl_expenses SET base_amount = amount WHERE base_amount = 0;