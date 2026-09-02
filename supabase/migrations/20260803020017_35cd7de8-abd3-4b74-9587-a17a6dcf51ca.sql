CREATE OR REPLACE FUNCTION public.protect_inventory_units()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.unit IS DISTINCT FROM OLD.unit THEN
    RAISE EXCEPTION 'La unidad de inventario no puede modificarse para proteger recetas y existencias.';
  END IF;
  IF NEW.recipe_unit IS DISTINCT FROM OLD.recipe_unit THEN
    RAISE EXCEPTION 'La unidad de receta no puede modificarse para proteger recetas y existencias.';
  END IF;
  IF NEW.inventory_to_recipe IS DISTINCT FROM OLD.inventory_to_recipe THEN
    RAISE EXCEPTION 'El factor de inventario a receta no puede modificarse una vez guardado.';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS inventory_items_protect_units ON public.inventory_items;
CREATE TRIGGER inventory_items_protect_units
BEFORE UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.protect_inventory_units();