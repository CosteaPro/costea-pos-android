-- 1) Tipo de categoría: menú normal, modificadores o agregadores
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'menu';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_kind_check') THEN
    ALTER TABLE public.categories
      ADD CONSTRAINT categories_kind_check CHECK (kind IN ('menu','modificador','agregador'));
  END IF;
END $$;

-- Categorías fijas, al mismo nivel que las demás del menú
INSERT INTO public.categories (name, sort_order, kind)
SELECT 'Modificadores', 900, 'modificador'
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE kind = 'modificador');

INSERT INTO public.categories (name, sort_order, kind)
SELECT 'Agregadores', 901, 'agregador'
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE kind = 'agregador');

-- 2) Opciones asociadas a cada producto del menú
CREATE TABLE IF NOT EXISTS public.product_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  option_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('modificador','agregador')),
  sort_order integer NOT NULL DEFAULT 0,
  default_selected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, option_product_id)
);

CREATE INDEX IF NOT EXISTS product_options_product_idx ON public.product_options(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_options TO authenticated;
GRANT ALL ON public.product_options TO service_role;

ALTER TABLE public.product_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_options_select_staff ON public.product_options;
CREATE POLICY product_options_select_staff ON public.product_options
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS product_options_write_admin ON public.product_options;
CREATE POLICY product_options_write_admin ON public.product_options
  FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()));

-- 3) Las líneas del pedido pueden colgar de otra línea (modificador / agregador)
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS parent_item_id uuid REFERENCES public.order_items(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS option_kind text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_option_kind_check') THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_option_kind_check
      CHECK (option_kind IS NULL OR option_kind IN ('modificador','agregador'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS order_items_parent_idx ON public.order_items(parent_item_id);