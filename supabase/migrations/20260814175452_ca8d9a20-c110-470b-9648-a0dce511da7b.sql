ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS printer_copies integer NOT NULL DEFAULT 2;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS tax_regime text;