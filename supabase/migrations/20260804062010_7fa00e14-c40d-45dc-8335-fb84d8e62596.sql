ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_single_owner ON public.user_roles (is_owner) WHERE is_owner;

CREATE OR REPLACE FUNCTION public.claim_system_ownership()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles) THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_roles (user_id, role, is_owner)
  VALUES (v_uid, 'administrador', true)
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_system_ownership() TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_owner_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_owner THEN
      RAISE EXCEPTION 'No se puede quitar el rol del Propietario del sistema.';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_owner AND (NEW.role IS DISTINCT FROM 'administrador'::app_role OR NOT NEW.is_owner) THEN
    RAISE EXCEPTION 'El Propietario del sistema siempre es Super Administrador.';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.is_owner AND EXISTS (SELECT 1 FROM public.user_roles WHERE is_owner) THEN
    RAISE EXCEPTION 'Ya existe un Propietario del sistema.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_protect_owner ON public.user_roles;
CREATE TRIGGER user_roles_protect_owner
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_owner_role();

UPDATE public.user_roles r
SET is_owner = true
WHERE r.role = 'administrador'
  AND NOT EXISTS (SELECT 1 FROM public.user_roles o WHERE o.is_owner)
  AND r.id = (SELECT id FROM public.user_roles WHERE role = 'administrador' ORDER BY created_at LIMIT 1);