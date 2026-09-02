ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS kitchen_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS prep_limit_minutes integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS prep_limit_mesa integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prep_limit_llevar integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prep_limit_domicilio integer NOT NULL DEFAULT 0;

UPDATE public.orders
   SET kitchen_sent_at = COALESCE(kitchen_sent_at, created_at)
 WHERE status IN ('en_cocina','listo');

UPDATE public.orders
   SET delivered_at = COALESCE(delivered_at, paid_at, updated_at)
 WHERE status IN ('pagado','cancelado');