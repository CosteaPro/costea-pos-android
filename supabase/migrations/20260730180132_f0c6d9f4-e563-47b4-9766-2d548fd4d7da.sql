-- Roles
CREATE TYPE public.app_role AS ENUM ('administrador','cajero','mesero');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_first(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id,'administrador')
      OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'administrador')
$$;

CREATE POLICY "roles_select_auth" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles_admin_insert" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_first(auth.uid()));
CREATE POLICY "roles_admin_update" ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'administrador'));
CREATE POLICY "roles_admin_delete" ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'administrador'));

-- Configuracion de empresa (fila unica)
CREATE TABLE public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL DEFAULT '',
  trade_name text NOT NULL DEFAULT '',
  ruc text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  tax_regime text NOT NULL DEFAULT 'RIMPE Emprendedor',
  special_taxpayer text,
  accounting_required boolean NOT NULL DEFAULT false,
  establishment text NOT NULL DEFAULT '001',
  emission_point text NOT NULL DEFAULT '001',
  next_sequential integer NOT NULL DEFAULT 1,
  environment text NOT NULL DEFAULT '1',
  emission_type text NOT NULL DEFAULT '1',
  iva_rate numeric NOT NULL DEFAULT 15,
  service_charge_rate numeric NOT NULL DEFAULT 0,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_select_auth" ON public.company_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "company_admin_insert" ON public.company_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_first(auth.uid()));
CREATE POLICY "company_admin_update" ON public.company_settings FOR UPDATE TO authenticated
  USING (public.is_admin_or_first(auth.uid())) WITH CHECK (public.is_admin_or_first(auth.uid()));

CREATE TRIGGER company_settings_updated_at BEFORE UPDATE ON public.company_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.company_settings (business_name, trade_name) VALUES ('', 'Costea POS');

-- Productos
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS image_url text;

-- Ventas
CREATE TYPE public.doc_type AS ENUM ('factura','nota_venta');

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS doc_type public.doc_type NOT NULL DEFAULT 'nota_venta',
  ADD COLUMN IF NOT EXISTS sales_channel text NOT NULL DEFAULT 'salon',
  ADD COLUMN IF NOT EXISTS customer_id_type text,
  ADD COLUMN IF NOT EXISTS customer_id_number text,
  ADD COLUMN IF NOT EXISTS customer_address text,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS access_key text,
  ADD COLUMN IF NOT EXISTS doc_number text,
  ADD COLUMN IF NOT EXISTS iva_rate numeric NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS tax_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_in_words text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_doc_number_key ON public.orders (doc_number) WHERE doc_number IS NOT NULL;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 15;

-- Secuencial atomico para facturas SRI
CREATE OR REPLACE FUNCTION public.next_invoice_sequential()
RETURNS TABLE (establishment text, emission_point text, sequential integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  UPDATE public.company_settings c
     SET next_sequential = c.next_sequential + 1
   WHERE c.id = (SELECT id FROM public.company_settings ORDER BY created_at LIMIT 1)
  RETURNING c.establishment, c.emission_point, c.next_sequential - 1 INTO r;
  establishment := r.establishment; emission_point := r.emission_point; sequential := r.sequential;
  RETURN NEXT;
END; $$;