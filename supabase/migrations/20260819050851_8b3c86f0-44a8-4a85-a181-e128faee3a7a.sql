CREATE TABLE IF NOT EXISTS public.notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_bot_token text,
  telegram_chat_id text,
  alert_order_ready boolean NOT NULL DEFAULT false,
  alert_cash_closure boolean NOT NULL DEFAULT false,
  alert_low_stock boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_settings TO authenticated;
GRANT ALL ON public.notification_settings TO service_role;

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo superadministrador puede leer notificaciones"
  ON public.notification_settings
  FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'administrador'::public.app_role));

CREATE POLICY "Solo superadministrador puede modificar notificaciones"
  ON public.notification_settings
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'administrador'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'administrador'::public.app_role));

INSERT INTO public.notification_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.notification_settings);
