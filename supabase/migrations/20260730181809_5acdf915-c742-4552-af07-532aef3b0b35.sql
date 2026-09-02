ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS operation_mode text NOT NULL DEFAULT 'restaurante',
  ADD COLUMN IF NOT EXISTS setup_completed boolean NOT NULL DEFAULT false;

ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_operation_mode_check
  CHECK (operation_mode IN ('restaurante','rapida'));