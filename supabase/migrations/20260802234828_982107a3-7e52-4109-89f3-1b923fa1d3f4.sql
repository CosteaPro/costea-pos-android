ALTER TABLE public.cash_closures
  ADD COLUMN IF NOT EXISTS closure_type text NOT NULL DEFAULT 'cuadre',
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_by uuid,
  ADD COLUMN IF NOT EXISTS reopened_by_email text;

CREATE OR REPLACE FUNCTION public.ec_business_date()
RETURNS date LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (now() AT TIME ZONE 'America/Guayaquil')::date;
$$;

CREATE OR REPLACE FUNCTION public.day_is_locked()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cash_closures c
    WHERE c.closure_type = 'cierre'
      AND c.reopened_at IS NULL
      AND c.business_date = public.ec_business_date()
  );
$$;

GRANT EXECUTE ON FUNCTION public.day_is_locked() TO authenticated;

CREATE OR REPLACE FUNCTION public.next_order_folio()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(MAX(o.folio), 0) + 1
  FROM public.orders o
  WHERE o.created_at >= GREATEST(
    (public.ec_business_date()::timestamp AT TIME ZONE 'America/Guayaquil'),
    COALESCE((
      SELECT MAX(c.created_at) FROM public.cash_closures c
      WHERE c.closure_type = 'cierre'
        AND c.business_date = public.ec_business_date()
    ), '-infinity'::timestamptz)
  );
$$;

CREATE OR REPLACE FUNCTION public.set_order_folio()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.folio := public.next_order_folio();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS orders_set_folio ON public.orders;
CREATE TRIGGER orders_set_folio BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_folio();

CREATE OR REPLACE FUNCTION public.enforce_day_lock()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.day_is_locked() THEN
    RAISE EXCEPTION 'La caja de hoy tiene un cierre definitivo. Se requiere autorizacion del Administrador para reabrir el dia.';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS orders_day_lock ON public.orders;
CREATE TRIGGER orders_day_lock BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_day_lock();

DROP TRIGGER IF EXISTS order_items_day_lock ON public.order_items;
CREATE TRIGGER order_items_day_lock BEFORE INSERT OR UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_day_lock();

CREATE OR REPLACE FUNCTION public.protect_final_closure()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.closure_type = 'cierre' THEN
    IF (to_jsonb(NEW) - 'reopened_at' - 'reopened_by' - 'reopened_by_email' - 'updated_at')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'reopened_at' - 'reopened_by' - 'reopened_by_email' - 'updated_at') THEN
      RAISE EXCEPTION 'Un cierre definitivo de caja no puede modificarse.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS cash_closures_protect ON public.cash_closures;
CREATE TRIGGER cash_closures_protect BEFORE UPDATE ON public.cash_closures
  FOR EACH ROW EXECUTE FUNCTION public.protect_final_closure();