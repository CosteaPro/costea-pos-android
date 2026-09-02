GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.day_is_locked() TO authenticated;

INSERT INTO public.user_roles (user_id, role)
SELECT '803cd856-7859-47fc-bbde-aea373190320'::uuid, 'administrador'::public.app_role
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id = '803cd856-7859-47fc-bbde-aea373190320'::uuid
    AND role = 'administrador'::public.app_role
);