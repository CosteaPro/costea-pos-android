ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS chat_id_owner text,
  ADD COLUMN IF NOT EXISTS chat_id_admin text,
  ADD COLUMN IF NOT EXISTS chat_id_inventory text,
  ADD COLUMN IF NOT EXISTS chat_id_kitchen text;

CREATE TABLE IF NOT EXISTS public.dashboard_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind text NOT NULL,
  title text NOT NULL,
  detail text NOT NULL DEFAULT '',
  target_role text NOT NULL DEFAULT 'admin',
  target_chat_id text,
  status text NOT NULL DEFAULT 'enviado',
  telegram_message_id bigint,
  evidence_url text,
  response_note text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.dashboard_actions TO authenticated;
GRANT ALL ON public.dashboard_actions TO service_role;

ALTER TABLE public.dashboard_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dashboard_actions_select" ON public.dashboard_actions;
CREATE POLICY "dashboard_actions_select" ON public.dashboard_actions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "dashboard_actions_insert" ON public.dashboard_actions;
CREATE POLICY "dashboard_actions_insert" ON public.dashboard_actions
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "dashboard_actions_update" ON public.dashboard_actions;
CREATE POLICY "dashboard_actions_update" ON public.dashboard_actions
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_dashboard_actions_updated_at ON public.dashboard_actions;
CREATE TRIGGER update_dashboard_actions_updated_at
  BEFORE UPDATE ON public.dashboard_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();