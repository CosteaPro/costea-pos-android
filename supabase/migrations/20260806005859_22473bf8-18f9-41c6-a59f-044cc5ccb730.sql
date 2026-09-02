REVOKE ALL ON FUNCTION public.is_system_owner(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_system_owner(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.protect_deleted_item_code() FROM PUBLIC, anon, authenticated;