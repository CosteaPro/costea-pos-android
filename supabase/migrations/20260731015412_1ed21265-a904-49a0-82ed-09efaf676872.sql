CREATE TABLE public.cash_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text NOT NULL DEFAULT '',
  shift text NOT NULL DEFAULT 'completo',
  business_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Guayaquil')::date,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  opening_float numeric NOT NULL DEFAULT 0,
  system_cash numeric NOT NULL DEFAULT 0,
  system_card numeric NOT NULL DEFAULT 0,
  system_transfer numeric NOT NULL DEFAULT 0,
  system_voucher numeric NOT NULL DEFAULT 0,
  system_other numeric NOT NULL DEFAULT 0,
  counted_cash numeric NOT NULL DEFAULT 0,
  counted_card numeric NOT NULL DEFAULT 0,
  counted_transfer numeric NOT NULL DEFAULT 0,
  counted_voucher numeric NOT NULL DEFAULT 0,
  counted_other numeric NOT NULL DEFAULT 0,
  tickets_count integer NOT NULL DEFAULT 0,
  voided_count integer NOT NULL DEFAULT 0,
  voided_total numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  iva_rate numeric NOT NULL DEFAULT 15,
  expected_total numeric NOT NULL DEFAULT 0,
  counted_total numeric NOT NULL DEFAULT 0,
  difference numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_closures TO authenticated;
GRANT ALL ON public.cash_closures TO service_role;

ALTER TABLE public.cash_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY closures_select_auth ON public.cash_closures
  FOR SELECT TO authenticated USING (true);

CREATE POLICY closures_insert_caja ON public.cash_closures
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_first(auth.uid()) OR public.has_role(auth.uid(), 'cajero'));

CREATE POLICY closures_update_caja ON public.cash_closures
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_first(auth.uid()) OR public.has_role(auth.uid(), 'cajero'))
  WITH CHECK (public.is_admin_or_first(auth.uid()) OR public.has_role(auth.uid(), 'cajero'));

CREATE POLICY closures_delete_admin ON public.cash_closures
  FOR DELETE TO authenticated USING (public.is_admin_or_first(auth.uid()));

CREATE TRIGGER update_cash_closures_updated_at
  BEFORE UPDATE ON public.cash_closures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX cash_closures_date_idx ON public.cash_closures (business_date DESC, created_at DESC);