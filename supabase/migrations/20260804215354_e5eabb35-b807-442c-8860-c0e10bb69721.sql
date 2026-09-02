CREATE TABLE public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'plato',
  yield_quantity numeric NOT NULL DEFAULT 1,
  yield_unit text NOT NULL DEFAULT 'gramo',
  suggested_net_price numeric,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipes_kind_check CHECK (kind IN ('plato','subreceta'))
);
CREATE UNIQUE INDEX recipes_product_unique ON public.recipes(product_id) WHERE product_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipes TO authenticated;
GRANT ALL ON public.recipes TO service_role;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios autenticados gestionan recetas" ON public.recipes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER recipes_updated_at BEFORE UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.recipe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'item',
  item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  sub_recipe_id uuid REFERENCES public.recipes(id) ON DELETE SET NULL,
  name text NOT NULL,
  unit text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_items_source_check CHECK (source_type IN ('item','subreceta'))
);
CREATE INDEX recipe_items_recipe_idx ON public.recipe_items(recipe_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipe_items TO authenticated;
GRANT ALL ON public.recipe_items TO service_role;
ALTER TABLE public.recipe_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios autenticados gestionan ingredientes" ON public.recipe_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER recipe_items_updated_at BEFORE UPDATE ON public.recipe_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();