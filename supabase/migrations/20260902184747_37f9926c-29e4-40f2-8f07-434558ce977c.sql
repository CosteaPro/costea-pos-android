-- 1) La propiedad es por empresa, no global
DROP INDEX IF EXISTS public.user_roles_single_owner;
CREATE UNIQUE INDEX user_roles_single_owner_por_empresa
  ON public.user_roles (company_id) WHERE is_owner;

CREATE OR REPLACE FUNCTION public.protect_owner_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer boolean := COALESCE(current_setting('costea.owner_transfer', true) = 'on', false);
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_owner AND NOT v_transfer THEN
      RAISE EXCEPTION 'No se puede quitar el rol del Propietario de la empresa.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_owner AND NOT v_transfer
     AND (NEW.role IS DISTINCT FROM 'administrador'::app_role OR NOT NEW.is_owner) THEN
    RAISE EXCEPTION 'El Propietario de la empresa siempre es Super Administrador.';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.is_owner AND NOT v_transfer
     AND EXISTS (
       SELECT 1 FROM public.user_roles
        WHERE is_owner AND company_id IS NOT DISTINCT FROM NEW.company_id
     ) THEN
    RAISE EXCEPTION 'Ya existe un Propietario para esta empresa.';
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Reparación al ingresar: el dueño de la empresa siempre recibe su rol
CREATE OR REPLACE FUNCTION public.claim_system_ownership_for(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_es_dueno boolean;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('claim_system_ownership'));

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id) THEN
    RETURN false;
  END IF;

  SELECT cu.company_id, cu.is_company_owner
    INTO v_company, v_es_dueno
    FROM public.company_users cu
   WHERE cu.user_id = _user_id AND cu.active AND cu.deleted_at IS NULL
   LIMIT 1;

  -- Dueño registrado de su empresa: recibe SúperAdministrador Propietario.
  IF COALESCE(v_es_dueno, false)
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE is_owner AND company_id = v_company) THEN
    INSERT INTO public.user_roles (user_id, role, is_owner, company_id)
    VALUES (_user_id, 'administrador', true, v_company)
    ON CONFLICT DO NOTHING;
    RETURN true;
  END IF;

  -- Arranque inicial del sistema (base sin ningún rol).
  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    INSERT INTO public.user_roles (user_id, role, is_owner, company_id)
    VALUES (_user_id, 'administrador', true, v_company)
    ON CONFLICT DO NOTHING;
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_system_ownership()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.claim_system_ownership_for(auth.uid());
$function$;

-- 3) Transferencia de propiedad dentro de la misma empresa
CREATE OR REPLACE FUNCTION public.transfer_system_ownership(_current_owner uuid, _target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_owner uuid;
  v_target_company uuid;
BEGIN
  IF _target_user_id IS NULL OR _current_owner IS NULL THEN
    RAISE EXCEPTION 'Usuario no válido para la transferencia.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('claim_system_ownership'));

  SELECT company_id INTO v_company
    FROM public.user_roles
   WHERE user_id = _current_owner AND is_owner
   LIMIT 1;

  IF v_company IS NULL AND NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _current_owner AND is_owner) THEN
    RAISE EXCEPTION 'Solo el Propietario actual puede transferir la propiedad.';
  END IF;

  SELECT user_id INTO v_owner
    FROM public.user_roles
   WHERE is_owner AND company_id IS NOT DISTINCT FROM v_company
   LIMIT 1;

  IF v_owner IS NULL OR v_owner <> _current_owner THEN
    RAISE EXCEPTION 'Solo el Propietario actual puede transferir la propiedad.';
  END IF;

  IF v_owner = _target_user_id THEN
    RETURN true;
  END IF;

  SELECT company_id INTO v_target_company
    FROM public.company_users
   WHERE user_id = _target_user_id AND active AND deleted_at IS NULL
   LIMIT 1;

  IF v_company IS NOT NULL AND v_target_company IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'El nuevo Propietario debe pertenecer a la misma empresa.';
  END IF;

  PERFORM set_config('costea.owner_transfer', 'on', true);

  UPDATE public.user_roles
     SET is_owner = false, role = 'admin_operativo'::app_role
   WHERE user_id = v_owner AND is_owner;

  DELETE FROM public.user_roles WHERE user_id = _target_user_id;

  INSERT INTO public.user_roles (user_id, role, is_owner, company_id)
  VALUES (_target_user_id, 'administrador'::app_role, true, v_company);

  PERFORM set_config('costea.owner_transfer', 'off', true);

  RETURN true;
END;
$function$;

-- 4) Reparar dueños ya creados que quedaron sin rol
INSERT INTO public.user_roles (user_id, role, is_owner, company_id)
SELECT cu.user_id, 'administrador'::app_role, true, cu.company_id
  FROM public.company_users cu
 WHERE cu.is_company_owner AND cu.active AND cu.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = cu.user_id)
   AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.is_owner AND r.company_id = cu.company_id);