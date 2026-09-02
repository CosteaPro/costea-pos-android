REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_first(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.next_invoice_sequential() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_first(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_invoice_sequential() TO authenticated, service_role;