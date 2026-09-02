CREATE TABLE public.purchase_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid,
  action text NOT NULL,
  supplier_name text,
  document_number text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id uuid,
  user_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.purchase_audit_log TO authenticated;
GRANT ALL ON public.purchase_audit_log TO service_role;

ALTER TABLE public.purchase_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read purchase audit log"
  ON public.purchase_audit_log FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()));

CREATE POLICY "Admins can write purchase audit log"
  ON public.purchase_audit_log FOR INSERT TO authenticated
  WITH CHECK (private.is_admin(auth.uid()));

CREATE TRIGGER purchase_audit_log_updated_at
  BEFORE UPDATE ON public.purchase_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.revert_purchase(_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
BEGIN
  IF NOT private.is_admin(auth.uid()) THEN
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

  -- Restaura el costo del ítem a la última compra que siga vigente
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
  IF NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Administrador puede eliminar compras.';
  END IF;
  PERFORM public.revert_purchase(_purchase_id);
  DELETE FROM public.purchases WHERE id = _purchase_id;
END; $$;

REVOKE ALL ON FUNCTION public.revert_purchase(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_purchase(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revert_purchase(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_purchase(uuid) TO authenticated;