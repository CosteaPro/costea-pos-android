REVOKE ALL ON FUNCTION public.next_order_folio() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.day_is_locked() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.day_is_locked() TO authenticated;