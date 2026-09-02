-- Endurece las funciones privilegiadas de compras: dejan de ser invocables
-- directamente por clientes autenticados; solo el backend (service_role) puede llamarlas.

CREATE OR REPLACE FUNCTION public.revert_purchase(_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
BEGIN
  -- Cuando la llamada llega con una sesión de usuario, debe ser Administrador.
  IF auth.uid() IS NOT NULL AND NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Administrador puede modificar o eliminar compras.';
  END IF;

  FOR r IN SELECT item_id, quantity_inventory FROM public.purchase_items
            WHERE purchase_id = _purchase_id AND item_id IS NOT NULL LOOP
    UPDATE public.inventory_items
       SET stock = COALESCE(stock, 0) - COALESCE(r.quantity_inventory, 0),
           updated_at = now()
     WHERE id = r.item_id;
  END LOOP;

  DELETE FROM public.item_cost_history WHERE purchase_id = _purchase_id;
  DELETE FROM public.purchase_items WHERE purchase_id = _purchase_id;

  UPDATE public.inventory_items i
     SET unit_cost = h.cost_per_inventory_unit,
         cost_per_recipe_unit = h.cost_per_recipe_unit,
         last_purchase_unit_cost = h.purchase_unit_cost,
         last_purchase_at = h.created_at,
         updated_at = now()
    FROM (
      SELECT DISTINCT ON (item_id) item_id, cost_per_inventory_unit,
             cost_per_recipe_unit, purchase_unit_cost, created_at
        FROM public.item_cost_history
       ORDER BY item_id, created_at DESC
    ) h
   WHERE i.id = h.item_id
     AND i.last_purchase_at IS DISTINCT FROM h.created_at;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_purchase(_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Administrador puede eliminar compras.';
  END IF;
  PERFORM public.revert_purchase(_purchase_id);
  DELETE FROM public.purchases WHERE id = _purchase_id;
END; $$;

REVOKE ALL ON FUNCTION public.revert_purchase(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_purchase(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revert_purchase(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_purchase(uuid) TO service_role;