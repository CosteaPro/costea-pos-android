CREATE TABLE public.sales_channels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  value text NOT NULL UNIQUE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_channels TO authenticated;
GRANT ALL ON public.sales_channels TO service_role;
ALTER TABLE public.sales_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios autenticados gestionan canales" ON public.sales_channels FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_sales_channels_updated_at BEFORE UPDATE ON public.sales_channels
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.sales_channels (value, label, sort_order) VALUES
  ('salon', 'Salón', 1),
  ('llevar', 'Para llevar', 2),
  ('domicilio', 'Domicilio', 3),
  ('rappi', 'Rappi', 4),
  ('pedidosya', 'PedidosYa', 5),
  ('ubereats', 'Uber Eats', 6),
  ('otro', 'Otro', 7);

CREATE TABLE public.product_channel_prices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  channel_value text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, channel_value)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_channel_prices TO authenticated;
GRANT ALL ON public.product_channel_prices TO service_role;
ALTER TABLE public.product_channel_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios autenticados gestionan precios por canal" ON public.product_channel_prices FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_product_channel_prices_updated_at BEFORE UPDATE ON public.product_channel_prices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_product_channel_prices_product ON public.product_channel_prices(product_id);