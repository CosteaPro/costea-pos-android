REVOKE ALL ON FUNCTION public.close_inventory_day(date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_inventory_day(date, text) TO service_role;
REVOKE ALL ON FUNCTION public.apply_inventory_movement() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_inventory_movement() TO service_role;