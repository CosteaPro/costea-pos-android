CREATE TYPE public.inventory_movement_type AS ENUM ('baja','lunch','transferencia','venta','ajuste');

CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  item_code text,
  item_name text NOT NULL,
  category text,
  movement_type public.inventory_movement_type NOT NULL,
  business_date date NOT NULL DEFAULT public.ec_business_date(),
  quantity numeric NOT NULL,
  unit text NOT NULL DEFAULT 'unidad',
  unit_cost numeric NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  reason text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo administrador gestiona movimientos"
  ON public.inventory_movements FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE INDEX idx_inventory_movements_date ON public.inventory_movements (business_date);
CREATE INDEX idx_inventory_movements_item ON public.inventory_movements (item_id);

CREATE TABLE public.inventory_opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_date date NOT NULL,
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_date, item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_opening_balances TO authenticated;
GRANT ALL ON public.inventory_opening_balances TO service_role;
ALTER TABLE public.inventory_opening_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo administrador gestiona saldos iniciales"
  ON public.inventory_opening_balances FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE TABLE public.inventory_day_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_date date NOT NULL UNIQUE,
  items_count integer NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  notes text,
  closed_by uuid DEFAULT auth.uid(),
  closed_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_day_closures TO authenticated;
GRANT ALL ON public.inventory_day_closures TO service_role;
ALTER TABLE public.inventory_day_closures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo administrador gestiona cierres de inventario"
  ON public.inventory_day_closures FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.apply_inventory_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_delta numeric;
BEGIN
  NEW.total_value := ROUND(COALESCE(NEW.quantity,0) * COALESCE(NEW.unit_cost,0), 2);
  IF NEW.movement_type = 'ajuste' THEN
    v_delta := COALESCE(NEW.quantity, 0);
  ELSE
    v_delta := -ABS(COALESCE(NEW.quantity, 0));
  END IF;

  UPDATE public.inventory_items
     SET stock = COALESCE(stock, 0) + v_delta,
         updated_at = now()
   WHERE id = NEW.item_id;

  RETURN NEW;
END; $$;

CREATE TRIGGER inventory_movements_apply
BEFORE INSERT ON public.inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_inventory_movement();

CREATE TRIGGER inventory_movements_updated_at
BEFORE UPDATE ON public.inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER inventory_opening_balances_updated_at
BEFORE UPDATE ON public.inventory_opening_balances
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER inventory_day_closures_updated_at
BEFORE UPDATE ON public.inventory_day_closures
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.close_inventory_day(_business_date date, _notes text DEFAULT NULL)
RETURNS TABLE(business_date date, items_count integer, total_value numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_next date := _business_date + 1;
  v_count integer := 0;
  v_total numeric := 0;
BEGIN
  IF NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Administrador puede cerrar el inventario del dia.';
  END IF;

  INSERT INTO public.inventory_opening_balances (business_date, item_id, quantity, unit_cost, total_value)
  SELECT v_next, i.id, COALESCE(i.stock,0), COALESCE(i.unit_cost,0),
         ROUND(COALESCE(i.stock,0) * COALESCE(i.unit_cost,0), 2)
    FROM public.inventory_items i
   WHERE i.active
  ON CONFLICT (business_date, item_id) DO UPDATE
     SET quantity = EXCLUDED.quantity,
         unit_cost = EXCLUDED.unit_cost,
         total_value = EXCLUDED.total_value,
         updated_at = now();

  SELECT COUNT(*), COALESCE(SUM(total_value),0) INTO v_count, v_total
    FROM public.inventory_opening_balances WHERE inventory_opening_balances.business_date = v_next;

  INSERT INTO public.inventory_day_closures (business_date, items_count, total_value, notes, closed_by)
  VALUES (_business_date, v_count, v_total, _notes, auth.uid())
  ON CONFLICT (business_date) DO UPDATE
     SET items_count = EXCLUDED.items_count,
         total_value = EXCLUDED.total_value,
         notes = EXCLUDED.notes,
         closed_by = EXCLUDED.closed_by,
         updated_at = now();

  business_date := _business_date;
  items_count := v_count;
  total_value := v_total;
  RETURN NEXT;
END; $$;

REVOKE ALL ON FUNCTION public.close_inventory_day(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_inventory_day(date, text) TO authenticated, service_role;