REVOKE ALL ON FUNCTION public.recalc_inventory_period(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_inventory_period(date, date) TO authenticated, service_role;