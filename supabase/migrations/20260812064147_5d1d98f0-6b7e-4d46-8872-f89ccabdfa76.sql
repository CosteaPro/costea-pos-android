CREATE TABLE public.pl_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id uuid REFERENCES public.pl_line_items(id) ON DELETE CASCADE,
  line_key text NOT NULL,
  label text NOT NULL,
  section text NOT NULL,
  year integer NOT NULL,
  month integer NOT NULL,
  expense_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Guayaquil')::date,
  invoice_number text NOT NULL DEFAULT '',
  supplier_name text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pl_expenses TO authenticated;
GRANT ALL ON public.pl_expenses TO service_role;

ALTER TABLE public.pl_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados gestionan gastos de finanzas"
ON public.pl_expenses FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE INDEX pl_expenses_period_idx ON public.pl_expenses (year, month);
CREATE INDEX pl_expenses_line_key_idx ON public.pl_expenses (line_key);

CREATE TRIGGER update_pl_expenses_updated_at
BEFORE UPDATE ON public.pl_expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();