CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expense_categories_admin_all" ON public.expense_categories FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER expense_categories_updated_at BEFORE UPDATE ON public.expense_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_date date NOT NULL DEFAULT public.ec_business_date(),
  category_id uuid REFERENCES public.expense_categories(id),
  category_name text NOT NULL DEFAULT 'Otros',
  supplier_id uuid REFERENCES public.suppliers(id),
  supplier_name text NOT NULL DEFAULT '',
  supplier_id_number text,
  document_number text NOT NULL DEFAULT '',
  doc_type text NOT NULL DEFAULT 'factura',
  description text NOT NULL DEFAULT '',
  base_amount numeric NOT NULL DEFAULT 0,
  iva_rate numeric NOT NULL DEFAULT 15,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'efectivo',
  due_date date,
  paid boolean NOT NULL DEFAULT true,
  paid_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses_admin_all" ON public.expenses FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER expenses_updated_at BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX expenses_business_date_idx ON public.expenses (business_date);

INSERT INTO public.expense_categories (name) VALUES
  ('Servicios Básicos'), ('Arriendos'), ('Sueldos'), ('Útiles'), ('Otros')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'efectivo',
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS credit_customer_name text,
  ADD COLUMN IF NOT EXISTS credit_customer_id text,
  ADD COLUMN IF NOT EXISTS credit_phone text,
  ADD COLUMN IF NOT EXISTS credit_due_date date,
  ADD COLUMN IF NOT EXISTS credit_status text,
  ADD COLUMN IF NOT EXISTS credit_paid_at timestamptz;