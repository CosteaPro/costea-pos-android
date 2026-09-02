CREATE TABLE public.inventory_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_categories TO authenticated;
GRANT ALL ON public.inventory_categories TO service_role;

ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo administradores gestionan categorias de inventario"
ON public.inventory_categories FOR ALL TO authenticated
USING (private.is_admin(auth.uid()))
WITH CHECK (private.is_admin(auth.uid()));

CREATE TRIGGER inventory_categories_updated_at
BEFORE UPDATE ON public.inventory_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.inventory_categories(id),
  ADD COLUMN IF NOT EXISTS tax_treatment text NOT NULL DEFAULT 'grava15';

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS tax_base numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS tax_treatment text NOT NULL DEFAULT 'grava15',
  ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric NOT NULL DEFAULT 0;