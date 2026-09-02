DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.day_is_locked() TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_sales_consumption(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_sales_consumption(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_production_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_inventory_movement(uuid, uuid, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_inventory_movement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_physical_count_as_opening(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_document_sequence_block(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_movements(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_system_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ec_business_date() TO authenticated;
GRANT EXECUTE ON FUNCTION public.movement_stock_delta(public.inventory_movement_type, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unit_convert_factor(text, text) TO authenticated;