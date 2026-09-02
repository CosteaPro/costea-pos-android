CREATE OR REPLACE FUNCTION public.set_recipe_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix text;
  v_pcode text;
BEGIN
  -- Regla de oro: el codigo de venta del producto es la identidad.
  IF NEW.kind <> 'subreceta' AND NEW.product_id IS NOT NULL THEN
    SELECT code INTO v_pcode FROM public.products WHERE id = NEW.product_id;
    IF v_pcode IS NOT NULL AND btrim(v_pcode) <> '' THEN
      NEW.code := v_pcode;
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    v_prefix := CASE WHEN NEW.kind = 'subreceta' THEN 'SR' ELSE 'RC' END;
    LOOP
      NEW.code := v_prefix || lpad(nextval('public.recipe_code_seq')::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.recipes WHERE code = NEW.code);
    END LOOP;
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS recipes_set_code_upd ON public.recipes;
CREATE TRIGGER recipes_set_code_upd
BEFORE UPDATE ON public.recipes
FOR EACH ROW EXECUTE FUNCTION public.set_recipe_code();

UPDATE public.recipes r
   SET code = p.code
  FROM public.products p
 WHERE r.product_id = p.id
   AND r.kind <> 'subreceta'
   AND p.code IS NOT NULL
   AND r.code IS DISTINCT FROM p.code;