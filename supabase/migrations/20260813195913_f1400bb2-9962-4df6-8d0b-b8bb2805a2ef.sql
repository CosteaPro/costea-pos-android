CREATE TABLE public.cash_flow_manual (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_date date NOT NULL UNIQUE,
  other_income numeric NOT NULL DEFAULT 0,
  other_expense numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_flow_manual TO authenticated;
GRANT ALL ON public.cash_flow_manual TO service_role;

ALTER TABLE public.cash_flow_manual ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados gestionan el flujo de caja manual"
ON public.cash_flow_manual FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE TRIGGER cash_flow_manual_updated_at
BEFORE UPDATE ON public.cash_flow_manual
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();