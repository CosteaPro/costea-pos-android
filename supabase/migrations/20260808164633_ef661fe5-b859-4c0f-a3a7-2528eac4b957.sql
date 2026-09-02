CREATE TABLE public.login_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  device_id text NOT NULL,
  device_label text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  ip text,
  city text,
  country text,
  is_new_device boolean NOT NULL DEFAULT false,
  is_new_location boolean NOT NULL DEFAULT false,
  concurrent boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'activa',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revoked_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX login_sessions_user_idx ON public.login_sessions (user_id, created_at DESC);
CREATE INDEX login_sessions_created_idx ON public.login_sessions (created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.login_sessions TO authenticated;
GRANT ALL ON public.login_sessions TO service_role;

ALTER TABLE public.login_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Propietario ve todos los accesos"
  ON public.login_sessions FOR SELECT TO authenticated
  USING (public.is_system_owner(auth.uid()) OR user_id = auth.uid());

CREATE POLICY "Cada usuario registra su acceso"
  ON public.login_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Propietario o dueno actualiza el acceso"
  ON public.login_sessions FOR UPDATE TO authenticated
  USING (public.is_system_owner(auth.uid()) OR user_id = auth.uid())
  WITH CHECK (public.is_system_owner(auth.uid()) OR user_id = auth.uid());

CREATE TRIGGER login_sessions_updated_at
  BEFORE UPDATE ON public.login_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();