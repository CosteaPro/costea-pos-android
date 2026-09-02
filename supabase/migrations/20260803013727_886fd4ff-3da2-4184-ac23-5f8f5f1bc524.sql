REVOKE ALL ON FUNCTION public.consume_inventory_recipe(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_inventory_recipe(uuid, numeric) TO authenticated;