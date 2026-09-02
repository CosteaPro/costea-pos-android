ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS purchase_unit text NOT NULL DEFAULT 'unidad',
  ADD COLUMN IF NOT EXISTS purchase_to_inventory numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recipe_unit text NOT NULL DEFAULT 'unidad',
  ADD COLUMN IF NOT EXISTS inventory_to_recipe numeric NOT NULL DEFAULT 1;

UPDATE public.inventory_items
   SET purchase_unit = COALESCE(NULLIF(purchase_unit,''), unit),
       recipe_unit = COALESCE(NULLIF(recipe_unit,''), unit);

ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS quantity_inventory numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_cost_inventory numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.apply_purchase_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_factor numeric := 1;
  v_qty_inv numeric;
  v_cost_inv numeric;
BEGIN
  IF NEW.item_id IS NOT NULL THEN
    SELECT GREATEST(COALESCE(purchase_to_inventory, 1), 0.000001)
      INTO v_factor FROM public.inventory_items WHERE id = NEW.item_id;

    v_qty_inv := COALESCE(NEW.quantity, 0) * v_factor;
    v_cost_inv := CASE WHEN v_factor = 0 THEN COALESCE(NEW.unit_cost, 0)
                       ELSE COALESCE(NEW.unit_cost, 0) / v_factor END;

    NEW.quantity_inventory := v_qty_inv;
    NEW.unit_cost_inventory := v_cost_inv;

    UPDATE public.inventory_items
       SET stock = COALESCE(stock, 0) + v_qty_inv,
           unit_cost = v_cost_inv,
           updated_at = now()
     WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS purchase_items_apply_stock ON public.purchase_items;
CREATE TRIGGER purchase_items_apply_stock
BEFORE INSERT ON public.purchase_items
FOR EACH ROW EXECUTE FUNCTION public.apply_purchase_stock();

CREATE OR REPLACE FUNCTION public.consume_inventory_recipe(_item_id uuid, _qty_recipe numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_factor numeric;
  v_new numeric;
BEGIN
  IF NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Administrador puede descontar inventario.';
  END IF;

  SELECT GREATEST(COALESCE(inventory_to_recipe, 1), 0.000001)
    INTO v_factor FROM public.inventory_items WHERE id = _item_id;
  IF v_factor IS NULL THEN
    RAISE EXCEPTION 'Item de inventario no encontrado';
  END IF;

  UPDATE public.inventory_items
     SET stock = COALESCE(stock, 0) - (COALESCE(_qty_recipe, 0) / v_factor),
         updated_at = now()
   WHERE id = _item_id
  RETURNING stock INTO v_new;

  RETURN v_new;
END; $function$;

GRANT EXECUTE ON FUNCTION public.consume_inventory_recipe(uuid, numeric) TO authenticated;