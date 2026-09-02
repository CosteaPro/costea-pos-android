REVOKE EXECUTE ON FUNCTION public.consume_inventory_recipe(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_inventory_recipe(uuid, numeric) TO service_role;