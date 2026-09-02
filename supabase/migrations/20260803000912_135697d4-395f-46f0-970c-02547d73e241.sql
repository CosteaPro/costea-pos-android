
-- 1) Move privileged logic into private schema; expose invoker-only wrapper
CREATE OR REPLACE FUNCTION private.day_is_locked()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cash_closures c
    WHERE c.closure_type = 'cierre'
      AND c.reopened_at IS NULL
      AND c.business_date = public.ec_business_date()
  );
$$;

REVOKE ALL ON FUNCTION private.day_is_locked() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.day_is_locked() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.day_is_locked()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT private.day_is_locked();
$$;

REVOKE ALL ON FUNCTION public.day_is_locked() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.day_is_locked() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_day_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF private.day_is_locked() THEN
    RAISE EXCEPTION 'La caja de hoy tiene un cierre definitivo. Se requiere autorizacion del Administrador para reabrir el dia.';
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.enforce_day_lock() FROM PUBLIC, anon, authenticated;

-- 2) Only admins may reopen a closure
CREATE OR REPLACE FUNCTION public.protect_reopen_admin_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.reopened_at IS DISTINCT FROM OLD.reopened_at
      OR NEW.reopened_by IS DISTINCT FROM OLD.reopened_by
      OR NEW.reopened_by_email IS DISTINCT FROM OLD.reopened_by_email)
     AND NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Administrador puede reabrir un cierre de caja.';
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.protect_reopen_admin_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cash_closures_protect_reopen ON public.cash_closures;
CREATE TRIGGER cash_closures_protect_reopen
BEFORE UPDATE ON public.cash_closures
FOR EACH ROW EXECUTE FUNCTION public.protect_reopen_admin_only();
