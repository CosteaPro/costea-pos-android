CREATE OR REPLACE FUNCTION public.ensure_company_settings()
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
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