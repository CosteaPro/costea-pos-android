GRANT SELECT, INSERT, UPDATE ON TABLE public.company_settings TO authenticated;
GRANT ALL ON TABLE public.company_settings TO service_role;

DROP POLICY IF EXISTS company_select_auth ON public.company_settings;
DROP POLICY IF EXISTS company_select_staff ON public.company_settings;
DROP POLICY IF EXISTS company_admin_insert ON public.company_settings;
DROP POLICY IF EXISTS company_admin_update ON public.company_settings;

CREATE POLICY company_select_staff
ON public.company_settings
FOR SELECT
TO authenticated
USING (private.is_staff(auth.uid()));

CREATE POLICY company_admin_insert
ON public.company_settings
FOR INSERT
TO authenticated
WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY company_admin_update
ON public.company_settings
FOR UPDATE
TO authenticated
USING (private.is_admin(auth.uid()))
WITH CHECK (private.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.ensure_company_settings()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el administrador puede crear la configuración de empresa'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ensure_company_settings'));

  SELECT id
  INTO v_id
  FROM public.company_settings
  ORDER BY created_at, id
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.company_settings DEFAULT VALUES
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_company_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_company_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_company_settings() TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_company_settings_for_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'administrador'::public.app_role THEN
    PERFORM pg_advisory_xact_lock(hashtext('ensure_company_settings'));
    IF NOT EXISTS (SELECT 1 FROM public.company_settings) THEN
      INSERT INTO public.company_settings DEFAULT VALUES;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_company_settings_for_admin_role() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_company_settings_for_admin_role() TO service_role;

DROP TRIGGER IF EXISTS ensure_company_settings_after_admin_role ON public.user_roles;
CREATE TRIGGER ensure_company_settings_after_admin_role
AFTER INSERT OR UPDATE OF role ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.ensure_company_settings_for_admin_role();