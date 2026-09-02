-- 1) company_signature: never expose p12_password through the API
REVOKE SELECT ON public.company_signature FROM authenticated;
GRANT SELECT (id, p12_path, created_at, updated_at) ON public.company_signature TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.company_signature TO authenticated;
GRANT ALL ON public.company_signature TO service_role;

-- 2) harden claim_system_ownership against races / anonymous callers
CREATE OR REPLACE FUNCTION public.claim_system_ownership()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- serialize concurrent bootstrap attempts
  PERFORM pg_advisory_xact_lock(hashtext('claim_system_ownership'));

  IF EXISTS (SELECT 1 FROM public.user_roles) THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_roles (user_id, role, is_owner)
  VALUES (v_uid, 'administrador', true)
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_system_ownership() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_system_ownership() TO authenticated;