CREATE SEQUENCE IF NOT EXISTS public.recipe_code_seq;

ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS inventory_item_id uuid REFERENCES public.inventory_items(id);
CREATE UNIQUE INDEX IF NOT EXISTS recipes_code_key ON public.recipes(code);

CREATE OR REPLACE FUNCTION public.set_recipe_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prefix text;
BEGIN
  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    v_prefix := CASE WHEN NEW.kind = 'subreceta' THEN 'SR' ELSE 'RC' END;
    LOOP
      NEW.code := v_prefix || lpad(nextval('public.recipe_code_seq')::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.recipes WHERE code = NEW.code);
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS recipes_set_code ON public.recipes;
CREATE TRIGGER recipes_set_code BEFORE INSERT ON public.recipes
FOR EACH ROW EXECUTE FUNCTION public.set_recipe_code();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, kind FROM public.recipes WHERE code IS NULL ORDER BY created_at LOOP
    UPDATE public.recipes
       SET code = (CASE WHEN r.kind = 'subreceta' THEN 'SR' ELSE 'RC' END)
                  || lpad(nextval('public.recipe_code_seq')::text, 4, '0')
     WHERE id = r.id;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.production_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid REFERENCES public.recipes(id),
  recipe_code text,
  recipe_name text NOT NULL,
  item_id uuid REFERENCES public.inventory_items(id),
  purchase_id uuid REFERENCES public.purchases(id),
  business_date date NOT NULL DEFAULT public.ec_business_date(),
  batches numeric NOT NULL DEFAULT 1,
  yield_per_batch numeric NOT NULL DEFAULT 0,
  total_quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT '',
  batch_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  shift text NOT NULL DEFAULT '',
  notes text,
  created_by uuid,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_entries TO authenticated;
GRANT ALL ON public.production_entries TO service_role;
ALTER TABLE public.production_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY production_entries_admin_all ON public.production_entries
FOR ALL TO authenticated
USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE TRIGGER production_entries_updated_at BEFORE UPDATE ON public.production_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.production_entry_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.production_entries(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.inventory_items(id),
  sub_recipe_id uuid REFERENCES public.recipes(id),
  name text NOT NULL,
  unit text NOT NULL DEFAULT '',
  quantity_batch numeric NOT NULL DEFAULT 0,
  quantity_total numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_entry_items TO authenticated;
GRANT ALL ON public.production_entry_items TO service_role;
ALTER TABLE public.production_entry_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY production_entry_items_admin_all ON public.production_entry_items
FOR ALL TO authenticated
USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE TRIGGER production_entry_items_updated_at BEFORE UPDATE ON public.production_entry_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();