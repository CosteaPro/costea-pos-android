
-- Nueva versión: recibe el usuario explícitamente y solo la puede ejecutar el servidor
CREATE OR REPLACE FUNCTION public.claim_system_ownership_for(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('claim_system_ownership'));

  IF EXISTS (SELECT 1 FROM public.user_roles) THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_roles (user_id, role, is_owner)
  VALUES (_user_id, 'administrador', true)
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_system_ownership_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_system_ownership_for(uuid) TO service_role;

-- La versión antigua ya no debe ser invocable por clientes autenticados
REVOKE ALL ON FUNCTION public.claim_system_ownership() FROM PUBLIC, anon, authenticated;
