REVOKE ALL ON FUNCTION public.recalc_inventory_period(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_inventory_period(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_inventory_period(date, date) TO service_role;
REVOKE ALL ON FUNCTION public.recalc_sales_consumption(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_sales_consumption(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_sales_consumption(date) TO service_role;