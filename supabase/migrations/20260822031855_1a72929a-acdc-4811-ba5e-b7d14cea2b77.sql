CREATE TABLE public.company_settings_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  user_id uuid,
  user_email text NOT NULL DEFAULT '',
  user_role text NOT NULL DEFAULT '',
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.company_settings_audit TO authenticated;
GRANT ALL ON public.company_settings_audit TO service_role;

ALTER TABLE public.company_settings_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_settings_audit_select ON public.company_settings_audit
  FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()));

CREATE INDEX company_settings_audit_created_at_idx
  ON public.company_settings_audit (created_at DESC);

CREATE TRIGGER company_settings_audit_updated_at
  BEFORE UPDATE ON public.company_settings_audit
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();