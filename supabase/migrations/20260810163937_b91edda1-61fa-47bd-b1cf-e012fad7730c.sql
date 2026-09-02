REVOKE EXECUTE ON FUNCTION public.apply_physical_count_as_opening(date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.apply_physical_count_as_opening(date) TO authenticated, service_role;