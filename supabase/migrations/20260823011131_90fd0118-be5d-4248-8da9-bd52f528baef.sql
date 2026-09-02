-- Permite la transferencia controlada del Propietario del sistema.
-- El disparador sigue bloqueando cualquier cambio directo, salvo cuando la
-- transferencia se ejecuta dentro de la función dedicada (bandera de sesión).
CREATE OR REPLACE FUNCTION public.protect_owner_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer boolean := COALESCE(current_setting('costea.owner_transfer', true) = 'on', false);
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_owner AND NOT v_transfer THEN
      RAISE EXCEPTION 'No se puede quitar el rol del Propietario del sistema.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_owner AND NOT v_transfer
     AND (NEW.role IS DISTINCT FROM 'administrador'::app_role OR NOT NEW.is_owner) THEN
    RAISE EXCEPTION 'El Propietario del sistema siempre es Super Administrador.';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.is_owner AND NOT v_transfer
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE is_owner) THEN
    RAISE EXCEPTION 'Ya existe un Propietario del sistema.';
  END IF;

  RETURN NEW;
END;
$$;

-- Traspasa la propiedad de forma atómica al usuario indicado.
CREATE OR REPLACE FUNCTION public.transfer_system_ownership(_current_owner uuid, _target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF _target_user_id IS NULL OR _current_owner IS NULL THEN
    RAISE EXCEPTION 'Usuario no válido para la transferencia.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('claim_system_ownership'));

  SELECT user_id INTO v_owner FROM public.user_roles WHERE is_owner LIMIT 1;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'No hay un Propietario registrado.';
  END IF;

  IF v_owner <> _current_owner THEN
    RAISE EXCEPTION 'Solo el Propietario actual puede transferir la propiedad.';
  END IF;

  IF v_owner = _target_user_id THEN
    RETURN true;
  END IF;

  PERFORM set_config('costea.owner_transfer', 'on', true);

  -- La cuenta anterior conserva acceso administrativo, sin configuración crítica.
  UPDATE public.user_roles
     SET is_owner = false, role = 'admin_operativo'::app_role
   WHERE user_id = v_owner AND is_owner;

  DELETE FROM public.user_roles WHERE user_id = _target_user_id;

  INSERT INTO public.user_roles (user_id, role, is_owner)
  VALUES (_target_user_id, 'administrador'::app_role, true);

  PERFORM set_config('costea.owner_transfer', 'off', true);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_system_ownership(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_system_ownership(uuid, uuid) TO service_role;