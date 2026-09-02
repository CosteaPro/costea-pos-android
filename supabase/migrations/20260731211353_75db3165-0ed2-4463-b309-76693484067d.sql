ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS branch_address text NOT NULL DEFAULT '';

UPDATE public.company_settings SET establishment = '002', emission_point = '001', next_sequential = 6270;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS authorization_number text,
  ADD COLUMN IF NOT EXISTS doc_status text NOT NULL DEFAULT 'emitido',
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS voided_by_email text;

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_type text NOT NULL DEFAULT 'cedula',
  id_number text NOT NULL,
  name text NOT NULL,
  address text,
  email text,
  phone text,
  notes text,
  privacy_accepted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY customers_select_staff ON public.customers FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY customers_write_admin ON public.customers FOR ALL TO authenticated USING (public.is_admin_or_first(auth.uid())) WITH CHECK (public.is_admin_or_first(auth.uid()));

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();