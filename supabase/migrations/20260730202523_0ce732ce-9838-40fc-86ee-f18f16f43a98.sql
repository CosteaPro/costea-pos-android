ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS monthly_goal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS printer_kitchen text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS printer_grill text NOT NULL DEFAULT '';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS print_area text NOT NULL DEFAULT 'cocina';

CREATE SEQUENCE IF NOT EXISTS public.product_code_seq;

CREATE OR REPLACE FUNCTION public.set_product_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    LOOP
      NEW.code := 'P' || lpad(nextval('public.product_code_seq')::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.products WHERE code = NEW.code);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_set_code ON public.products;
CREATE TRIGGER products_set_code
BEFORE INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_product_code();

UPDATE public.products p
SET code = 'P' || lpad(nextval('public.product_code_seq')::text, 4, '0')
WHERE p.code IS NULL OR btrim(p.code) = '';

CREATE UNIQUE INDEX IF NOT EXISTS products_code_unique ON public.products (code) WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.company_signature (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  p12_path text,
  p12_password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_signature TO authenticated;
GRANT ALL ON public.company_signature TO service_role;

ALTER TABLE public.company_signature ENABLE ROW LEVEL SECURITY;

CREATE POLICY signature_admin_select ON public.company_signature
  FOR SELECT TO authenticated USING (public.is_admin_or_first(auth.uid()));
CREATE POLICY signature_admin_insert ON public.company_signature
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_first(auth.uid()));
CREATE POLICY signature_admin_update ON public.company_signature
  FOR UPDATE TO authenticated USING (public.is_admin_or_first(auth.uid())) WITH CHECK (public.is_admin_or_first(auth.uid()));
CREATE POLICY signature_admin_delete ON public.company_signature
  FOR DELETE TO authenticated USING (public.is_admin_or_first(auth.uid()));

CREATE TRIGGER company_signature_updated_at
BEFORE UPDATE ON public.company_signature
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY firmas_admin_all ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'firmas' AND public.is_admin_or_first(auth.uid()))
  WITH CHECK (bucket_id = 'firmas' AND public.is_admin_or_first(auth.uid()));