ALTER TABLE public.report_snapshots DROP CONSTRAINT IF EXISTS report_snapshots_kind_check;
ALTER TABLE public.report_snapshots ADD CONSTRAINT report_snapshots_kind_check CHECK (kind = ANY (ARRAY['mix'::text, 'pyg'::text, 'dashboard'::text]));
CREATE INDEX IF NOT EXISTS report_snapshots_kind_period_idx ON public.report_snapshots (kind, period_from, period_to);