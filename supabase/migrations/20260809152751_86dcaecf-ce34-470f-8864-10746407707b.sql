-- 1) Signo real de los movimientos
CREATE OR REPLACE FUNCTION public.apply_inventory_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_delta numeric;
BEGIN
  NEW.total_value := ROUND(COALESCE(NEW.quantity,0) * COALESCE(NEW.unit_cost,0), 2);
  IF NEW.movement_type IN ('ajuste','transferencia','entrada_produccion','consumo_produccion') THEN
    v_delta := COALESCE(NEW.quantity, 0);
  ELSE
    v_delta := -ABS(COALESCE(NEW.quantity, 0));
  END IF;

  UPDATE public.inventory_items
     SET stock = COALESCE(stock, 0) + v_delta,
         updated_at = now()
   WHERE id = NEW.item_id;

  RETURN NEW;
END; $function$;

-- 2) Enlace movimiento <-> produccion
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS production_entry_id uuid;
CREATE INDEX IF NOT EXISTS inventory_movements_production_idx
  ON public.inventory_movements (production_entry_id);

-- 3) Eliminar una produccion devolviendo el inventario
CREATE OR REPLACE FUNCTION public.delete_production_entry(_entry_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_purchase uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = auth.uid()
       AND role IN ('administrador'::public.app_role, 'admin_operativo'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Solo el Administrador puede editar o eliminar producciones.';
  END IF;

  SELECT purchase_id INTO v_purchase FROM public.production_entries WHERE id = _entry_id;
  UPDATE public.production_entries SET purchase_id = NULL WHERE id = _entry_id;

  FOR r IN
    SELECT id, item_id, quantity, movement_type
      FROM public.inventory_movements
     WHERE production_entry_id = _entry_id
  LOOP
    UPDATE public.inventory_items
       SET stock = COALESCE(stock,0) - COALESCE(r.quantity,0),
           updated_at = now()
     WHERE id = r.item_id;
    DELETE FROM public.inventory_movements WHERE id = r.id;
  END LOOP;

  IF v_purchase IS NOT NULL THEN
    PERFORM public.revert_purchase(v_purchase);
    DELETE FROM public.purchases WHERE id = v_purchase;
  END IF;

  DELETE FROM public.production_entry_items WHERE entry_id = _entry_id;
  DELETE FROM public.production_entries WHERE id = _entry_id;
END; $function$;

GRANT EXECUTE ON FUNCTION public.delete_production_entry(uuid) TO authenticated;

-- 4) Enlazar consumos historicos ya registrados con su produccion
UPDATE public.inventory_movements m
   SET production_entry_id = e.id
  FROM public.production_entries e
 WHERE m.production_entry_id IS NULL
   AND m.movement_type = 'consumo_produccion'
   AND m.business_date = e.business_date
   AND m.reason LIKE '%' || e.recipe_name || '%';

-- 5) Reconvertir producciones antiguas: la compra pasa a entrada por produccion
DO $$
DECLARE
  e record;
  v_item record;
BEGIN
  FOR e IN
    SELECT * FROM public.production_entries WHERE purchase_id IS NOT NULL
  LOOP
    SELECT id, code, name, category, unit INTO v_item
      FROM public.inventory_items WHERE id = e.item_id;
    IF v_item.id IS NULL THEN CONTINUE; END IF;

    PERFORM public.revert_purchase(e.purchase_id);
    UPDATE public.production_entries SET purchase_id = NULL WHERE id = e.id;
    DELETE FROM public.purchases WHERE id = e.purchase_id;

    INSERT INTO public.inventory_movements
      (item_id, item_code, item_name, category, movement_type, business_date,
       quantity, unit, unit_cost, total_value, reason, created_by, production_entry_id)
    VALUES
      (v_item.id, v_item.code, v_item.name, v_item.category, 'entrada_produccion',
       e.business_date, ROUND(COALESCE(e.total_quantity,0), 2), COALESCE(e.unit, v_item.unit),
       ROUND(COALESCE(e.unit_cost,0), 6), ROUND(COALESCE(e.total_cost,0), 2),
       'ENTRADA POR PRODUCCIÓN · ' || e.recipe_name, e.created_by, e.id);
  END LOOP;
END $$;
