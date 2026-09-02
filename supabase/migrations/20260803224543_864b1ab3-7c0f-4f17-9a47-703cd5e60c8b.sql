CREATE OR REPLACE FUNCTION public.resync_sequences()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nv bigint;
  v_prod bigint;
  v_sup bigint;
  v_inv bigint;
  v_fact integer;
BEGIN
  IF NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo el Administrador puede reanudar la numeracion.';
  END IF;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(doc_number, '\D', '', 'g'), ''))::bigint, 0)
    INTO v_nv FROM public.orders WHERE doc_number LIKE 'NV-%';
  PERFORM setval('public.sale_note_seq', GREATEST(v_nv, 1), true);

  SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '\D', '', 'g'), ''))::bigint, 0)
    INTO v_prod FROM public.products;
  PERFORM setval('public.product_code_seq', GREATEST(v_prod, 1), true);

  SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '\D', '', 'g'), ''))::bigint, 0)
    INTO v_sup FROM public.suppliers;
  PERFORM setval('public.supplier_code_seq', GREATEST(v_sup, 1), true);

  SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '\D', '', 'g'), ''))::bigint, 0)
    INTO v_inv FROM public.inventory_items;
  PERFORM setval('public.inventory_code_seq', GREATEST(v_inv, 1), true);

  SELECT COALESCE(MAX(NULLIF(regexp_replace(split_part(doc_number, '-', 3), '\D', '', 'g'), ''))::integer, 0)
    INTO v_fact FROM public.orders WHERE doc_type = 'factura';
  UPDATE public.company_settings
     SET next_sequential = GREATEST(COALESCE(next_sequential, 1), v_fact + 1),
         updated_at = now();

  RETURN jsonb_build_object(
    'nota_venta', v_nv, 'producto', v_prod, 'proveedor', v_sup,
    'inventario', v_inv, 'factura', v_fact
  );
END; $function$;

REVOKE ALL ON FUNCTION public.resync_sequences() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resync_sequences() TO authenticated;