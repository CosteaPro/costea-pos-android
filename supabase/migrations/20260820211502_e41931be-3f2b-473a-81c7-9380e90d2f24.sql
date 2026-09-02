CREATE TABLE public.product_recipe_variants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (product_id, recipe_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_recipe_variants TO authenticated;
GRANT ALL ON public.product_recipe_variants TO service_role;

ALTER TABLE public.product_recipe_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal consulta variantes"
  ON public.product_recipe_variants FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE POLICY "Solo administradores gestionan variantes"
  ON public.product_recipe_variants FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()));

CREATE TRIGGER update_product_recipe_variants_updated_at
  BEFORE UPDATE ON public.product_recipe_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_product_recipe_variants_product ON public.product_recipe_variants(product_id);