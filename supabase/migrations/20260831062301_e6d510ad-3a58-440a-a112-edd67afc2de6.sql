DROP INDEX IF EXISTS public.recipes_code_key;
ALTER TABLE public.recipes DROP CONSTRAINT IF EXISTS recipes_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS recipes_code_empresa ON public.recipes USING btree (company_id, code) WHERE (code IS NOT NULL);