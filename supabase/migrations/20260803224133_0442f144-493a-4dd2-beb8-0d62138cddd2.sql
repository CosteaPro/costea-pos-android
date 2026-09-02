CREATE TABLE IF NOT EXISTS public.measurement_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'compra',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.measurement_units TO authenticated;
GRANT ALL ON public.measurement_units TO service_role;
ALTER TABLE public.measurement_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "measurement_units_select" ON public.measurement_units FOR SELECT TO authenticated USING (true);
CREATE POLICY "measurement_units_write" ON public.measurement_units FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE TRIGGER measurement_units_updated_at BEFORE UPDATE ON public.measurement_units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.measurement_units (name, kind) VALUES
  ('unidad','compra'),('caja','compra'),('paquete','compra'),('funda','compra'),('saco','compra'),
  ('quintal','compra'),('kilo','compra'),('libra','compra'),('gramo','compra'),('litro','compra'),
  ('mililitro','compra'),('galon','compra'),('onza','compra'),('docena','compra'),('bandeja','compra'),
  ('botella','compra'),('lata','compra'),('metro','compra')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS cost_per_recipe_unit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_purchase_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_purchase_unit_cost numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.item_cost_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  purchase_id uuid REFERENCES public.purchases(id) ON DELETE SET NULL,
  item_name text NOT NULL DEFAULT '',
  purchase_unit text NOT NULL DEFAULT '',
  purchase_unit_cost numeric NOT NULL DEFAULT 0,
  inventory_unit text NOT NULL DEFAULT '',
  cost_per_inventory_unit numeric NOT NULL DEFAULT 0,
  recipe_unit text NOT NULL DEFAULT '',
  cost_per_recipe_unit numeric NOT NULL DEFAULT 0,
  quantity_purchase numeric NOT NULL DEFAULT 0,
  quantity_inventory numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_cost_history TO authenticated;
GRANT ALL ON public.item_cost_history TO service_role;
ALTER TABLE public.item_cost_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "item_cost_history_select" ON public.item_cost_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "item_cost_history_write" ON public.item_cost_history FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS item_cost_history_item_idx ON public.item_cost_history (item_id, created_at DESC);
CREATE TRIGGER item_cost_history_updated_at BEFORE UPDATE ON public.item_cost_history
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.apply_purchase_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_factor numeric := 1;
  v_rec_factor numeric := 1;
  v_qty_inv numeric;
  v_cost_inv numeric;
  v_cost_rec numeric;
  v_unit text;
  v_recipe_unit text;
  v_purchase_unit text;
  v_name text;
BEGIN
  IF NEW.item_id IS NOT NULL THEN
    SELECT GREATEST(COALESCE(purchase_to_inventory, 1), 0.000001),
           GREATEST(COALESCE(inventory_to_recipe, 1), 0.000001),
           unit, recipe_unit, purchase_unit, name
      INTO v_factor, v_rec_factor, v_unit, v_recipe_unit, v_purchase_unit, v_name
      FROM public.inventory_items WHERE id = NEW.item_id;

    v_qty_inv := COALESCE(NEW.quantity, 0) * v_factor;
    v_cost_inv := COALESCE(NEW.unit_cost, 0) / v_factor;
    v_cost_rec := v_cost_inv / v_rec_factor;

    NEW.quantity_inventory := v_qty_inv;
    NEW.unit_cost_inventory := v_cost_inv;

    UPDATE public.inventory_items
       SET stock = COALESCE(stock, 0) + v_qty_inv,
           unit_cost = v_cost_inv,
           cost_per_recipe_unit = v_cost_rec,
           last_purchase_unit_cost = COALESCE(NEW.unit_cost, 0),
           last_purchase_at = now(),
           updated_at = now()
     WHERE id = NEW.item_id;

    INSERT INTO public.item_cost_history (
      item_id, purchase_id, item_name, purchase_unit, purchase_unit_cost,
      inventory_unit, cost_per_inventory_unit, recipe_unit, cost_per_recipe_unit,
      quantity_purchase, quantity_inventory
    ) VALUES (
      NEW.item_id, NEW.purchase_id, COALESCE(v_name, NEW.item_name), COALESCE(v_purchase_unit,''),
      COALESCE(NEW.unit_cost, 0), COALESCE(v_unit,''), v_cost_inv, COALESCE(v_recipe_unit,''),
      v_cost_rec, COALESCE(NEW.quantity, 0), v_qty_inv
    );
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.protect_inventory_units()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.unit IS DISTINCT FROM OLD.unit
      OR NEW.recipe_unit IS DISTINCT FROM OLD.recipe_unit
      OR NEW.inventory_to_recipe IS DISTINCT FROM OLD.inventory_to_recipe)
     AND NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Administrador puede modificar las unidades y conversiones del item.';
  END IF;
  RETURN NEW;
END; $function$;