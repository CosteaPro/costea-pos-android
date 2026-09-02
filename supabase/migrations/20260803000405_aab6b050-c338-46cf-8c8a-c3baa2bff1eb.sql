REVOKE ALL ON FUNCTION public.next_order_folio() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_order_folio() TO service_role;