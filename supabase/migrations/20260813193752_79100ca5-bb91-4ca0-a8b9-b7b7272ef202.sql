ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS control_frequency text NOT NULL DEFAULT 'diario';

ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_control_frequency_check
  CHECK (control_frequency IN ('diario','mensual'));