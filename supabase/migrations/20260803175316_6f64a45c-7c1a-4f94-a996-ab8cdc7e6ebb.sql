REVOKE EXECUTE ON FUNCTION public.next_sale_note_number() FROM authenticated;
REVOKE USAGE, SELECT ON SEQUENCE public.sale_note_seq FROM authenticated;