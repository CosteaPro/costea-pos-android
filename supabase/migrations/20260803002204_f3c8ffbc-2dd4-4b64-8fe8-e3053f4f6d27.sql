-- El disparador que asigna el folio llamaba a next_order_folio() como usuario final,
-- pero esa función solo puede ejecutarla el rol de servicio -> "permission denied".
CREATE OR REPLACE FUNCTION public.set_order_folio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.folio := public.next_order_folio();
  RETURN NEW;
END; $function$;

-- El código automático de producto usa una secuencia; se asegura como definer también.
CREATE OR REPLACE FUNCTION public.set_product_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    LOOP
      NEW.code := 'P' || lpad(nextval('public.product_code_seq')::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.products WHERE code = NEW.code);
    END LOOP;
  END IF;
  RETURN NEW;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.set_order_folio() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_product_code() FROM PUBLIC, anon, authenticated;