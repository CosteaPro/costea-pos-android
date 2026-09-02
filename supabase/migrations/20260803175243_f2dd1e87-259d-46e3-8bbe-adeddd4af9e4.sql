CREATE SEQUENCE IF NOT EXISTS public.sale_note_seq START WITH 1;

SELECT setval('public.sale_note_seq', GREATEST(
  COALESCE((SELECT MAX(NULLIF(regexp_replace(doc_number, '^NV-', ''), '')::bigint)
            FROM public.orders
            WHERE doc_number ~ '^NV-[0-9]+$'), 0), 1), true);

CREATE OR REPLACE FUNCTION public.next_sale_note_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num bigint;
  v_doc text;
BEGIN
  LOOP
    v_num := nextval('public.sale_note_seq');
    v_doc := 'NV-' || lpad(v_num::text, 8, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders WHERE doc_number = v_doc);
  END LOOP;
  RETURN v_doc;
END;
$$;

REVOKE ALL ON FUNCTION public.next_sale_note_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_sale_note_number() TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.sale_note_seq TO authenticated, service_role;