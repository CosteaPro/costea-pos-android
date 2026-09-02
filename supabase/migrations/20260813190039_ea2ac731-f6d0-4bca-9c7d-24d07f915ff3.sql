ALTER FUNCTION public.apply_sales_consumption(uuid) SECURITY DEFINER;
ALTER FUNCTION public.recalc_sales_consumption(date) SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.apply_sales_consumption(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalc_sales_consumption(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_sales_consumption(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalc_sales_consumption(date) TO authenticated, service_role;